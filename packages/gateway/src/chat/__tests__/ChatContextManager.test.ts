/**
 * @osai/gateway -- ChatContextManager Tests (T-005)
 *
 * Tests for chat context isolation and switching.
 *
 * Test cases from roadmap:
 *   TT-009-25: Chat contexts are isolated (messages don't leak between chats)
 *   TT-009-26: switchChat loads target context
 *   TT-009-27: switchChat preserves source context
 *   TT-009-28: Client notified about switch via WS
 *   TT-009-29: Switch to non-existent chat throws error, current unchanged
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { DatabaseManager } from "@osai/shared";
import { runMigrations } from "@osai/shared";
import { ChatService } from "../ChatService.js";
import { ChatContextManager, ChatContextManagerConfig } from "../ChatContextManager.js";
import type { ChatMessage } from "../types.js";
import type { WsServer } from "../../server/ws-server.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create an in-memory DatabaseManager for testing.
 */
function createTestDbManager(): DatabaseManager {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // We bypass DatabaseManager.initialize() to use in-memory DB
  const manager = {
    getDb: () => db,
    getDbPath: () => ":memory:",
    initialize: () => {},
    close: () => db.close(),
  } as unknown as DatabaseManager;

  runMigrations(db);
  return manager;
}

/**
 * Create a mock WsServer for testing broadcast/send.
 */
function createMockWsServer(): WsServer {
  const sent: Array<{ clientId: string; message: object }> = [];
  const broadcasts: object[] = [];

  return {
    broadcast(message: object): void {
      broadcasts.push(message);
    },
    send(clientId: string, message: object): void {
      sent.push({ clientId, message });
    },
    getConnections(): number {
      return 0;
    },
    // Other methods are not used by ChatContextManager
  } as unknown as WsServer;
}

/**
 * Add a sequence of messages to a chat.
 */
