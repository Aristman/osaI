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
export { createMockLLMProvider, createTestFixture, TEST_IDS, } from "../integration/setup.js";
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
export declare function createE2eEnvironment(config?: E2eEnvironmentConfig): Promise<E2eEnvironment>;
/**
 * Register an E2E environment for automatic cleanup.
 * Call this in beforeAll to ensure cleanup in afterAll.
 */
export declare function registerE2eEnvironment(env: E2eEnvironment): void;
/**
 * Clean up all registered E2E environments.
 * Call this in afterAll.
 */
export declare function cleanupAllE2eEnvironments(): Promise<void>;
//# sourceMappingURL=setup.d.ts.map