/**
 * E2E Mock LLM Server -- OpenAI-compatible HTTP server
 *
 * Listens on a random available port and provides minimal
 * OpenAI Chat Completions API endpoints (/v1/chat/completions).
 *
 * Features:
 * - Configurable response content
 * - Configurable delay to simulate latency
 * - Failure mode (returns 500)
 * - Streaming support (SSE)
 * - Request logging for test assertions
 *
 * T-005 / F-013
 */
import { type Server } from "node:http";
/** Configuration for the mock LLM server. */
export interface MockLlmServerConfig {
    /** Response content for chat completions. Default: "Mock LLM response". */
    readonly responseContent?: string;
    /** Simulated processing delay in milliseconds. Default: 0. */
    readonly delayMs?: number;
    /** Whether the server should return errors. Default: false. */
    readonly shouldFail?: boolean;
    /** HTTP status code for failures. Default: 500. */
    readonly failStatusCode?: number;
    /** Model name to report in responses. Default: "mock-llm". */
    readonly model?: string;
}
/** A recorded request for test assertions. */
export interface RecordedRequest {
    readonly method: string;
    readonly url: string;
    readonly body: unknown;
    readonly timestamp: number;
}
/** Active mock LLM server instance. */
export interface MockLlmServer {
    /** The underlying HTTP server. */
    readonly server: Server;
    /** Port the server is listening on. */
    readonly port: number;
    /** Base URL for API calls. */
    readonly baseUrl: string;
    /** All recorded requests since start. */
    readonly requests: readonly RecordedRequest[];
    /** Update the response content dynamically. */
    setResponseContent(content: string): void;
    /** Toggle failure mode. */
    setShouldFail(shouldFail: boolean): void;
    /** Clear recorded requests. */
    clearRequests(): void;
    /** Stop the server. */
    stop(): Promise<void>;
}
/**
 * Start a mock LLM server on a random available port.
 *
 * The server provides an OpenAI-compatible `/v1/chat/completions` endpoint
 * that returns a single-choice completion with the configured content.
 *
 * @param config - Server configuration.
 * @returns A MockLlmServer instance.
 */
export declare function startMockLlmServer(config?: MockLlmServerConfig): Promise<MockLlmServer>;
//# sourceMappingURL=mock-llm-server.d.ts.map