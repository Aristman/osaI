/**
 * @osai/gateway -- Gateway Application
 *
 * Main composition class that wires together all components:
 *   WsServer → MessageHandler → AgentLoop → InferenceService → ProviderChain
 *
 * Supports per-client isolation: each CLI client can push its own config
 * (agent + providers sections) via "config.push" message. Gateway creates
 * a dedicated ClientSession (ProviderChain + InferenceService + AgentLoop)
 * for that client. If no config is pushed, the default chain is used.
 */

import pino from "pino";
import type { OsaiConfig } from "./config.js";
import { validateClientConfig, mergeClientConfig } from "./config.js";
import { WsServer } from "./server/ws-server.js";
import { MessageHandler } from "./protocol/MessageHandler.js";
import { createProviderChain } from "./provider-factory.js";
import {
  HookRegistry,
  AgentLoop,
  InferenceService,
  ContextAssembler,
} from "@osai/agent";
import type { ChatMessage } from "@osai/providers";
import {
  createClientSession,
  disposeClientSession,
  type ClientSession,
} from "./client-session.js";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are osaI, an AI Operating System assistant.
You help users by answering questions, executing tasks, and managing their system.
Be concise and helpful. Respond in the same language the user uses.`;

// ---------------------------------------------------------------------------
// GatewayApp
// ---------------------------------------------------------------------------

/**
 * Main gateway application that composes all components.
 *
 * Wiring:
 *   1. Default ProviderChain (from DEFAULT_CONFIG) → InferenceService → AgentLoop
 *   2. WsServer → MessageHandler (handles "message" and "config.push")
 *   3. Per-client ClientSession created on config.push
 *   4. Response sent back as CLI-compatible format (block/tool_stream)
 */
export class GatewayApp {
  private readonly config: OsaiConfig;
  private readonly logger: pino.Logger;

  private server: WsServer | null = null;
  private messageHandler: MessageHandler | null = null;

  // Default fallback chain (from DEFAULT_CONFIG, no real API keys)
  private defaultProviderChain: ReturnType<typeof createProviderChain> | null = null;
  private defaultAgentLoop: AgentLoop | null = null;

  // Per-client sessions (clientId → ClientSession)
  private readonly clientSessions = new Map<string, ClientSession>();

  // Simple in-memory chat history (per clientId → per chatId)
  // TODO: replace with ChatService persistence
  private readonly chatHistories = new Map<string, ChatMessage[]>();

  constructor(config: OsaiConfig) {
    this.config = config;
    this.logger = pino({ name: "gateway-app" });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Start the gateway: create all components, register handlers, listen.
   */
  async start(): Promise<void> {
    // 1. Create default provider chain (fallback for clients without config.push)
    this.defaultProviderChain = createProviderChain(this.config, this.logger.child({ component: "provider-factory" }));

    if (this.defaultProviderChain.length === 0) {
      this.logger.warn("No LLM providers available — agent will return errors");
    }

    // 2. Create default agent pipeline
    const hooks = new HookRegistry();
    const contextAssembler = new ContextAssembler(hooks);
    const inferenceService = new InferenceService(
      this.defaultProviderChain as never,
      hooks,
    );

    this.defaultAgentLoop = new AgentLoop(
      { systemPrompt: SYSTEM_PROMPT },
      contextAssembler,
      inferenceService,
      hooks,
    );

    // 3. Create WS server
    this.server = new WsServer({
      host: "0.0.0.0",
      port: 18790,
      logger: this.logger.child({ component: "ws-server" }),
    });

    // 4. Create message handler and register handlers
    this.messageHandler = new MessageHandler({
      server: this.server,
      logger: this.logger.child({ component: "message-handler" }),
      handlers: new Map([
        [
          "subscribe",
          async () => {
            return undefined;
          },
        ],
        [
          "event",
          async () => {
            return undefined;
          },
        ],
        [
          "config.push",
          async (clientId: string, msg: import("./protocol/types.js").ClientMessage) => {
            await this.handleConfigPush(clientId, msg);
            return undefined;
          },
        ],
        [
          "message",
          async (clientId: string, msg: import("./protocol/types.js").ClientMessage) => {
            const session = this.clientSessions.get(clientId);
            const agentLoop = session?.agentLoop ?? this.defaultAgentLoop!;
            await this.handleUserMessage(clientId, agentLoop, msg);
            return undefined;
          },
        ],
      ]),
    });

    // 5. Wire WsServer → MessageHandler
    this.server.onConnection((clientId, _ws) => {
      this.logger.info({ clientId }, "Client connected");

      _ws.on("message", (raw: string) => {
        this.messageHandler!.handleMessage(clientId, raw);
      });
    });

    // 6. Wire disconnect → cleanup session
    this.server.onDisconnection((clientId) => {
      this.handleClientDisconnect(clientId);
    });

    // 7. Start listening
    await this.server.start();

    this.logger.info(
      {
        model: this.config.agent.model,
        providers: this.defaultProviderChain.length,
      },
      "Gateway started",
    );
  }

  /**
   * Gracefully stop the gateway.
   */
  async stop(): Promise<void> {
    // Dispose all client sessions
    for (const [clientId, session] of this.clientSessions) {
      this.logger.info({ clientId }, "Disposing client session on shutdown");
      disposeClientSession(session);
    }
    this.clientSessions.clear();

    this.defaultProviderChain?.dispose();

    if (this.server) {
      await this.server.stop();
      this.server = null;
    }

    this.logger.info("Gateway stopped");
  }

  // -----------------------------------------------------------------------
  // Config push handling
  // -----------------------------------------------------------------------

  /**
   * Handle "config.push" message from a client.
   * Validates the payload, creates a ClientSession, sends config.ack.
   */
  private async handleConfigPush(
    clientId: string,
    msg: import("./protocol/types.js").ClientMessage,
  ): Promise<void> {
    try {
      const validated = validateClientConfig(msg.payload);
      const mergedConfig = mergeClientConfig(validated);

      // Dispose previous session if exists
      const prevSession = this.clientSessions.get(clientId);
      if (prevSession) {
        disposeClientSession(prevSession);
      }

      // Create new per-client session
      const session = createClientSession(clientId, mergedConfig, this.logger);
      this.clientSessions.set(clientId, session);

      this.sendToClient(clientId, {
        type: "config.ack",
        payload: {
          status: "ok",
          providersLoaded: session.providerChain.length,
          model: mergedConfig.agent.model,
        },
      });

      this.logger.info(
        { clientId, providers: session.providerChain.length, model: mergedConfig.agent.model },
        "Client config pushed",
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ clientId, error: message }, "Client config push failed");

      this.sendToClient(clientId, {
        type: "config.ack",
        payload: {
          status: "error",
          error: message,
        },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Message handling
  // -----------------------------------------------------------------------

  /**
   * Handle an incoming user text message.
   */
  private async handleUserMessage(
    clientId: string,
    agentLoop: import("@osai/agent").AgentLoop,
    clientMessage: import("./protocol/types.js").ClientMessage,
  ): Promise<void> {
    const chatId = clientMessage.chatId ?? "default";
    const content = extractContent(clientMessage.payload);

    if (!content) {
      this.sendError(clientId, clientMessage.id, "Empty message");
      return;
    }

    this.logger.info(
      { clientId, chatId, contentLength: content.length },
      "User message received",
    );

    const history = this.getChatHistory(clientId, chatId);

    this.sendToClient(clientId, {
      type: "tool_stream",
      tool: "agent",
      action: "thinking",
      chunk: "Processing...",
      progress: 0,
    });

    try {
      const result = await agentLoop.run({
        userMessage: content,
        messages: history,
        sessionId: clientId,
        chatId,
      });

      if (result.isError) {
        this.sendToClient(clientId, {
          type: "block",
          block_type: "text",
          content: `[Error] ${result.errorMessage ?? "Unknown error"}`,
        });
        return;
      }

      history.push({ role: "user", content });
      if (result.content) {
        history.push({ role: "assistant", content: result.content });
      }
      this.setChatHistory(clientId, chatId, history);

      if (result.content) {
        this.sendToClient(clientId, {
          type: "block",
          block_type: "text",
          content: result.content,
        });
      }

      this.logger.info(
        {
          clientId,
          chatId,
          model: result.model,
          provider: result.provider,
          tokens: result.usage.totalTokens,
        },
        "Response sent",
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { clientId, chatId, error: message },
        "Agent loop failed",
      );
      this.sendToClient(clientId, {
        type: "block",
        payload: {
          block_type: "text",
          content: `[Error] ${message}`,
        },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Disconnect handling
  // -----------------------------------------------------------------------

  private handleClientDisconnect(clientId: string): void {
    const session = this.clientSessions.get(clientId);
    if (session) {
      this.logger.info({ clientId }, "Disposing client session on disconnect");
      disposeClientSession(session);
      this.clientSessions.delete(clientId);
    }

    // Cleanup chat histories for this client
    const prefix = `${clientId}:`;
    for (const key of this.chatHistories.keys()) {
      if (key.startsWith(prefix)) {
        this.chatHistories.delete(key);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private sendToClient(clientId: string, message: Record<string, unknown>): void {
    this.server?.send(clientId, message);
  }

  private sendError(
    clientId: string,
    requestId: string | undefined,
    error: string,
  ): void {
    this.server?.send(clientId, {
      type: "ERROR",
      id: requestId,
      error,
    });
  }

  private getChatHistory(clientId: string, chatId: string): ChatMessage[] {
    const key = `${clientId}:${chatId}`;
    return this.chatHistories.get(key) ?? [];
  }

  private setChatHistory(
    clientId: string,
    chatId: string,
    history: ChatMessage[],
  ): void {
    const key = `${clientId}:${chatId}`;
    this.chatHistories.set(key, history);
  }
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

function extractContent(
  payload: Record<string, unknown> | undefined,
): string | null {
  if (!payload) return null;

  if (typeof payload["content"] === "string") {
    return payload["content"];
  }

  return null;
}
