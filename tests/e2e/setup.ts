/**
 * E2E Test Environment Setup
 *
 * Provides a reusable E2E environment that starts real processes:
 *   - Agent (AgentLoop with mock LLM provider or mock HTTP server)
 *   - Mock LLM server (OpenAI-compatible HTTP on a random port)
 *   - SQLite (in-memory or temp file)
 *
 * All ports are randomly assigned to avoid conflicts.
 * The environment is torn down in global afterEach.
 *
 * NOTE: WsServer is NOT used directly in E2E tests because the `ws`
 * dependency is only available in the gateway workspace package.
 * E2E tests focus on AgentLoop + ChatService + ProviderChain + Mock LLM.
 * WebSocket-level testing is covered in integration tests.
 *
 * T-005 / F-013
 */

import type { Server } from "node:http";

// ---------------------------------------------------------------------------
// Re-exports from other setup modules
// ---------------------------------------------------------------------------

export {
  createMockLLMProvider,
  createTestFixture,
  TEST_IDS,
} from "../integration/setup.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Active E2E test environment. */
export interface E2eEnvironment {
  /** In-memory database manager. */
  readonly dbManager: import("../../packages/shared/src/database.js").DatabaseManager;
  /** Mock LLM HTTP server. */
  readonly llmServer: import("./mock-llm-server.js").MockLlmServer;
  /** Integration test fixture (agent, hooks, provider, etc.). */
  readonly fixture: import("../integration/setup.js").IntegrationTestFixture;
  /** Cleanup function to tear down the environment. */
  cleanup(): Promise<void>;
}

/** Configuration for creating an E2E environment. */
export interface E2eEnvironmentConfig {
  /** Custom response content for the mock LLM. Default: "Mock LLM response". */
  readonly llmResponseContent?: string;
  /** Default model name for the mock provider. Default: "mock-llm". */
  readonly defaultModel?: string;
  /** Whether the mock LLM should initially be in failure mode. Default: false. */
  readonly llmShouldFail?: boolean;
  /** Optional RAG query function. */
  readonly ragQuery?: import("../../packages/agent/src/context/types.js").RAGQueryFn;
}

// ---------------------------------------------------------------------------
// Environment factory
// ---------------------------------------------------------------------------

/**
 * Create and start a full E2E test environment.
 *
 * Starts:
 * 1. In-memory SQLite (via DatabaseManager)
 * 2. Mock LLM HTTP server (on random port)
 * 3. Integration test fixture (AgentLoop, Provider, etc.)
 *
 * @param config - Optional environment configuration.
 * @returns A fully initialized E2eEnvironment.
 */
export async function createE2eEnvironment(
  config: E2eEnvironmentConfig = {},
): Promise<E2eEnvironment> {
  // Dynamic imports to avoid top-level side effects
  const { DatabaseManager } = await import("../../packages/shared/src/database.js");
  const { startMockLlmServer } = await import("./mock-llm-server.js");
  const { createTestFixture } = await import("../integration/setup.js");

  // 1. In-memory SQLite
  const dbManager = new DatabaseManager({ dbPath: ":memory:" });
  dbManager.initialize();

  // 2. Mock LLM HTTP server
  const llmServer = await startMockLlmServer({
    responseContent: config.llmResponseContent ?? "Mock LLM response",
    model: config.defaultModel ?? "mock-llm",
    shouldFail: config.llmShouldFail ?? false,
  });

  // 3. Integration test fixture
  const fixture = createTestFixture(
    dbManager,
    {
      defaultModel: config.defaultModel ?? "mock-llm",
      responseContent: config.llmResponseContent ?? "Mock LLM response",
    },
    config.ragQuery,
  );

  return {
    dbManager,
    llmServer,
    fixture,
    async cleanup() {
      await llmServer.stop();
      dbManager.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Global E2E setup hooks
// ---------------------------------------------------------------------------

/** Track all created environments for cleanup. */
const activeEnvironments: E2eEnvironment[] = [];

/**
 * Register an E2E environment for automatic cleanup.
 * Call this in beforeAll to ensure cleanup in afterAll.
 */
export function registerE2eEnvironment(env: E2eEnvironment): void {
  activeEnvironments.push(env);
}

/**
 * Clean up all registered E2E environments.
 * Call this in afterAll.
 */
export async function cleanupAllE2eEnvironments(): Promise<void> {
  const envs = activeEnvironments.splice(0);
  await Promise.all(envs.map((env) => env.cleanup()));
}
