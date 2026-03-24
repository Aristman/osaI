/**
 * @osai/agent -- AgentRuntime
 *
 * Core agent loop: intake -> context_assembly -> model_inference ->
 * tool_execution -> persistence -> hooks.
 *
 * Coordinates HookManager, ModelResolver, SkillRegistry,
 * ContextAssembler, ErrorHandler, SessionRepository, and SessionPruner.
 *
 * @module AgentRuntime
 */

import type {
  AgentConfig,
  AgentMessage,
  AgentResponse,
  ModelMessage,
  ModelResponse,
  ToolSchema,
  ToolCall,
  ToolResult,
  ModelOptions,
  HookPoint,
  HookHandler,
} from './types.js';
import { HookManager } from './hooks/HookManager.js';
import { ModelResolver } from './model/ModelResolver.js';
import type { ModelProviderConfig } from './model/ModelResolver.js';
import { SkillRegistry } from './skills/SkillRegistry.js';
import { ContextAssembler } from './context/ContextAssembler.js';
import { ErrorHandler } from './errors/ErrorHandler.js';
import { SessionRepository } from './persistence/SessionRepository.js';
import { SessionPruner } from './pruning/SessionPruner.js';

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

export interface AgentRuntimeDeps {
  config: AgentConfig;
  hookManager?: HookManager;
  modelResolver?: ModelResolver;
  skillRegistry?: SkillRegistry;
  contextAssembler?: ContextAssembler;
  errorHandler?: ErrorHandler;
  sessionRepository?: SessionRepository;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of tool-call iterations before forcing stop. */
const MAX_TOOL_ITERATIONS = 10;

/** Maximum total tokens for context window. */
const DEFAULT_MAX_TOKENS = 128_000;

// ---------------------------------------------------------------------------
// AgentRuntime
// ---------------------------------------------------------------------------

export class AgentRuntime {
  private config: AgentConfig;
  private hookManager: HookManager;
  private modelResolver: ModelResolver;
  private skillRegistry: SkillRegistry;
  private contextAssembler: ContextAssembler;
  private errorHandler: ErrorHandler;
  private sessionRepository?: SessionRepository;
  private sessionPruner: SessionPruner;

