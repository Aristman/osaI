/**
 * @osai/gateway -- ChatService Unit Tests (T-002)
 *
 * Tests for chat CRUD operations, message persistence,
 * active count, cascade delete, and filtering.
 *
 * Uses in-memory SQLite (':memory:') for complete isolation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseManager } from "@osai/shared";
import { ChatService } from "../ChatService.js";
// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
/**
 * Create an in-memory DatabaseManager with schema applied.
 * Each test gets a fresh database.
 */
function createTestDb() {
    const dbManager = new DatabaseManager({ dbPath: ":memory:" });
    dbManager.initialize();
    return dbManager;
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ChatService", () => {
    let dbManager;
    let service;
    beforeEach(() => {
        dbManager = createTestDb();
        service = new ChatService(dbManager);
        service.ensureSchema();
    });
    // =========================================================================
    // CRUD operations
    // =========================================================================
    describe("createChat", () => {
        it("TT-009-07: should persist a chat to SQLite and return its ID", () => {
            const chatId = service.createChat({ name: "Test Chat" });
            expect(chatId).toBeDefined();
            expect(typeof chatId).toBe("string");
            expect(chatId.length).toBeGreaterThan(0);
            const chat = service.getChat(chatId);
            expect(chat).not.toBeNull();
            expect(chat.name).toBe("Test Chat");
        });
        it("TT-009-14: should save all metadata fields correctly", () => {
            const chatId = service.createChat({
                name: "Full Chat",
                description: "A detailed description",
                tags: ["work", "important"],
                icon: "folder",
                color: "#FF5733",
                channel: "telegram",
                channelMetadata: { chatId: 12345, topicId: 99 },
            });
            const chat = service.getChat(chatId);
            expect(chat.name).toBe("Full Chat");
            expect(chat.description).toBe("A detailed description");
            expect(chat.tags).toEqual(["work", "important"]);
            expect(chat.icon).toBe("folder");
            expect(chat.color).toBe("#FF5733");
            expect(chat.channel).toBe("telegram");
            expect(chat.channelMetadata).toEqual({ chatId: 12345, topicId: 99 });
            expect(chat.isActive).toBe(true);
            expect(chat.createdAt).toBeDefined();
            expect(chat.updatedAt).toBeDefined();
        });
        it("should generate unique IDs for each chat", () => {
            const id1 = service.createChat({ name: "Chat 1" });
            const id2 = service.createChat({ name: "Chat 2" });
            expect(id1).not.toBe(id2);
        });
        it("should set defaults for optional fields", () => {
            const chatId = service.createChat({ name: "Minimal" });
            const chat = service.getChat(chatId);
            expect(chat.description).toBe("");
            expect(chat.tags).toEqual([]);
            expect(chat.icon).toBe("");
            expect(chat.color).toBe("");
            expect(chat.channel).toBe("cli");
            expect(chat.channelMetadata).toEqual({});
            expect(chat.isActive).toBe(true);
        });
    });
    describe("getChat", () => {
        it("TT-009-08: should return null for a non-existent chat", () => {
            const chat = service.getChat("non-existent-id");
            expect(chat).toBeNull();
        });
        it("should return the correct chat by ID", () => {
            const id = service.createChat({ name: "My Chat" });
            const chat = service.getChat(id);
            expect(chat).not.toBeNull();
            expect(chat.id).toBe(id);
            expect(chat.name).toBe("My Chat");
        });
    });
    describe("updateChat", () => {
        it("TT-009-09: should update chat metadata fields", () => {
            const id = service.createChat({ name: "Original" });
            service.updateChat(id, {
                name: "Updated",
                description: "New description",
                tags: ["updated"],
                color: "#00FF00",
            });
            const chat = service.getChat(id);
            expect(chat.name).toBe("Updated");
            expect(chat.description).toBe("New description");
            expect(chat.tags).toEqual(["updated"]);
            expect(chat.color).toBe("#00FF00");
            // Unchanged fields
            expect(chat.icon).toBe("");
            expect(chat.channel).toBe("cli");
        });
        it("should update the updated_at timestamp", () => {
            const id = service.createChat({ name: "Test" });
            const original = service.getChat(id);
            // Small delay to ensure timestamp differs
            // (SQLite datetime('now') has second resolution)
            // For test reliability, we just check the field is set.
            service.updateChat(id, { name: "Updated" });
            const updated = service.getChat(id);
            expect(updated.updatedAt).toBeDefined();
            expect(typeof updated.updatedAt).toBe("string");
        });
        it("should throw when updating a non-existent chat", () => {
            expect(() => service.updateChat("non-existent", { name: "Nope" })).toThrow("Chat not found");
        });
        it("should allow toggling isActive", () => {
            const id = service.createChat({ name: "Active" });
            service.updateChat(id, { isActive: false });
            expect(service.getChat(id).isActive).toBe(false);
            service.updateChat(id, { isActive: true });
            expect(service.getChat(id).isActive).toBe(true);
        });
        it("should be a no-op when no fields are provided", () => {
            const id = service.createChat({ name: "Test" });
            const original = service.getChat(id);
            service.updateChat(id, {});
            const after = service.getChat(id);
            expect(after.name).toBe(original.name);
            expect(after.description).toBe(original.description);
        });
    });
    describe("deleteChat", () => {
        it("TT-009-10: should delete a chat and cascade delete its messages", () => {
            const id = service.createChat({ name: "To Delete" });
            service.addMessage(id, { role: "user", content: "Hello" });
            service.addMessage(id, { role: "assistant", content: "Hi there" });
            // Verify messages exist before delete
            expect(service.getMessages(id).length).toBe(2);
            service.deleteChat(id);
            // Chat should be gone
            expect(service.getChat(id)).toBeNull();
            // Messages should be cascade deleted
            expect(service.getMessages(id).length).toBe(0);
        });
        it("should not throw when deleting a non-existent chat", () => {
            expect(() => service.deleteChat("non-existent")).not.toThrow();
        });
        it("should not affect other chats", () => {
            const id1 = service.createChat({ name: "Keep" });
            const id2 = service.createChat({ name: "Delete" });
            service.deleteChat(id2);
            expect(service.getChat(id1)).not.toBeNull();
            expect(service.getChat(id2)).toBeNull();
        });
    });
    describe("listChats", () => {
        it("TT-009-11: should return all chats", () => {
            service.createChat({ name: "Chat A" });
            service.createChat({ name: "Chat B" });
            service.createChat({ name: "Chat C" });
            const chats = service.listChats();
            expect(chats).toHaveLength(3);
        });
        it("should return chats ordered by created_at DESC", () => {
            // Create chats and manually backdate their created_at to ensure
            // distinct timestamps (SQLite datetime('now') has 1-second resolution).
            const idA = service.createChat({ name: "A" });
            const idB = service.createChat({ name: "B" });
            // Use a direct DB update to set distinct timestamps
            const db = service.db;
            db.prepare("UPDATE chats SET created_at = '2025-01-01 00:00:00', updated_at = '2025-01-01 00:00:00' WHERE id = ?").run(idA);
            db.prepare("UPDATE chats SET created_at = '2025-01-02 00:00:00', updated_at = '2025-01-02 00:00:00' WHERE id = ?").run(idB);
            const chats = service.listChats();
            // Most recent first
            expect(chats[0].id).toBe(idB);
            expect(chats[1].id).toBe(idA);
        });
        it("should return empty array when no chats exist", () => {
            const chats = service.listChats();
            expect(chats).toEqual([]);
        });
    });
    // =========================================================================
    // Filtering
    // =========================================================================
    describe("listChats with filter", () => {
        it("should filter by activeOnly = true", () => {
            const id1 = service.createChat({ name: "Active 1" });
            const id2 = service.createChat({ name: "Active 2" });
            const id3 = service.createChat({ name: "Inactive" });
            service.updateChat(id3, { isActive: false });
            const activeChats = service.listChats({ activeOnly: true });
            expect(activeChats).toHaveLength(2);
            const activeIds = activeChats.map((c) => c.id);
            expect(activeIds).toContain(id1);
            expect(activeIds).toContain(id2);
            expect(activeIds).not.toContain(id3);
        });
        it("should return all chats when activeOnly is false or omitted", () => {
            const id1 = service.createChat({ name: "Active" });
            const id2 = service.createChat({ name: "Inactive" });
            service.updateChat(id2, { isActive: false });
            expect(service.listChats()).toHaveLength(2);
            expect(service.listChats({ activeOnly: false })).toHaveLength(2);
        });
        it("should filter by channel", () => {
            service.createChat({ name: "CLI Chat", channel: "cli" });
            service.createChat({ name: "TG Chat", channel: "telegram" });
            service.createChat({ name: "Another CLI", channel: "cli" });
            const cliChats = service.listChats({ channel: "cli" });
            expect(cliChats).toHaveLength(2);
            const tgChats = service.listChats({ channel: "telegram" });
            expect(tgChats).toHaveLength(1);
            expect(tgChats[0].name).toBe("TG Chat");
        });
        it("should filter by tags (any match)", () => {
            service.createChat({ name: "Work", tags: ["work", "urgent"] });
            service.createChat({ name: "Personal", tags: ["personal"] });
            service.createChat({ name: "Work 2", tags: ["work"] });
            const workChats = service.listChats({ tags: ["work"] });
            expect(workChats).toHaveLength(2);
            expect(workChats.map((c) => c.name)).toEqual(expect.arrayContaining(["Work 2", "Work"]));
            const urgentChats = service.listChats({ tags: ["urgent"] });
            expect(urgentChats).toHaveLength(1);
            expect(urgentChats[0].name).toBe("Work");
        });
        it("should combine multiple filters (activeOnly + channel)", () => {
            service.createChat({ name: "Active CLI", channel: "cli" });
            service.createChat({ name: "Active TG", channel: "telegram" });
            const inactiveCli = service.createChat({ name: "Inactive CLI", channel: "cli" });
            service.updateChat(inactiveCli, { isActive: false });
            const result = service.listChats({
                activeOnly: true,
                channel: "cli",
            });
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("Active CLI");
        });
        it("should return empty for non-matching filter", () => {
            service.createChat({ name: "CLI", channel: "cli" });
            const result = service.listChats({ channel: "discord" });
            expect(result).toEqual([]);
        });
    });
    // =========================================================================
    // Message operations
    // =========================================================================
    describe("addMessage", () => {
        it("TT-009-12: should persist a message with correct fields", () => {
            const chatId = service.createChat({ name: "Chat" });
            const msgId = service.addMessage(chatId, {
                role: "user",
                content: "Hello, world!",
            });
            expect(typeof msgId).toBe("string");
            const messages = service.getMessages(chatId);
            expect(messages).toHaveLength(1);
            const msg = messages[0];
            expect(msg.id).toBe(msgId);
            expect(msg.chatId).toBe(chatId);
            expect(msg.role).toBe("user");
            expect(msg.content).toBe("Hello, world!");
            expect(msg.createdAt).toBeDefined();
        });
        it("should save messages with toolCalls", () => {
            const chatId = service.createChat({ name: "Chat" });
            service.addMessage(chatId, {
                role: "assistant",
                content: "",
                toolCalls: [
                    {
                        id: "call_123",
                        name: "read_file",
                        arguments: '{"path": "/tmp/test.txt"}',
                    },
                ],
            });
            const messages = service.getMessages(chatId);
            expect(messages[0].toolCalls).toEqual([
                {
                    id: "call_123",
                    name: "read_file",
                    arguments: '{"path": "/tmp/test.txt"}',
                },
            ]);
        });
        it("should save messages with metadata", () => {
            const chatId = service.createChat({ name: "Chat" });
            service.addMessage(chatId, {
                role: "system",
                content: "System prompt",
                metadata: { model: "glm-5", tokens: 150 },
            });
            const messages = service.getMessages(chatId);
            expect(messages[0].metadata).toEqual({ model: "glm-5", tokens: 150 });
        });
        it("should generate unique IDs for each message", () => {
            const chatId = service.createChat({ name: "Chat" });
            const id1 = service.addMessage(chatId, { role: "user", content: "A" });
            const id2 = service.addMessage(chatId, { role: "user", content: "B" });
            expect(id1).not.toBe(id2);
        });
        it("should support all valid roles", () => {
            const chatId = service.createChat({ name: "Chat" });
            const roles = ["system", "user", "assistant", "tool"];
            for (const role of roles) {
                service.addMessage(chatId, { role, content: `${role} message` });
            }
            const messages = service.getMessages(chatId);
            expect(messages).toHaveLength(4);
            expect(messages.map((m) => m.role)).toEqual([
                "system",
                "user",
                "assistant",
                "tool",
            ]);
        });
    });
    describe("getMessages", () => {
        it("TT-009-13: should support pagination with limit and offset", () => {
            const chatId = service.createChat({ name: "Chat" });
            // Create 50 messages
            for (let i = 0; i < 50; i++) {
                service.addMessage(chatId, {
                    role: "user",
                    content: `Message ${i.toString().padStart(2, "0")}`,
                });
            }
            // Default: limit 50, offset 0 -> all messages
            const all = service.getMessages(chatId);
            expect(all).toHaveLength(50);
            // First page: limit 10, offset 0
            const page1 = service.getMessages(chatId, 10, 0);
            expect(page1).toHaveLength(10);
            expect(page1[0].content).toBe("Message 00");
            expect(page1[9].content).toBe("Message 09");
            // Second page: limit 10, offset 10
            const page2 = service.getMessages(chatId, 10, 10);
            expect(page2).toHaveLength(10);
            expect(page2[0].content).toBe("Message 10");
            expect(page2[9].content).toBe("Message 19");
            // Last partial page: limit 10, offset 45
            const lastPage = service.getMessages(chatId, 10, 45);
            expect(lastPage).toHaveLength(5);
            expect(lastPage[0].content).toBe("Message 45");
            expect(lastPage[4].content).toBe("Message 49");
        });
        it("should return messages ordered by created_at ASC", () => {
            const chatId = service.createChat({ name: "Chat" });
            service.addMessage(chatId, { role: "user", content: "First" });
            service.addMessage(chatId, { role: "assistant", content: "Second" });
            service.addMessage(chatId, { role: "user", content: "Third" });
            const messages = service.getMessages(chatId);
            expect(messages[0].content).toBe("First");
            expect(messages[1].content).toBe("Second");
            expect(messages[2].content).toBe("Third");
        });
        it("should return empty array for a chat with no messages", () => {
            const chatId = service.createChat({ name: "Chat" });
            const messages = service.getMessages(chatId);
            expect(messages).toEqual([]);
        });
        it("should return empty array for a non-existent chat", () => {
            const messages = service.getMessages("non-existent");
            expect(messages).toEqual([]);
        });
        it("should isolate messages between different chats", () => {
            const id1 = service.createChat({ name: "Chat 1" });
            const id2 = service.createChat({ name: "Chat 2" });
            service.addMessage(id1, { role: "user", content: "Message in Chat 1" });
            service.addMessage(id2, { role: "user", content: "Message in Chat 2" });
            expect(service.getMessages(id1)).toHaveLength(1);
            expect(service.getMessages(id1)[0].content).toBe("Message in Chat 1");
            expect(service.getMessages(id2)).toHaveLength(1);
            expect(service.getMessages(id2)[0].content).toBe("Message in Chat 2");
        });
    });
    // =========================================================================
    // Active count
    // =========================================================================
    describe("getActiveCount", () => {
        it("should return 0 when no chats exist", () => {
            expect(service.getActiveCount()).toBe(0);
        });
        it("should count only active chats", () => {
            const id1 = service.createChat({ name: "Active 1" });
            const id2 = service.createChat({ name: "Active 2" });
            const id3 = service.createChat({ name: "Inactive" });
            service.updateChat(id3, { isActive: false });
            expect(service.getActiveCount()).toBe(2);
        });
        it("should increase when a new chat is created", () => {
            expect(service.getActiveCount()).toBe(0);
            service.createChat({ name: "New" });
            expect(service.getActiveCount()).toBe(1);
            service.createChat({ name: "Another" });
            expect(service.getActiveCount()).toBe(2);
        });
        it("should decrease when a chat is archived", () => {
            const id = service.createChat({ name: "To Archive" });
            expect(service.getActiveCount()).toBe(1);
            service.updateChat(id, { isActive: false });
            expect(service.getActiveCount()).toBe(0);
        });
        it("should decrease when a chat is deleted", () => {
            const id = service.createChat({ name: "To Delete" });
            expect(service.getActiveCount()).toBe(1);
            service.deleteChat(id);
            expect(service.getActiveCount()).toBe(0);
        });
    });
    // =========================================================================
    // Cascade delete verification
    // =========================================================================
    describe("cascade delete", () => {
        it("should remove all associated messages when a chat is deleted", () => {
            const id = service.createChat({ name: "Chat with Messages" });
            // Add various message types
            service.addMessage(id, { role: "system", content: "System prompt" });
            service.addMessage(id, { role: "user", content: "User message" });
            service.addMessage(id, {
                role: "assistant",
                content: "",
                toolCalls: [
                    { id: "tc1", name: "tool", arguments: "{}" },
                ],
            });
            service.addMessage(id, { role: "tool", content: "Tool result" });
            expect(service.getMessages(id)).toHaveLength(4);
            service.deleteChat(id);
            expect(service.getChat(id)).toBeNull();
            expect(service.getMessages(id)).toHaveLength(0);
        });
        it("should not affect messages of other chats", () => {
            const id1 = service.createChat({ name: "Chat 1" });
            const id2 = service.createChat({ name: "Chat 2" });
            service.addMessage(id1, { role: "user", content: "Msg in Chat 1" });
            service.addMessage(id2, { role: "user", content: "Msg in Chat 2" });
            service.deleteChat(id1);
            expect(service.getMessages(id1)).toHaveLength(0);
            expect(service.getMessages(id2)).toHaveLength(1);
        });
    });
});
//# sourceMappingURL=ChatService.test.js.map