function addTestMessages(
  chatService: ChatService,
  chatId: string,
  roles: Array<{ role: "user" | "assistant" | "system"; content: string }>,
): void {
  for (const msg of roles) {
    chatService.addMessage(chatId, msg);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatContextManager", () => {
  let dbManager: DatabaseManager;
  let chatService: ChatService;
  let wsServer: WsServer;
  let contextManager: ChatContextManager;

  beforeEach(() => {
    dbManager = createTestDbManager();
    chatService = new ChatService(dbManager);
    chatService.ensureSchema();
    wsServer = createMockWsServer();

    contextManager = new ChatContextManager({
      chatService,
      wsServer,
    } satisfies ChatContextManagerConfig);
  });

  // -----------------------------------------------------------------------
  // TT-009-25: Context Isolation
  // -----------------------------------------------------------------------

  describe("TT-009-25: context isolation", () => {
    it("getMessages for chat A returns only chat A messages", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      const chatB = chatService.createChat({ name: "Chat B" });

      addTestMessages(chatService, chatA, [
        { role: "user", content: "Hello from A" },
        { role: "assistant", content: "Reply to A" },
      ]);
      addTestMessages(chatService, chatB, [
        { role: "user", content: "Hello from B" },
        { role: "assistant", content: "Reply to B" },
        { role: "user", content: "Follow-up in B" },
      ]);

      const messagesA = contextManager.getContextForChat(chatA).messages;
      const messagesB = contextManager.getContextForChat(chatB).messages;

      // Chat A has 2 messages
      expect(messagesA).toHaveLength(2);
      expect(messagesA[0]!.content).toBe("Hello from A");
      expect(messagesA[1]!.content).toBe("Reply to A");

      // Chat B has 3 messages
      expect(messagesB).toHaveLength(3);
      expect(messagesB[0]!.content).toBe("Hello from B");
      expect(messagesB[1]!.content).toBe("Reply to B");
      expect(messagesB[2]!.content).toBe("Follow-up in B");

      // No cross-contamination
      const contentsA = new Set(messagesA.map((m: ChatMessage) => m.content));
      const contentsB = new Set(messagesB.map((m: ChatMessage) => m.content));
      for (const c of contentsA) {
        expect(contentsB.has(c)).toBe(false);
      }
    });

    it("context state is isolated between chats", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      const chatB = chatService.createChat({ name: "Chat B" });

      // Set context state for chat A
      const contextA = contextManager.getContextForChat(chatA);
      contextA.state["lastTopic"] = "typescript";

      // Chat B should not have any state from A
      const contextB = contextManager.getContextForChat(chatB);
      expect(contextB.state).toEqual({});
      expect(contextB.state["lastTopic"]).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // TT-009-26: switchChat loads target context
  // -----------------------------------------------------------------------

  describe("TT-009-26: switchChat loads target context", () => {
    it("switches current chat and loads target messages", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      const chatB = chatService.createChat({ name: "Chat B" });

      addTestMessages(chatService, chatA, [
        { role: "user", content: "Message in A" },
      ]);
      addTestMessages(chatService, chatB, [
        { role: "user", content: "Message in B" },
        { role: "assistant", content: "Response in B" },
      ]);

      // Initially no current chat
      expect(contextManager.getCurrentChatId()).toBeNull();

      // Switch to chat B
      contextManager.switchChat(chatB);

      // Current chat is now B
      expect(contextManager.getCurrentChatId()).toBe(chatB);

      // Messages of B are loaded
      const currentContext = contextManager.getCurrentContext();
      expect(currentContext).not.toBeNull();
      expect(currentContext!.messages).toHaveLength(2);
      expect(currentContext!.messages[0]!.content).toBe("Message in B");
      expect(currentContext!.messages[1]!.content).toBe("Response in B");
    });

    it("getContextForChat returns fresh context from DB", () => {
      const chatId = chatService.createChat({ name: "Test Chat" });
      addTestMessages(chatService, chatId, [
        { role: "user", content: "First message" },
        { role: "assistant", content: "First response" },
      ]);

      const context = contextManager.getContextForChat(chatId);
      expect(context.messages).toHaveLength(2);
      expect(context.chat.id).toBe(chatId);
      expect(context.chat.name).toBe("Test Chat");
    });
  });

  // -----------------------------------------------------------------------
  // TT-009-27: switchChat preserves source context
  // -----------------------------------------------------------------------

  describe("TT-009-27: switchChat preserves source context", () => {
    it("switching from A to B preserves A messages in DB", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      const chatB = chatService.createChat({ name: "Chat B" });

      addTestMessages(chatService, chatA, [
        { role: "user", content: "Important message in A" },
        { role: "assistant", content: "Important response in A" },
      ]);
      addTestMessages(chatService, chatB, [
        { role: "user", content: "Message in B" },
      ]);

      // Set state for chat A
      const contextA = contextManager.getContextForChat(chatA);
      contextA.state["lastTopic"] = "important";

      // Switch to B
      contextManager.switchChat(chatB);

      // A messages still exist
      const contextAPreserved = contextManager.getContextForChat(chatA);
      expect(contextAPreserved.messages).toHaveLength(2);
      expect(contextAPreserved.messages[0]!.content).toBe("Important message in A");
      expect(contextAPreserved.messages[1]!.content).toBe("Important response in A");

      // A state still exists
      expect(contextAPreserved.state["lastTopic"]).toBe("important");
    });

    it("switching back to original chat restores full context", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      const chatB = chatService.createChat({ name: "Chat B" });

      addTestMessages(chatService, chatA, [
        { role: "user", content: "A msg 1" },
        { role: "assistant", content: "A resp 1" },
      ]);
      addTestMessages(chatService, chatB, [
        { role: "user", content: "B msg 1" },
      ]);

      // Switch A -> B
      contextManager.switchChat(chatA);
      expect(contextManager.getCurrentChatId()).toBe(chatA);

      contextManager.switchChat(chatB);
      expect(contextManager.getCurrentChatId()).toBe(chatB);

      // Switch back B -> A
      contextManager.switchChat(chatA);
      expect(contextManager.getCurrentChatId()).toBe(chatA);

      const currentContext = contextManager.getCurrentContext();
      expect(currentContext).not.toBeNull();
      expect(currentContext!.messages).toHaveLength(2);
      expect(currentContext!.messages[0]!.content).toBe("A msg 1");
      expect(currentContext!.messages[1]!.content).toBe("A resp 1");
    });
  });

  // -----------------------------------------------------------------------
  // TT-009-28: WS notification on switch
  // -----------------------------------------------------------------------

  describe("TT-009-28: WS notification on chat switch", () => {
    it("broadcasts on_chat_switch event to connected clients", () => {
      const broadcastSpy = vi.spyOn(wsServer, "broadcast");

      const chatA = chatService.createChat({ name: "Chat A" });
      const chatB = chatService.createChat({ name: "Chat B" });

      contextManager.switchChat(chatA);
      expect(broadcastSpy).toHaveBeenCalledTimes(1);

      const firstCall = broadcastSpy.mock.calls[0]![0] as Record<string, unknown>;
      expect(firstCall["type"]).toBe("on_chat_switch");
      expect(firstCall["payload"]).toBeDefined();

      const payload = firstCall["payload"] as Record<string, unknown>;
      expect(payload["chatId"]).toBe(chatA);
      expect(payload["previousChatId"]).toBeNull();

      // Switch to B
      contextManager.switchChat(chatB);
      expect(broadcastSpy).toHaveBeenCalledTimes(2);

      const secondCall = broadcastSpy.mock.calls[1]![0] as Record<string, unknown>;
      expect(secondCall["type"]).toBe("on_chat_switch");
      const payload2 = secondCall["payload"] as Record<string, unknown>;
      expect(payload2["chatId"]).toBe(chatB);
      expect(payload2["previousChatId"]).toBe(chatA);
    });

    it("includes chat metadata in the notification payload", () => {
      const broadcastSpy = vi.spyOn(wsServer, "broadcast");

      const chatId = chatService.createChat({ name: "Test Chat", description: "A test" });

      contextManager.switchChat(chatId);

      const call = broadcastSpy.mock.calls[0]![0] as Record<string, unknown>;
      const payload = call["payload"] as Record<string, unknown>;
      expect(payload["chat"]).toBeDefined();
      const chat = payload["chat"] as Record<string, unknown>;
      expect(chat["id"]).toBe(chatId);
      expect(chat["name"]).toBe("Test Chat");
      expect(chat["description"]).toBe("A test");
    });
  });

  // -----------------------------------------------------------------------
  // TT-009-29: Switch to non-existent chat
  // -----------------------------------------------------------------------

  describe("TT-009-29: switch to non-existent chat", () => {
    it("throws error when switching to a non-existent chat", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      contextManager.switchChat(chatA);

      const fakeId = "00000000-0000-0000-0000-000000000000";
      expect(() => contextManager.switchChat(fakeId)).toThrow("Chat not found");
    });

    it("does not change current chat when switch to non-existent fails", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      contextManager.switchChat(chatA);

      const fakeId = "00000000-0000-0000-0000-000000000000";
      try {
        contextManager.switchChat(fakeId);
      } catch {
        // Expected
      }

      // Current chat should remain A
      expect(contextManager.getCurrentChatId()).toBe(chatA);
    });

    it("does not broadcast when switch to non-existent chat fails", () => {
      const broadcastSpy = vi.spyOn(wsServer, "broadcast");

      const chatA = chatService.createChat({ name: "Chat A" });
      contextManager.switchChat(chatA);
      broadcastSpy.mockClear();

      const fakeId = "00000000-0000-0000-0000-000000000000";
      try {
        contextManager.switchChat(fakeId);
      } catch {
        // Expected
      }

      // No additional broadcast after the initial switch
      expect(broadcastSpy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Additional tests
  // -----------------------------------------------------------------------

  describe("context state management", () => {
    it("updateContextState persists state for the current chat", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      contextManager.switchChat(chatA);

      contextManager.updateContextState({ "topic": "rust", "count": 42 });

      const context = contextManager.getCurrentContext();
      expect(context).not.toBeNull();
      expect(context!.state["topic"]).toBe("rust");
      expect(context!.state["count"]).toBe(42);
    });

    it("state is per-chat -- updating one chat does not affect another", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      const chatB = chatService.createChat({ name: "Chat B" });

      contextManager.switchChat(chatA);
      contextManager.updateContextState({ "key": "valueA" });

      contextManager.switchChat(chatB);
      expect(contextManager.getCurrentContext()!.state).toEqual({});

      contextManager.updateContextState({ "key": "valueB" });

      // Switch back to A -- state should be valueA
      contextManager.switchChat(chatA);
      expect(contextManager.getCurrentContext()!.state["key"]).toBe("valueA");
    });

    it("clearContextState removes all state for the current chat", () => {
      const chatA = chatService.createChat({ name: "Chat A" });
      contextManager.switchChat(chatA);
      contextManager.updateContextState({ "a": 1, "b": 2 });

      contextManager.clearContextState();

      expect(contextManager.getCurrentContext()!.state).toEqual({});
    });
  });

  describe("getCurrentContext", () => {
    it("returns null when no chat is active", () => {
      expect(contextManager.getCurrentContext()).toBeNull();
    });
  });
});