  constructor(deps: AgentRuntimeDeps) {
    this.config = deps.config;

    this.hookManager = deps.hookManager ?? new HookManager();
    this.errorHandler = deps.errorHandler ?? new ErrorHandler();
    this.skillRegistry = deps.skillRegistry ?? new SkillRegistry();
    this.modelResolver = deps.modelResolver ?? this.createModelResolver();
    this.contextAssembler =
      deps.contextAssembler ??
      new ContextAssembler(this.skillRegistry, this.hookManager);

    this.sessionRepository = deps.sessionRepository;
    this.sessionPruner = new SessionPruner(
      this.config.session?.maxTokens ?? DEFAULT_MAX_TOKENS,
    );

    // Wire ErrorHandler to HookManager
    this.errorHandler.setHookManager(this.hookManager);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Main entry point -- process a user message and return an agent response.
   *
   * Orchestrates the full agent loop:
   * 1. before_agent_start hook
   * 2. Load session history
   * 3. Context assembly (with before_prompt_build hook inside)
   * 4. Model inference (with tool execution loop)
   * 5. Persist response
   * 6. agent_end hook
   * 7. Return AgentResponse
   */
  async processMessage(
    message: AgentMessage,
    sessionId: string,
  ): Promise<AgentResponse> {
    // before_agent_start hook
    const startContext = await this.hookManager.executeHooks(
      'before_agent_start',
      {
        hookPoint: 'before_agent_start',
        sessionId,
        data: { message },
        abort: false,
      },
    );

    if (startContext.abort) {
      return {
        id: this.generateId(),
        sessionId,
        content: '',
        timestamp: new Date(),
      };
    }

    // Handle empty messages gracefully
    if (!message.content || message.content.trim().length === 0) {
      return {
        id: this.generateId(),
        sessionId,
        content: 'I received an empty message. How can I help you?',
        timestamp: new Date(),
      };
    }

    try {
      return await this.runAgentLoop(sessionId, message);
    } catch (error) {
      await this.errorHandler.handle(error, sessionId);

      return {
        id: this.generateId(),
        sessionId,
        content: `An error occurred: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      };
    }
  }

  // -----------------------------------------------------------------------
  // Hook registration shortcuts
  // -----------------------------------------------------------------------

  registerHook(
    hookPoint: HookPoint,
    handler: HookHandler,
    priority?: number,
  ): string {
    return this.hookManager.registerHook(hookPoint, handler, priority);
  }

  unregisterHook(hookPoint: HookPoint, handlerId: string): boolean {
    return this.hookManager.unregisterHook(hookPoint, handlerId);
  }

  // -----------------------------------------------------------------------
  // Skills management
  // -----------------------------------------------------------------------

  async loadSkills(
    _skillsConfig: Array<{ name: string; path: string }>,
  ): Promise<void> {
    // Skills loading is delegated to external loader.
    // This method is a placeholder for integration with SkillLoader.
    // Currently a no-op; skills must be registered directly via SkillRegistry.
  }

  getToolSchemas(): ToolSchema[] {
    return this.skillRegistry.getToolSchemas();
  }

  // -----------------------------------------------------------------------
  // Tool execution (public entry point)
  // -----------------------------------------------------------------------

  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    sessionId: string,
  ): Promise<ToolResult> {
    const toolCall: ToolCall = {
      id: this.generateId(),
      name: toolName,
      parameters: params,
    };

    return this.executeToolCall(toolCall, sessionId);
  }

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------

  async getSessionHistory(sessionId: string): Promise<AgentMessage[]> {
    if (!this.sessionRepository) {
      return [];
    }

    try {
      return this.sessionRepository.getMessages(sessionId);
    } catch {
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  getConfig(): AgentConfig {
    return this.config;
  }

  getActiveModel() {
    return this.modelResolver.getActiveModel();
  }

  // -----------------------------------------------------------------------
  // Internal: Agent Loop
  // -----------------------------------------------------------------------

  private async runAgentLoop(
    sessionId: string,
    userMessage: AgentMessage,
  ): Promise<AgentResponse> {
    // 2. Load session history
    let history = await this.getSessionHistory(sessionId);

    // Add user message to history
    const userMsg: AgentMessage = {
      ...userMessage,
      id: userMessage.id || this.generateId(),
      timestamp: userMessage.timestamp || new Date(),
    };
    history = [...history, userMsg];

    // Persist user message
    if (this.sessionRepository) {
      try {
        if (!this.sessionRepository.sessionExists(sessionId)) {
          this.sessionRepository.saveSession(sessionId, 'processing');
        } else {
          this.sessionRepository.updateSessionState(sessionId, 'processing');
        }
        this.sessionRepository.saveMessage(sessionId, userMsg);
      } catch {
        // Persistence failures should not crash the loop
      }
    }

    // 3. Context assembly
    let assembled = await this.contextAssembler.assemble(sessionId, history);

    // Apply pruning if needed
    if (this.sessionPruner.needsPruning(assembled.history)) {
      assembled.history = this.sessionPruner.prune(assembled.history);
    }

    // Build initial model messages
    let modelMessages: ModelMessage[] = [
      { role: 'system', content: assembled.systemPrompt },
      ...assembled.history,
    ];

    const toolSchemas = assembled.toolSchemas;

    let finalResponse: ModelResponse | null = null;
    let iterations = 0;

    // 5-7. Model inference + tool execution loop
    while (iterations < MAX_TOOL_ITERATIONS) {
      // 5. Model inference
      const response = await this.modelInference(
        modelMessages,
        sessionId,
        toolSchemas.length > 0
          ? { tools: toolSchemas }
          : undefined,
      );
      finalResponse = response;

      // If finish_reason is stop or length, we're done
      if (response.finishReason === 'stop' || response.finishReason === 'length') {
        break;
      }

      // 6. If model returned tool_calls, execute them
      if (response.finishReason === 'tool_calls' && response.toolCalls && response.toolCalls.length > 0) {
        // Add assistant message with tool_calls to conversation
        modelMessages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        });

        // Execute each tool call and add results
        for (const toolCall of response.toolCalls) {
          const toolResult = await this.executeToolCall(toolCall, sessionId);

          modelMessages.push({
            role: 'tool',
            content: toolResult.success
              ? (toolResult.output ?? '')
              : (toolResult.error ?? 'Tool execution failed'),
            toolCallId: toolCall.id,
          });
        }
      } else {
        break;
      }

      iterations++;
    }

    // 8. Build and save response
    const responseContent = finalResponse?.content ?? '';
    const assistantMessage: AgentMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: responseContent,
      timestamp: new Date(),
      metadata: finalResponse?.toolCalls
        ? { toolCalls: finalResponse.toolCalls }
        : undefined,
    };

    // Save assistant message to persistence
    if (this.sessionRepository) {
      try {
        this.sessionRepository.saveMessage(sessionId, assistantMessage);
        this.sessionRepository.updateSessionState(sessionId, 'idle');
      } catch {
        // Persistence failures should not crash the loop
      }
    }

    // 9. agent_end hook
    await this.hookManager.executeHooks('agent_end', {
      hookPoint: 'agent_end',
      sessionId,
      data: {
        response: assistantMessage,
        usage: finalResponse?.usage,
        iterations,
      },
      abort: false,
    });

    // 10. Return AgentResponse
    return {
      id: assistantMessage.id,
      sessionId,
      content: responseContent,
      toolCalls: finalResponse?.toolCalls,
      usage: finalResponse?.usage,
      timestamp: assistantMessage.timestamp,
    };
  }

  // -----------------------------------------------------------------------
  // Internal: Tool execution
  // -----------------------------------------------------------------------

  private async executeToolCall(
    toolCall: ToolCall,
    sessionId: string,
  ): Promise<ToolResult> {
    // 1. before_tool_call hook
    const toolContext = await this.hookManager.executeHooks(
      'before_tool_call',
      {
        hookPoint: 'before_tool_call',
        sessionId,
        data: { toolCall },
        abort: false,
      },
    );

    if (toolContext.abort) {
      return {
        success: false,
        error: `Tool call '${toolCall.name}' was aborted by hook`,
      };
    }

    // 2. Get executor from SkillRegistry
    const executor = this.skillRegistry.getToolExecutor(toolCall.name);

    if (!executor) {
      return {
        success: false,
        error: `Tool '${toolCall.name}' not found`,
      };
    }

    // 3. Execute tool
    try {
      const result = await executor(toolCall.parameters, {
        sessionId,
        toolCall,
        config: this.config as unknown as Record<string, unknown>,
      });

      // 4. after_tool_call hook
      await this.hookManager.executeHooks('after_tool_call', {
        hookPoint: 'after_tool_call',
        sessionId,
        data: { toolCall, result },
        abort: false,
      });

      return result;
    } catch (error) {
      // Tool execution error -- do not crash the loop
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      // after_tool_call hook (error case)
      await this.hookManager.executeHooks('after_tool_call', {
        hookPoint: 'after_tool_call',
        sessionId,
        data: {
          toolCall,
          result: { success: false, error: errorMsg },
        },
        abort: false,
      });

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Internal: Model inference with hook
  // -----------------------------------------------------------------------

  private async modelInference(
    messages: ModelMessage[],
    sessionId: string,
    modelOptions?: ModelOptions,
  ): Promise<ModelResponse> {
    // 1. before_model_resolve hook
    await this.hookManager.executeHooks('before_model_resolve', {
      hookPoint: 'before_model_resolve',
      sessionId,
      data: { messageCount: messages.length },
      abort: false,
    });

    // 2-4. Use ModelResolver's failover logic
    const options: ModelOptions = {
      maxTokens: this.config.model.maxTokens,
      temperature: this.config.model.temperature,
      tools: modelOptions?.tools,
    };

    return this.modelResolver.completeWithFailover(messages, options);
  }

  // -----------------------------------------------------------------------
  // Internal: ModelResolver factory
  // -----------------------------------------------------------------------

  private createModelResolver(): ModelResolver {
    const primary: ModelProviderConfig = {
      provider: this.config.model.provider,
      model: this.config.model.model,
      apiKey: this.config.model.apiKey,
    };

    const fallbacks: ModelProviderConfig[] =
      this.config.model.fallbacks?.map((f) => ({
        provider: f.provider,
        model: f.model,
        apiKey: f.apiKey,
      })) ?? [];

    const providers = [primary, ...fallbacks];

    return new ModelResolver(providers, {
      circuitBreakerThreshold: 3,
      baseDelay: this.config.errorHandling?.baseDelay ?? 1000,
    });
  }

  // -----------------------------------------------------------------------
  // Internal: ID generation
  // -----------------------------------------------------------------------

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
