/**
 * TUI State Reducer tests (T-003)
 *
 * Тесты чистого reducer для управления состоянием TUI.
 */
import { describe, it, expect } from "vitest";
import { tuiReducer, initialTUIState } from "../../tui/tui-state.js";
describe("tuiReducer", () => {
    it("should return initial state for unknown action", () => {
        const state = tuiReducer(initialTUIState, { type: "SET_STREAMING", isStreaming: false });
        expect(state).toEqual(initialTUIState);
    });
    describe("ADD_USER_MESSAGE", () => {
        it("should add a user message to empty messages list", () => {
            const state = tuiReducer(initialTUIState, {
                type: "ADD_USER_MESSAGE",
                content: "Hello",
            });
            expect(state.messages).toHaveLength(1);
            expect(state.messages[0].role).toBe("user");
            expect(state.messages[0].content).toBe("Hello");
        });
        it("should add multiple user messages", () => {
            let state = initialTUIState;
            state = tuiReducer(state, { type: "ADD_USER_MESSAGE", content: "First" });
            state = tuiReducer(state, { type: "ADD_USER_MESSAGE", content: "Second" });
            expect(state.messages).toHaveLength(2);
            expect(state.messages[0].content).toBe("First");
            expect(state.messages[1].content).toBe("Second");
        });
        it("should assign unique IDs to messages", () => {
            let state = initialTUIState;
            state = tuiReducer(state, { type: "ADD_USER_MESSAGE", content: "A" });
            state = tuiReducer(state, { type: "ADD_USER_MESSAGE", content: "B" });
            expect(state.messages[0].id).not.toBe(state.messages[1].id);
        });
    });
    describe("ADD_ASSISTANT_BLOCK (text)", () => {
        it("should create new assistant message for text block", () => {
            let state = initialTUIState;
            state = tuiReducer(state, { type: "ADD_USER_MESSAGE", content: "Hi" });
            state = tuiReducer(state, {
                type: "ADD_ASSISTANT_BLOCK",
                blockType: "text",
                content: "Hello!",
            });
            expect(state.messages).toHaveLength(2);
            expect(state.messages[1].role).toBe("assistant");
            expect(state.messages[1].content).toBe("Hello!");
        });
        it("should append text to existing assistant message", () => {
            let state = initialTUIState;
            state = tuiReducer(state, { type: "ADD_USER_MESSAGE", content: "Hi" });
            state = tuiReducer(state, {
                type: "ADD_ASSISTANT_BLOCK",
                blockType: "text",
                content: "Hello ",
            });
            state = tuiReducer(state, {
                type: "ADD_ASSISTANT_BLOCK",
                blockType: "text",
                content: "World!",
            });
            expect(state.messages).toHaveLength(2);
            expect(state.messages[1].content).toBe("Hello World!");
        });
    });
    describe("ADD_ASSISTANT_BLOCK (code)", () => {
        it("should create new assistant message for code block", () => {
            let state = initialTUIState;
            state = tuiReducer(state, { type: "ADD_USER_MESSAGE", content: "Show code" });
            state = tuiReducer(state, {
                type: "ADD_ASSISTANT_BLOCK",
                blockType: "code",
                content: "const x = 1;",
                language: "typescript",
            });
            expect(state.messages).toHaveLength(2);
            expect(state.messages[1].codeBlocks).toHaveLength(1);
            expect(state.messages[1].codeBlocks[0].language).toBe("typescript");
            expect(state.messages[1].codeBlocks[0].code).toBe("const x = 1;");
        });
        it("should append code block to existing assistant message", () => {
            let state = initialTUIState;
            state = tuiReducer(state, { type: "ADD_USER_MESSAGE", content: "Code" });
            state = tuiReducer(state, {
                type: "ADD_ASSISTANT_BLOCK",
                blockType: "code",
                content: "print('hi')",
                language: "python",
            });
            state = tuiReducer(state, {
                type: "ADD_ASSISTANT_BLOCK",
                blockType: "code",
                content: "console.log('hi')",
                language: "javascript",
            });
            expect(state.messages).toHaveLength(2);
            expect(state.messages[1].codeBlocks).toHaveLength(2);
            expect(state.messages[1].codeBlocks[1].language).toBe("javascript");
        });
    });
    describe("APPEND_STREAMING_TEXT", () => {
        it("should set streaming and append text to last assistant message", () => {
            let state = initialTUIState;
            state = tuiReducer(state, { type: "ADD_USER_MESSAGE", content: "Hi" });
            state = tuiReducer(state, {
                type: "ADD_ASSISTANT_BLOCK",
                blockType: "text",
                content: "Hel",
            });
            state = tuiReducer(state, {
                type: "APPEND_STREAMING_TEXT",
                content: "lo",
            });
            expect(state.isStreaming).toBe(true);
            expect(state.messages[1].content).toBe("Hello");
        });
    });
    describe("FINALIZE_STREAMING", () => {
        it("should set isStreaming to false", () => {
            let state = initialTUIState;
            state = tuiReducer(state, { type: "SET_STREAMING", isStreaming: true });
            state = tuiReducer(state, { type: "FINALIZE_STREAMING" });
            expect(state.isStreaming).toBe(false);
        });
    });
    describe("SET_CONNECTION_STATUS", () => {
        it("should update connection status to connected", () => {
            const state = tuiReducer(initialTUIState, {
                type: "SET_CONNECTION_STATUS",
                status: "connected",
            });
            expect(state.connectionStatus).toBe("connected");
        });
        it("should update connection status to failed", () => {
            const state = tuiReducer(initialTUIState, {
                type: "SET_CONNECTION_STATUS",
                status: "failed",
            });
            expect(state.connectionStatus).toBe("failed");
        });
    });
    describe("SET_CHAT_NAME", () => {
        it("should update chat name", () => {
            const state = tuiReducer(initialTUIState, {
                type: "SET_CHAT_NAME",
                name: "My Project",
            });
            expect(state.chatName).toBe("My Project");
        });
    });
    describe("SET_MODEL_NAME", () => {
        it("should update model name", () => {
            const state = tuiReducer(initialTUIState, {
                type: "SET_MODEL_NAME",
                name: "gpt-4",
            });
            expect(state.modelName).toBe("gpt-4");
        });
    });
    describe("SET_TOOL_PROGRESS", () => {
        it("should set tool progress", () => {
            const state = tuiReducer(initialTUIState, {
                type: "SET_TOOL_PROGRESS",
                progress: {
                    tool: "shell",
                    action: "exec",
                    progress: 0.7,
                    timestamp: Date.now(),
                },
            });
            expect(state.currentToolProgress).not.toBeNull();
            expect(state.currentToolProgress.tool).toBe("shell");
            expect(state.currentToolProgress.progress).toBe(0.7);
        });
    });
    describe("CLEAR_TOOL_PROGRESS", () => {
        it("should clear tool progress", () => {
            let state = initialTUIState;
            state = tuiReducer(state, {
                type: "SET_TOOL_PROGRESS",
                progress: {
                    tool: "shell",
                    action: "exec",
                    timestamp: Date.now(),
                },
            });
            state = tuiReducer(state, { type: "CLEAR_TOOL_PROGRESS" });
            expect(state.currentToolProgress).toBeNull();
        });
    });
    describe("SET_SESSION_ID", () => {
        it("should update session ID", () => {
            const state = tuiReducer(initialTUIState, {
                type: "SET_SESSION_ID",
                sessionId: "sess-123",
            });
            expect(state.sessionId).toBe("sess-123");
        });
    });
    describe("SET_CHAT_ID", () => {
        it("should update chat ID", () => {
            const state = tuiReducer(initialTUIState, {
                type: "SET_CHAT_ID",
                chatId: "chat-456",
            });
            expect(state.chatId).toBe("chat-456");
        });
    });
});
//# sourceMappingURL=tui-state.test.js.map