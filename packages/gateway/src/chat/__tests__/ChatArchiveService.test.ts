/**
 * @osai/gateway -- ChatArchiveService Unit Tests (T-006)
 *
 * Tests for chat archiving, unarchiving, active chat limit enforcement,
 * archived listing, and delete with limit verification.
 *
 * Test IDs: TT-009-30 through TT-009-35
 * Uses in-memory SQLite (':memory:') for complete isolation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseManager } from "@osai/shared";
import { ChatService } from "../ChatService.js";
import { ChatArchiveService } from "../ChatArchiveService.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Create an in-memory DatabaseManager with schema applied.
 * Each test gets a fresh database.
 */
function createTestDb(): DatabaseManager {
  const dbManager = new DatabaseManager({ dbPath: ":memory:" });
  dbManager.initialize();
  return dbManager;
}

/**
 * Helper to create N active chats.
 */
function createNChats(chatService: ChatService, n: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = chatService.createChat({
      name: `Chat ${i.toString().padStart(2, "0")}`,
    });
    ids.push(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Custom error class used by ChatArchiveService
// ---------------------------------------------------------------------------

// Re-import the error class for type assertions in tests.
// ChatArchiveService exports these via its module.

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatArchiveService", () => {
  let dbManager: DatabaseManager;
  let chatService: ChatService;
  let archiveService: ChatArchiveService;

  beforeEach(() => {
    dbManager = createTestDb();
    chatService = new ChatService(dbManager);
    chatService.ensureSchema();
    archiveService = new ChatArchiveService(chatService);
  });

  // =========================================================================
  // archiveChat
  // =========================================================================

  describe("archiveChat", () => {
    it("TT-009-30: should set isActive=false for an active chat", () => {
      const id = chatService.createChat({ name: "To Archive" });
      expect(chatService.getChat(id)!.isActive).toBe(true);

      archiveService.archiveChat(id);

      expect(chatService.getChat(id)!.isActive).toBe(false);
    });

    it("should not include archived chat in active list", () => {
      const id = chatService.createChat({ name: "To Archive" });
      const id2 = chatService.createChat({ name: "Stay Active" });

      archiveService.archiveChat(id);

      const activeChats = chatService.listChats({ activeOnly: true });
      expect(activeChats).toHaveLength(1);
      expect(activeChats[0]!.id).toBe(id2);
    });

    it("should throw if chat does not exist", () => {
      expect(() => archiveService.archiveChat("non-existent")).toThrow();
    });

    it("should be idempotent -- archiving an already archived chat is a no-op", () => {
      const id = chatService.createChat({ name: "Already Archived" });
      archiveService.archiveChat(id);

      // Archive again -- should not throw
      expect(() => archiveService.archiveChat(id)).not.toThrow();
      expect(chatService.getChat(id)!.isActive).toBe(false);
    });
  });

  // =========================================================================
  // unarchiveChat
  // =========================================================================

  describe("unarchiveChat", () => {
    it("TT-009-31: should restore isActive=true for an archived chat", () => {
      const id = chatService.createChat({ name: "To Unarchive" });
      archiveService.archiveChat(id);
      expect(chatService.getChat(id)!.isActive).toBe(false);

      archiveService.unarchiveChat(id);

      expect(chatService.getChat(id)!.isActive).toBe(true);
    });

    it("should include unarchived chat in active list", () => {
      const id = chatService.createChat({ name: "Restore Me" });
      archiveService.archiveChat(id);

      archiveService.unarchiveChat(id);

      const activeChats = chatService.listChats({ activeOnly: true });
      expect(activeChats.some((c) => c.id === id)).toBe(true);
    });

    it("should throw if chat does not exist", () => {
      expect(() => archiveService.unarchiveChat("non-existent")).toThrow();
    });

    it("should be idempotent -- unarchiving an already active chat is a no-op", () => {
      const id = chatService.createChat({ name: "Already Active" });
      expect(chatService.getChat(id)!.isActive).toBe(true);

      // Unarchive again -- should not throw
      expect(() => archiveService.unarchiveChat(id)).not.toThrow();
      expect(chatService.getChat(id)!.isActive).toBe(true);
    });

    it("should enforce active limit when unarchiving", () => {
      // Create 20 active chats
      createNChats(chatService, 20);

      // Archive one to make room
      const archivedId = chatService.createChat({ name: "Extra" });
      archiveService.archiveChat(archivedId);

      // Now there are 20 active. Try to unarchive -- should fail
      expect(() => archiveService.unarchiveChat(archivedId)).toThrow();
    });
  });

  // =========================================================================
  // Active limit enforcement (createChat)
  // =========================================================================

  describe("enforceActiveLimit / createChatWithLimit", () => {
    it("TT-009-32: should reject creating the 21st active chat", () => {
      // Create 20 active chats
      createNChats(chatService, 20);
      expect(chatService.getActiveCount()).toBe(20);

      // Attempt to create 21st -- should throw
      expect(() =>
        archiveService.createChatWithLimit({ name: "Chat 21" }),
      ).toThrow(/max.*20.*active.*chat/i);
    });

    it("should allow creating up to 20 active chats", () => {
      createNChats(chatService, 19);
      expect(chatService.getActiveCount()).toBe(19);

      // 20th should succeed
      const id = archiveService.createChatWithLimit({ name: "Chat 20" });
      expect(id).toBeDefined();
      expect(chatService.getActiveCount()).toBe(20);
    });

    it("should allow creating a chat when below the limit", () => {
      createNChats(chatService, 5);

      const id = archiveService.createChatWithLimit({ name: "Chat 6" });
      expect(id).toBeDefined();
      expect(chatService.getActiveCount()).toBe(6);
    });

    it("TT-009-33: should allow creating after archiving to free a slot", () => {
      // Create 20 active chats
      const ids = createNChats(chatService, 20);
      expect(chatService.getActiveCount()).toBe(20);

      // Archive one
      archiveService.archiveChat(ids[0]!);
      expect(chatService.getActiveCount()).toBe(19);

      // Now create a new one -- should succeed
      const newId = archiveService.createChatWithLimit({ name: "New Chat" });
      expect(newId).toBeDefined();
      expect(chatService.getActiveCount()).toBe(20);

      // The new chat should be active
      expect(chatService.getChat(newId)!.isActive).toBe(true);
    });

    it("should include a helpful error message suggesting archival", () => {
      createNChats(chatService, 20);

      try {
        archiveService.createChatWithLimit({ name: "Overflow" });
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // Error should mention archive or the limit
        expect(message.toLowerCase()).toMatch(/(archive|max|limit|20)/);
      }
    });
  });

  // =========================================================================
  // deleteChat
  // =========================================================================

  describe("deleteChat", () => {
    it("TT-009-34: should delete an archived chat and its messages", () => {
      const id = chatService.createChat({ name: "Archived with Messages" });
      chatService.addMessage(id, { role: "user", content: "Hello" });
      chatService.addMessage(id, { role: "assistant", content: "World" });

      archiveService.archiveChat(id);
      expect(chatService.getChat(id)!.isActive).toBe(false);

      archiveService.deleteChat(id);

      expect(chatService.getChat(id)).toBeNull();
      expect(chatService.getMessages(id)).toHaveLength(0);
    });

    it("should free an active slot when deleting an active chat", () => {
      createNChats(chatService, 20);
      expect(chatService.getActiveCount()).toBe(20);

      // Delete one active chat
      const firstId = chatService.listChats({ activeOnly: true })[0]!.id;
      archiveService.deleteChat(firstId);

      expect(chatService.getActiveCount()).toBe(19);
    });

    it("should throw if chat does not exist", () => {
      expect(() => archiveService.deleteChat("non-existent")).toThrow();
    });

    it("should not affect other chats", () => {
      const id1 = chatService.createChat({ name: "Keep" });
      const id2 = chatService.createChat({ name: "Delete Me" });
      archiveService.archiveChat(id2);

      archiveService.deleteChat(id2);

      expect(chatService.getChat(id1)).not.toBeNull();
      expect(chatService.getChat(id2)).toBeNull();
    });
  });

  // =========================================================================
  // listArchived
  // =========================================================================

  describe("listArchived", () => {
    it("TT-009-35: should return only archived chats", () => {
      const id1 = chatService.createChat({ name: "Active A" });
      const id2 = chatService.createChat({ name: "Archived B" });
      const id3 = chatService.createChat({ name: "Archived C" });
      const id4 = chatService.createChat({ name: "Active D" });

      archiveService.archiveChat(id2);
      archiveService.archiveChat(id3);

      const archived = archiveService.listArchived();
      expect(archived).toHaveLength(2);
      const archivedIds = archived.map((c) => c.id);
      expect(archivedIds).toContain(id2);
      expect(archivedIds).toContain(id3);
      expect(archivedIds).not.toContain(id1);
      expect(archivedIds).not.toContain(id4);
    });

    it("should return empty array when no chats are archived", () => {
      chatService.createChat({ name: "Active" });
      chatService.createChat({ name: "Also Active" });

      const archived = archiveService.listArchived();
      expect(archived).toEqual([]);
    });

    it("should return empty array when no chats exist at all", () => {
      const archived = archiveService.listArchived();
      expect(archived).toEqual([]);
    });
  });

  // =========================================================================
  // Edge cases / boundary conditions
  // =========================================================================

  describe("boundary conditions", () => {
    it("should correctly track count through archive/unarchive/delete cycles", () => {
      const id1 = chatService.createChat({ name: "Chat 1" });
      const id2 = chatService.createChat({ name: "Chat 2" });
      expect(chatService.getActiveCount()).toBe(2);

      // Archive one
      archiveService.archiveChat(id1);
      expect(chatService.getActiveCount()).toBe(1);

      // Unarchive it back
      archiveService.unarchiveChat(id1);
      expect(chatService.getActiveCount()).toBe(2);

      // Delete one
      archiveService.deleteChat(id2);
      expect(chatService.getActiveCount()).toBe(1);

      // Archive the remaining one
      archiveService.archiveChat(id1);
      expect(chatService.getActiveCount()).toBe(0);

      // Delete archived
      archiveService.deleteChat(id1);
      expect(chatService.getActiveCount()).toBe(0);
    });

    it("should handle rapid archive/unarchive operations correctly", () => {
      const id = chatService.createChat({ name: "Rapid" });

      for (let i = 0; i < 10; i++) {
        archiveService.archiveChat(id);
        expect(chatService.getChat(id)!.isActive).toBe(false);

        archiveService.unarchiveChat(id);
        expect(chatService.getChat(id)!.isActive).toBe(true);
      }
    });

    it("should allow creating exactly 20, archive 1, create 1 to stay at 20", () => {
      const ids = createNChats(chatService, 20);

      // Archive first
      archiveService.archiveChat(ids[0]!);

      // Create new -- should succeed
      const newId = archiveService.createChatWithLimit({ name: "Replacement" });
      expect(newId).toBeDefined();

      // Should still be at 20 active
      expect(chatService.getActiveCount()).toBe(20);

      // Archived chat should not be in active list
      const activeIds = chatService
        .listChats({ activeOnly: true })
        .map((c) => c.id);
      expect(activeIds).not.toContain(ids[0]);
      expect(activeIds).toContain(newId);
    });

    it("should preserve chat data when archiving and unarchiving", () => {
      const id = chatService.createChat({
        name: "Preserve Me",
        description: "Important description",
        tags: ["tag1", "tag2"],
        icon: "star",
        color: "#FF0000",
        channel: "telegram",
        channelMetadata: { groupId: 123 },
      });
      chatService.addMessage(id, { role: "user", content: "Hello" });

      archiveService.archiveChat(id);
      archiveService.unarchiveChat(id);

      const chat = chatService.getChat(id)!;
      expect(chat.name).toBe("Preserve Me");
      expect(chat.description).toBe("Important description");
      expect(chat.tags).toEqual(["tag1", "tag2"]);
      expect(chat.icon).toBe("star");
      expect(chat.color).toBe("#FF0000");
      expect(chat.channel).toBe("telegram");
      expect(chat.channelMetadata).toEqual({ groupId: 123 });
      expect(chatService.getMessages(id)).toHaveLength(1);
    });
  });
});
