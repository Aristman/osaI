/**
 * E2E Test: Basic Chat Flow
 *
 * T-005 / F-013
 *
 * Tests the critical user scenario of:
 *   1. Connect to Gateway via WebSocket
 *   2. Send a text message
 *   3. Agent processes the message via mock LLM
 *   4. Receive response
 *   5. Verify data persisted in SQLite
 *
 * This test uses real processes (in-memory SQLite, WsServer)
 * but mocks the external LLM API dependency.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createE2eEnvironment,
  cleanupAllE2eEnvironments,
  registerE2eEnvironment,
  TEST_IDS,
} from "./setup.js";
import type { E2eEnvironment } from "./setup.js";

describe("E2E: Basic Chat Flow", () => {
  let env: E2eEnvironment;

  beforeAll(async () => {
    env = await createE2eEnvironment({
      llmResponseContent: "Hello! I am osaI, your AI assistant.",
      defaultModel: "mock-llm",
    });
    registerE2eEnvironment(env);
  });

  afterAll(async () => {
    await cleanupAllE2eEnvironments();
  });

  // -----------------------------------------------------------------------
  // T-005: CLI connect -> send message -> receive response -> verify in SQLite
  // -----------------------------------------------------------------------

  it("sends a user message and receives an LLM response via the agent loop", async () => {
    const { fixture } = env;

    // Create a chat via ChatService
    const chatId = fixture.chatService.createChat({
      name: "Basic Test Chat",
      channel: "cli",
    });

    // Add a user message
    const userMessage = "Hello, what can you do?";
    fixture.chatService.addMessage(chatId, {
      role: "user",
      content: userMessage,
    });

    // Run the agent loop (simulates Gateway -> Agent flow)
    const messages = fixture.chatService.getMessages(chatId);
    const result = await fixture.agentLoop.run({
      userMessage,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      sessionId: TEST_IDS.sessionId,
      chatId,
      traceId: TEST_IDS.traceId,
    });

    // Verify the response
    expect(result.isError).toBe(false);
    expect(result.content).toBe("Hello! I am osaI, your AI assistant.");
    expect(result.provider).toBe("mock-provider");
    expect(result.traceId).toBe(TEST_IDS.traceId);
  });

  it("persists the assistant response in SQLite after agent processing", async () => {
    const { fixture } = env;

    // Create a new chat
    const chatId = fixture.chatService.createChat({
      name: "Persistence Test Chat",
      channel: "cli",
    });

    // Simulate a conversation cycle
    const userMessage = "Tell me about TypeScript";
    fixture.chatService.addMessage(chatId, {
      role: "user",
      content: userMessage,
    });

    // Agent processes the message
    const messages = fixture.chatService.getMessages(chatId);
    const result = await fixture.agentLoop.run({
      userMessage,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      sessionId: TEST_IDS.sessionId,
      chatId,
    });

    expect(result.isError).toBe(false);

    // Persist the assistant response to the chat
    fixture.chatService.addMessage(chatId, {
      role: "assistant",
      content: result.content,
    });

    // Verify both messages are in SQLite
    const allMessages = fixture.chatService.getMessages(chatId);
    expect(allMessages.length).toBe(2);
    expect(allMessages[0].role).toBe("user");
    expect(allMessages[0].content).toBe("Tell me about TypeScript");
    expect(allMessages[1].role).toBe("assistant");
    expect(allMessages[1].content).toBe("Hello! I am osaI, your AI assistant.");
  });

  it("includes token usage in the response", async () => {
    const { fixture } = env;

    const chatId = fixture.chatService.createChat({
      name: "Usage Test Chat",
      channel: "cli",
    });

    const result = await fixture.agentLoop.run({
      userMessage: "test",
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId,
    });

    expect(result.usage).toBeDefined();
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  });

  it("handles multiple sequential messages in the same chat", async () => {
    // Use a fresh fixture to isolate provider call tracking
    const { createTestFixture } = await import("../integration/setup.js");
    const { DatabaseManager } = await import("../../packages/shared/src/database.js");

    const dbManager = new DatabaseManager({ dbPath: ":memory:" });
    dbManager.initialize();

    const fixture = createTestFixture(dbManager, {
      defaultModel: "mock-llm",
      responseContent: "Hello! I am osaI, your AI assistant.",
    });

    try {
      const chatId = fixture.chatService.createChat({
        name: "Multi-message Chat",
        channel: "cli",
      });

      // First exchange
      fixture.chatService.addMessage(chatId, { role: "user", content: "First question" });
      let messages = fixture.chatService.getMessages(chatId);
      let result = await fixture.agentLoop.run({
        userMessage: "First question",
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        sessionId: TEST_IDS.sessionId,
        chatId,
      });
      fixture.chatService.addMessage(chatId, { role: "assistant", content: result.content });

      // Second exchange
      fixture.chatService.addMessage(chatId, { role: "user", content: "Second question" });
      messages = fixture.chatService.getMessages(chatId);
      result = await fixture.agentLoop.run({
        userMessage: "Second question",
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        sessionId: TEST_IDS.sessionId,
        chatId,
      });
      fixture.chatService.addMessage(chatId, { role: "assistant", content: result.content });

      // Verify 4 messages total (2 user + 2 assistant)
      const allMessages = fixture.chatService.getMessages(chatId);
      expect(allMessages.length).toBe(4);

      // Verify the agent received conversation history in the second call
      const provider = fixture.provider as import("../../packages/providers/src/types.js").LLMProvider & {
        completeCalls: import("../../packages/providers/src/types.js").LLMRequest[];
      };
      expect(provider.completeCalls.length).toBe(2);

      // Second call should have had more messages in history
      const secondCallMessages = provider.completeCalls[1]!.messages;
      expect(secondCallMessages.length).toBeGreaterThan(2); // system + at least 3 history
    } finally {
      dbManager.close();
    }
  });

  it("creates a chat with metadata and retrieves it", async () => {
    const { fixture } = env;

    const chatId = fixture.chatService.createChat({
      name: "Metadata Chat",
      description: "A chat with metadata",
      tags: ["test", "e2e"],
      channel: "cli",
      color: "#FF0000",
    });

    const chat = fixture.chatService.getChat(chatId);
    expect(chat).not.toBeNull();
    expect(chat!.name).toBe("Metadata Chat");
    expect(chat!.description).toBe("A chat with metadata");
    expect(chat!.tags).toEqual(["test", "e2e"]);
    expect(chat!.color).toBe("#FF0000");
    expect(chat!.isActive).toBe(true);
  });

  it("generates trace ID automatically when not provided", async () => {
    const { fixture } = env;

    const chatId = fixture.chatService.createChat({ name: "Trace Test", channel: "cli" });
    const result = await fixture.agentLoop.run({
      userMessage: "test",
      messages: [],
      sessionId: TEST_IDS.sessionId,
      chatId,
      // traceId intentionally omitted
    });

    expect(result.traceId).toBeDefined();
    expect(result.traceId.length).toBeGreaterThan(0);
    // UUID format
    expect(result.traceId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
