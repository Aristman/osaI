/**
 * E2E Test: Provider Failover
 *
 * T-005 / F-013
 *
 * Tests the critical user scenario of:
 *   1. Primary LLM provider becomes unavailable
 *   2. System automatically fails over to next available provider
 *   3. Response is successfully received from fallback provider
 *
 * This test uses real ProviderChain with mock providers to verify
 * the failover mechanism including circuit breaker behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createE2eEnvironment,
  cleanupAllE2eEnvironments,
  registerE2eEnvironment,
  createMockLLMProvider,
  TEST_IDS,
} from "./setup.js";
import type { E2eEnvironment } from "./setup.js";
import { ProviderChain } from "../../packages/providers/src/chain/provider-chain.js";
import { CircuitBreaker } from "../../packages/providers/src/circuit-breaker/circuit-breaker.js";
import { CircuitState } from "../../packages/providers/src/circuit-breaker/types.js";
import { ProviderUnavailableError, ProviderError } from "../../packages/providers/src/errors.js";
import { ProviderStatus } from "../../packages/providers/src/types.js";
import type { LLMProvider, LLMRequest, LLMResponse } from "../../packages/providers/src/types.js";

describe("E2E: Provider Failover", () => {
  let env: E2eEnvironment;

  beforeAll(async () => {
    env = await createE2eEnvironment({
      llmResponseContent: "Primary response",
      defaultModel: "mock-llm",
    });
    registerE2eEnvironment(env);
  });

  afterAll(async () => {
    await cleanupAllE2eEnvironments();
  });

  // -----------------------------------------------------------------------
  // T-005: primary LLM down -> automatic failover -> response received
  // -----------------------------------------------------------------------

  it("fails over from primary to fallback when primary is unavailable", async () => {
    // Create a primary provider that will fail
    const primaryProvider = createMockLLMProvider({
      id: "primary-llm",
      name: "Primary LLM",
      defaultModel: "primary-model",
      shouldFail: true,
      failError: new ProviderUnavailableError("Connection refused", "primary-llm"),
    });

    // Create a fallback provider that will succeed
    const fallbackProvider = createMockLLMProvider({
      id: "fallback-llm",
      name: "Fallback LLM",
      defaultModel: "fallback-model",
      responseContent: "Fallback response received successfully",
    });

    // Create provider chain: primary -> fallback
    const chain = new ProviderChain([primaryProvider, fallbackProvider], {
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeoutMs: 60_000,
      },
    });

    // Execute a request
    const request: LLMRequest = {
      model: "primary-model",
      messages: [{ role: "user", content: "Hello" }],
    };

    const response = await chain.execute(request);

    // Response should come from the fallback provider
    expect(response.content).toBe("Fallback response received successfully");
    expect(response.provider).toBe("fallback-llm");
    // Model is passed through from the request
    expect(response.model).toBe("primary-model");
  });

  it("opens circuit breaker after repeated failures and skips the provider", async () => {
    // Create a provider that always fails
    const failingProvider = createMockLLMProvider({
      id: "always-fail",
      name: "Always Fail Provider",
      defaultModel: "fail-model",
      shouldFail: true,
      failError: new ProviderError("Internal Server Error", "always-fail", 500),
    });

    // Create a working fallback
    const workingProvider = createMockLLMProvider({
      id: "always-works",
      name: "Always Works Provider",
      defaultModel: "works-model",
      responseContent: "Working response",
    });

    const chain = new ProviderChain([failingProvider, workingProvider], {
      circuitBreaker: {
        failureThreshold: 3, // Opens after 3 failures
        resetTimeoutMs: 60_000,
      },
    });

    const request: LLMRequest = {
      model: "fail-model",
      messages: [{ role: "user", content: "test" }],
    };

    // Make 3 requests to trigger circuit breaker
    await chain.execute(request);
    await chain.execute(request);
    await chain.execute(request);

    // Check status -- circuit breaker should be open
    const statuses = chain.getStatus();
    const failingStatus = statuses.find((s) => s.providerId === "always-fail");
    expect(failingStatus).toBeDefined();
    expect(failingStatus!.circuitState).toBe(CircuitState.Open);

    // Next request should skip the failing provider entirely
    const response = await chain.execute(request);
    expect(response.provider).toBe("always-works");

    // The failing provider should not have been called again (circuit open)
    const typedFailingProvider = failingProvider as LLMProvider & { completeCalls: LLMRequest[] };
    const callsBefore = typedFailingProvider.completeCalls.length;
    const response2 = await chain.execute(request);
    expect(typedFailingProvider.completeCalls.length).toBe(callsBefore);
    expect(response2.provider).toBe("always-works");
  });

  it("tries providers in priority order (first available wins)", async () => {
    // Three providers: first fails, second succeeds (should be picked)
    const provider1 = createMockLLMProvider({
      id: "p1",
      name: "Provider 1",
      defaultModel: "m1",
      shouldFail: true,
      failError: new ProviderUnavailableError("Down", "p1"),
    });

    const provider2 = createMockLLMProvider({
      id: "p2",
      name: "Provider 2",
      defaultModel: "m2",
      responseContent: "Provider 2 response",
    });

    const provider3 = createMockLLMProvider({
      id: "p3",
      name: "Provider 3",
      defaultModel: "m3",
      responseContent: "Provider 3 response",
    });

    const chain = new ProviderChain([provider1, provider2, provider3]);

    const response = await chain.execute({
      model: "m1",
      messages: [{ role: "user", content: "test" }],
    });

    // Provider 2 should have been selected (first available after p1 failed)
    expect(response.provider).toBe("p2");
    expect(response.content).toBe("Provider 2 response");

    // Provider 3 should NOT have been called
    const typedP3 = provider3 as LLMProvider & { completeCalls: LLMRequest[] };
    expect(typedP3.completeCalls.length).toBe(0);
  });

  it("throws error when all providers are unavailable", async () => {
    const failing1 = createMockLLMProvider({
      id: "fail-1",
      name: "Fail 1",
      defaultModel: "m1",
      shouldFail: true,
      failError: new ProviderUnavailableError("Down", "fail-1"),
    });

    const failing2 = createMockLLMProvider({
      id: "fail-2",
      name: "Fail 2",
      defaultModel: "m2",
      shouldFail: true,
      failError: new ProviderUnavailableError("Down", "fail-2"),
    });

    const chain = new ProviderChain([failing1, failing2]);

    await expect(
      chain.execute({
        model: "m1",
        messages: [{ role: "user", content: "test" }],
      }),
    ).rejects.toThrow();
  });

  it("mock LLM server can be toggled between success and failure modes", async () => {
    const { llmServer } = env;

    // Initially not failing
    llmServer.setShouldFail(false);
    llmServer.setResponseContent("Working fine");

    // Verify server is reachable via health endpoint
    const healthResponse = await fetch(`${llmServer.baseUrl}/health`);
    const healthData = await healthResponse.json() as { status: string };
    expect(healthData.status).toBe("ok");

    // Make a successful request
    const successResponse = await fetch(`${llmServer.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mock-llm",
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    expect(successResponse.status).toBe(200);
    const successData = await successResponse.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    expect(successData.choices[0].message.content).toBe("Working fine");

    // Toggle to failure mode
    llmServer.setShouldFail(true);

    const failResponse = await fetch(`${llmServer.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mock-llm",
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    expect(failResponse.status).toBe(500);

    // Toggle back to success
    llmServer.setShouldFail(false);

    const recoveryResponse = await fetch(`${llmServer.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mock-llm",
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    expect(recoveryResponse.status).toBe(200);
  });

  it("mock LLM server records requests for test assertions", async () => {
    const { llmServer } = env;
    llmServer.clearRequests();

    // Make two requests
    await fetch(`${llmServer.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mock-llm",
        messages: [{ role: "user", content: "First request" }],
      }),
    });

    await fetch(`${llmServer.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mock-llm",
        messages: [{ role: "user", content: "Second request" }],
      }),
    });

    // Verify requests were recorded
    expect(llmServer.requests.length).toBe(2);

    const firstBody = llmServer.requests[0]!.body as {
      messages: Array<{ content: string }>;
    };
    const secondBody = llmServer.requests[1]!.body as {
      messages: Array<{ content: string }>;
    };

    expect(firstBody.messages[0].content).toBe("First request");
    expect(secondBody.messages[0].content).toBe("Second request");

    // Clear and verify
    llmServer.clearRequests();
    expect(llmServer.requests.length).toBe(0);
  });

  it("mock LLM server supports streaming responses", async () => {
    const { llmServer } = env;
    llmServer.setResponseContent("Streaming test content");
    llmServer.clearRequests();

    const response = await fetch(`${llmServer.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mock-llm",
        messages: [{ role: "user", content: "stream test" }],
        stream: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    // Read the full SSE stream
    const text = await response.text();
    expect(text).toContain("data: ");
    // Content is split by spaces into SSE chunks
    expect(text).toContain('"content":"Streaming"');
    expect(text).toContain('"content":" test"');
    expect(text).toContain('"content":" content"');
    expect(text).toContain('"finish_reason":"stop"');
    expect(text).toContain("data: [DONE]");
  });

  it("provider chain getStatus returns correct provider information", async () => {
    const provider1 = createMockLLMProvider({
      id: "status-test-1",
      name: "Status Test 1",
      defaultModel: "m1",
      responseContent: "OK",
    });

    const provider2 = createMockLLMProvider({
      id: "status-test-2",
      name: "Status Test 2",
      defaultModel: "m2",
      responseContent: "OK",
    });

    const chain = new ProviderChain([provider1, provider2]);

    const statuses = chain.getStatus();

    expect(statuses.length).toBe(2);
    expect(statuses[0].providerId).toBe("status-test-1");
    expect(statuses[0].providerName).toBe("Status Test 1");
    expect(statuses[0].status).toBe(ProviderStatus.Available);
    expect(statuses[0].circuitState).toBe(CircuitState.Closed);

    expect(statuses[1].providerId).toBe("status-test-2");
    expect(statuses[1].providerName).toBe("Status Test 2");
  });
});
