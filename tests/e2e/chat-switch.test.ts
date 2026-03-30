/**
 * E2E Test: Chat Switch -- Context Isolation
 *
 * T-005 / F-013
 *
 * Tests the critical user scenario of:
 *   1. Create two separate chats
 *   2. Send messages in each chat
 *   3. Switch between chats
 *   4. Verify that context is isolated (no cross-contamination)
 *
 * This test verifies that the Gateway Chat Router correctly isolates
 * chat contexts when switching between active chats.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createE2eEnvironment,
  cleanupAllE2eEnvironments,
  registerE2eEnvironment,
  TEST_IDS,
} from "./setup.js";
import type { E2eEnvironment } from "./setup.js";

describe("E2E: Chat Switch -- Context Isolation", () => {
  let env: E2eEnvironment;

  beforeAll(async () => {
    env = await createE2eEnvironment({
      llmResponseContent: "Response from mock LLM",
      defaultModel: "mock-llm",
    });
    registerE2eEnvironment(env);
  });

  afterAll(async () => {
    await cleanupAllE2eEnvironments();
  });

  // -----------------------------------------------------------------------
  // T-005: create 2 chats -> switch between -> verify context isolation
  // -----------------------------------------------------------------------

  it("maintains separate message histories for two different chats", async () => {
    const { fixture } = env;

    // Create Chat A
    const chatIdA = fixture.chatService.createChat({
      name: "Chat A - Programming",
      channel: "cli",
    });

    // Create Chat B
    const chatIdB = fixture.chatService.createChat({
      name: "Chat B - Cooking",
      channel: "cli",
    });

    // Send messages in Chat A
    fixture.chatService.addMessage(chatIdA, {
      role: "user",
      content: "What is TypeScript?",
    });

    let messagesA = fixture.chatService.getMessages(chatIdA);
    let resultA = await fixture.agentLoop.run({
      userMessage: "What is TypeScript?",
      messages: messagesA.map((m) => ({ role: m.role, content: m.content })),
      sessionId: TEST_IDS.sessionId,
      chatId: chatIdA,
    });
    fixture.chatService.addMessage(chatIdA, {
      role: "assistant",
      content: resultA.content,
    });

    // Send messages in Chat B (completely different topic)
    fixture.chatService.addMessage(chatIdB, {
      role: "user",
      content: "How to bake bread?",
    });

    let messagesB = fixture.chatService.getMessages(chatIdB);
    let resultB = await fixture.agentLoop.run({
      userMessage: "How to bake bread?",
      messages: messagesB.map((m) => ({ role: m.role, content: m.content })),
      sessionId: TEST_IDS.sessionId,
      chatId: chatIdB,
    });
    fixture.chatService.addMessage(chatIdB, {
      role: "assistant",
      content: resultB.content,
    });

    // Verify Chat A has only its own messages
    const finalMessagesA = fixture.chatService.getMessages(chatIdA);
    expect(finalMessagesA.length).toBe(2);
    expect(finalMessagesA[0].role).toBe("user");
    expect(finalMessagesA[0].content).toBe("What is TypeScript?");
    expect(finalMessagesA[1].role).toBe("assistant");

    // Verify Chat B has only its own messages
    const finalMessagesB = fixture.chatService.getMessages(chatIdB);
    expect(finalMessagesB.length).toBe(2);
    expect(finalMessagesB[0].role).toBe("user");
    expect(finalMessagesB[0].content).toBe("How to bake bread?");
    expect(finalMessagesB[1].role).toBe("assistant");

    // Verify no cross-contamination
    const chatAText = finalMessagesA.map((m) => m.content).join(" ");
    const chatBText = finalMessagesB.map((m) => m.content).join(" ");
    expect(chatAText).not.toContain("bread");
    expect(chatBText).not.toContain("TypeScript");
  });

  it("agent loop receives only the correct chat context when switching", async () => {
    // Use a fresh fixture to isolate provider call tracking
    const { createTestFixture } = await import("../integration/setup.js");
    const { DatabaseManager } = await import("../../packages/shared/src/database.js");

    const dbManager = new DatabaseManager({ dbPath: ":memory:" });
    dbManager.initialize();

    const fixture = createTestFixture(dbManager, {
      defaultModel: "mock-llm",
      responseContent: "Response from mock LLM",
    });

    const provider = fixture.provider as import("../../packages/providers/src/types.js").LLMProvider & {
      completeCalls: import("../../packages/providers/src/types.js").LLMRequest[];
    };

    try {
      // Create two chats
      const chatId1 = fixture.chatService.createChat({ name: "Context Test 1", channel: "cli" });
      const chatId2 = fixture.chatService.createChat({ name: "Context Test 2", channel: "cli" });

    // Build up history in chat 1
    fixture.chatService.addMessage(chatId1, { role: "user", content: "Message 1A" });
    fixture.chatService.addMessage(chatId1, { role: "assistant", content: "Response 1A" });
    fixture.chatService.addMessage(chatId1, { role: "user", content: "Message 1B" });

    // Run agent on chat 1
    let msgs = fixture.chatService.getMessages(chatId1);
    await fixture.agentLoop.run({
      userMessage: "Message 1B",
      messages: msgs.map((m) => ({ role: m.role, content: m.content })),
      sessionId: TEST_IDS.sessionId,
      chatId: chatId1,
    });

    // Now "switch" to chat 2 -- send a message there
    fixture.chatService.addMessage(chatId2, { role: "user", content: "Message 2A" });

    msgs = fixture.chatService.getMessages(chatId2);
    await fixture.agentLoop.run({
      userMessage: "Message 2A",
      messages: msgs.map((m) => ({ role: m.role, content: m.content })),
      sessionId: TEST_IDS.sessionId,
      chatId: chatId2,
    });

    // Verify the provider was called twice
    expect(provider.completeCalls.length).toBe(2);

    // First call (chat 1) should have chat 1's context
    const firstCallMessages = provider.completeCalls[0]!.messages;
    const firstCallContent = firstCallMessages.map((m) => m.content).join("|");
    expect(firstCallContent).toContain("Message 1A");
    expect(firstCallContent).toContain("Response 1A");
    expect(firstCallContent).not.toContain("Message 2A");

    // Second call (chat 2) should have ONLY chat 2's context
    const secondCallMessages = provider.completeCalls[1]!.messages;
    const secondCallContent = secondCallMessages.map((m) => m.content).join("|");
    expect(secondCallContent).toContain("Message 2A");
    expect(secondCallContent).not.toContain("Message 1A");
    expect(secondCallContent).not.toContain("Response 1A");
    } finally {
      dbManager.close();
    }
  });

  it("updating one chat does not affect another chat", async () => {
    const { fixture } = env;

    const chatId1 = fixture.chatService.createChat({ name: "Update Test 1", channel: "cli" });
    const chatId2 = fixture.chatService.createChat({ name: "Update Test 2", channel: "cli" });

    // Update chat 1
    fixture.chatService.updateChat(chatId1, {
      name: "Updated Chat 1",
      tags: ["updated"],
    });

    // Verify chat 2 is unchanged
    const chat1 = fixture.chatService.getChat(chatId1);
    const chat2 = fixture.chatService.getChat(chatId2);

    expect(chat1!.name).toBe("Updated Chat 1");
    expect(chat1!.tags).toEqual(["updated"]);

    expect(chat2!.name).toBe("Update Test 2");
    expect(chat2!.tags).toEqual([]);
  });

  it("archiving one chat does not affect messages in another chat", async () => {
    const { fixture } = env;

    const chatId1 = fixture.chatService.createChat({ name: "Archive Test 1", channel: "cli" });
    const chatId2 = fixture.chatService.createChat({ name: "Archive Test 2", channel: "cli" });

    // Add messages to both
    fixture.chatService.addMessage(chatId1, { role: "user", content: "Msg in chat 1" });
    fixture.chatService.addMessage(chatId2, { role: "user", content: "Msg in chat 2" });

    // Archive chat 1
    fixture.chatService.updateChat(chatId1, { isActive: false });

    // Verify chat 1 is archived
    const archivedChat = fixture.chatService.getChat(chatId1);
    expect(archivedChat!.isActive).toBe(false);

    // Verify chat 2 is still active and has its messages
    const activeChat = fixture.chatService.getChat(chatId2);
    expect(activeChat!.isActive).toBe(true);

    const messages2 = fixture.chatService.getMessages(chatId2);
    expect(messages2.length).toBe(1);
    expect(messages2[0].content).toBe("Msg in chat 2");
  });

  it("deleting one chat does not affect another chat", async () => {
    const { fixture } = env;

    const chatId1 = fixture.chatService.createChat({ name: "Delete Test 1", channel: "cli" });
    const chatId2 = fixture.chatService.createChat({ name: "Delete Test 2", channel: "cli" });

    // Add messages to both
    fixture.chatService.addMessage(chatId1, { role: "user", content: "Will be deleted" });
    fixture.chatService.addMessage(chatId2, { role: "user", content: "Will survive" });

    // Delete chat 1
    fixture.chatService.deleteChat(chatId1);

    // Verify chat 1 is gone
    expect(fixture.chatService.getChat(chatId1)).toBeNull();

    // Verify chat 2 still exists with its messages
    const chat2 = fixture.chatService.getChat(chatId2);
    expect(chat2).not.toBeNull();
    expect(chat2!.name).toBe("Delete Test 2");

    const messages2 = fixture.chatService.getMessages(chatId2);
    expect(messages2.length).toBe(1);
    expect(messages2[0].content).toBe("Will survive");
  });

  it("listing chats returns all chats regardless of content", async () => {
    const { fixture } = env;

    // Create multiple chats
    const id1 = fixture.chatService.createChat({ name: "List Test A", channel: "cli" });
    const id2 = fixture.chatService.createChat({ name: "List Test B", channel: "cli" });
    const id3 = fixture.chatService.createChat({ name: "List Test C", channel: "cli" });

    // Add messages only to chat B
    fixture.chatService.addMessage(id2, { role: "user", content: "Only in B" });

    // List all chats
    const allChats = fixture.chatService.listChats();
    const chatNames = allChats.map((c) => c.name);

    expect(chatNames).toContain("List Test A");
    expect(chatNames).toContain("List Test B");
    expect(chatNames).toContain("List Test C");

    // Filter active only
    const activeChats = fixture.chatService.listChats({ activeOnly: true });
    expect(activeChats.length).toBeGreaterThanOrEqual(3);
  });
});
