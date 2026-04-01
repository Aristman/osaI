/**
 * @osai/gateway -- Client Session
 *
 * Per-client isolation: each connected CLI client gets its own
 * ProviderChain + InferenceService + AgentLoop.
 *
 * Shared (stateless) context: HookRegistry, ContextAssembler are created once
 * per session since they don't hold per-request state.
 */

import pino from "pino";
import type { OsaiConfig } from "./config.js";
import { createProviderChain } from "./provider-factory.js";
import {
  HookRegistry,
  AgentLoop,
  InferenceService,
  ContextAssembler,
} from "@osai/agent";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are osaI, an AI Operating System assistant.
You help users by answering questions, executing tasks, and managing their system.
Be concise and helpful. Respond in the same language the user uses.`;

// ---------------------------------------------------------------------------
// ClientSession interface
// ---------------------------------------------------------------------------

export interface ClientSession {
  clientId: string;
  config: OsaiConfig;
  providerChain: ReturnType<typeof createProviderChain>;
  inferenceService: InferenceService;
  agentLoop: AgentLoop;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a per-client session with its own ProviderChain, InferenceService, and AgentLoop.
 */
export function createClientSession(
  clientId: string,
  config: OsaiConfig,
  logger: pino.Logger,
): ClientSession {
  const childLogger = logger.child({ clientId });

  const providerChain = createProviderChain(config, childLogger.child({ component: "provider-factory" }));

  if (providerChain.length === 0) {
    childLogger.warn("No LLM providers configured for client");
  }

  const hooks = new HookRegistry();
  const contextAssembler = new ContextAssembler(hooks);
  const inferenceService = new InferenceService(
    providerChain as never,
    hooks,
  );

  const agentLoop = new AgentLoop(
    { systemPrompt: SYSTEM_PROMPT },
    contextAssembler,
    inferenceService,
    hooks,
  );

  childLogger.info(
    { model: config.agent.model, providers: providerChain.length },
    "Client session created",
  );

  return { clientId, config, providerChain, inferenceService, agentLoop };
}

/**
 * Dispose a client session (cleanup ProviderChain resources).
 */
export function disposeClientSession(session: ClientSession): void {
  session.providerChain.dispose();
}
