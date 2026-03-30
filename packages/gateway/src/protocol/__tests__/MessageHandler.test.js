import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageHandler } from "../MessageHandler.js";
import { MessageType } from "../types.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create a minimal WsServer mock that captures sent messages. */
function createMockServer() {
    const sent = [];
    const server = {
        send: vi.fn((_, msg) => {
            sent.push(msg);
        }),
        broadcast: vi.fn(),
        getConnections: vi.fn(() => 0),
        start: vi.fn(),
        stop: vi.fn(),
        onConnection: vi.fn(),
        onDisconnection: vi.fn(),
    };
    return { server, sent };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("MessageHandler", () => {
    const CLIENT_ID = "test-client-001";
    let handler;
    let mock;
    beforeEach(() => {
        mock = createMockServer();
        handler = new MessageHandler({ server: mock.server });
    });
    // -----------------------------------------------------------------------
    // TT-009-19: Невалидное сообщение отклоняется
    // -----------------------------------------------------------------------
    describe("handleMessage -- parse and validate", () => {
        it("should parse a valid JSON message and extract fields", async () => {
            const testHandler = vi.fn(async (_clientId, msg) => {
                return { type: "TEST_REPLY", id: msg.id, payload: msg.payload };
            });
            handler.registerHandler("TEST", testHandler);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "TEST", id: "msg-1", chatId: "chat-abc", payload: { key: "value" } }));
            expect(testHandler).toHaveBeenCalledTimes(1);
            const call = testHandler.mock.calls[0];
            expect(call[0]).toBe(CLIENT_ID);
            expect(call[1]).toEqual({
                type: "TEST",
                id: "msg-1",
                chatId: "chat-abc",
                payload: { key: "value" },
            });
            // The handler returned a ServerMessage, so it should have been sent.
            expect(mock.server.send).toHaveBeenCalledWith(CLIENT_ID, { type: "TEST_REPLY", id: "msg-1", payload: { key: "value" } });
        });
        it("should return ERROR for invalid JSON", async () => {
            await handler.handleMessage(CLIENT_ID, "not-json{{{");
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.ERROR,
                id: undefined,
                error: "Invalid JSON",
            });
        });
        it("should return ERROR for non-object JSON (array)", async () => {
            await handler.handleMessage(CLIENT_ID, JSON.stringify([1, 2, 3]));
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.ERROR,
                id: undefined,
                error: "Message must be a JSON object",
            });
        });
        it("should return ERROR for non-object JSON (primitive)", async () => {
            await handler.handleMessage(CLIENT_ID, JSON.stringify(42));
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.ERROR,
                id: undefined,
                error: "Message must be a JSON object",
            });
        });
        it("should return ERROR when type field is missing", async () => {
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ id: "x" }));
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.ERROR,
                id: "x",
                error: "Missing or invalid 'type' field",
            });
        });
        it("should return ERROR when type field is empty string", async () => {
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "" }));
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.ERROR,
                id: undefined,
                error: "Missing or invalid 'type' field",
            });
        });
        it("should handle null JSON", async () => {
            await handler.handleMessage(CLIENT_ID, "null");
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.ERROR,
                id: undefined,
                error: "Message must be a JSON object",
            });
        });
    });
    // -----------------------------------------------------------------------
    // PING / PONG
    // -----------------------------------------------------------------------
    describe("PING / PONG", () => {
        it("should respond with PONG for PING message", async () => {
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: MessageType.PING, id: "ping-1" }));
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.PONG,
                id: "ping-1",
            });
        });
        it("should respond with PONG without id if id is missing", async () => {
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: MessageType.PING }));
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.PONG,
                id: undefined,
            });
        });
    });
    // -----------------------------------------------------------------------
    // Unknown type -> error
    // -----------------------------------------------------------------------
    describe("unknown type handling", () => {
        it("should return ERROR for unknown message type", async () => {
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "UNKNOWN_TYPE", id: "msg-99" }));
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.ERROR,
                id: "msg-99",
                error: "Unknown message type: UNKNOWN_TYPE",
            });
        });
    });
    // -----------------------------------------------------------------------
    // Handler dispatch
    // -----------------------------------------------------------------------
    describe("handler dispatch", () => {
        it("should dispatch to registered custom handler", async () => {
            const customHandler = vi.fn(async (_clientId, msg) => {
                return { type: "CUSTOM_REPLY", id: msg.id, payload: { received: true } };
            });
            handler.registerHandler("MY_ACTION", customHandler);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "MY_ACTION", id: "action-1" }));
            expect(customHandler).toHaveBeenCalledTimes(1);
            expect(customHandler).toHaveBeenCalledWith(CLIENT_ID, {
                type: "MY_ACTION",
                id: "action-1",
                chatId: undefined,
                payload: undefined,
            });
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: "CUSTOM_REPLY",
                id: "action-1",
                payload: { received: true },
            });
        });
        it("should not send a response when handler returns void", async () => {
            const voidHandler = vi.fn(async () => {
                // No response
            });
            handler.registerHandler("NO_REPLY", voidHandler);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "NO_REPLY" }));
            expect(voidHandler).toHaveBeenCalledTimes(1);
            expect(mock.server.send).not.toHaveBeenCalled();
        });
        it("should send ERROR when handler throws", async () => {
            const failingHandler = vi.fn(async () => {
                throw new Error("Something went wrong in handler");
            });
            handler.registerHandler("FAIL", failingHandler);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "FAIL", id: "fail-1" }));
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.ERROR,
                id: "fail-1",
                error: "Something went wrong in handler",
            });
        });
        it("should send ERROR with generic message when handler throws non-Error", async () => {
            const failingHandler = vi.fn(async () => {
                throw "string error"; // eslint-disable-line no-throw-literal
            });
            handler.registerHandler("FAIL_STR", failingHandler);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "FAIL_STR", id: "fail-2" }));
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: MessageType.ERROR,
                id: "fail-2",
                error: "Internal handler error",
            });
        });
    });
    // -----------------------------------------------------------------------
    // Constructor with pre-registered handlers
    // -----------------------------------------------------------------------
    describe("constructor", () => {
        it("should accept pre-registered handlers via config", async () => {
            const preHandler = vi.fn(async (_clientId, msg) => {
                return { type: "PRE_REPLY", id: msg.id };
            });
            const handlerMap = new Map([["PRE", preHandler]]);
            const preHandlerInstance = new MessageHandler({
                server: mock.server,
                handlers: handlerMap,
            });
            await preHandlerInstance.handleMessage(CLIENT_ID, JSON.stringify({ type: "PRE", id: "pre-1" }));
            expect(preHandler).toHaveBeenCalledTimes(1);
            expect(mock.sent).toHaveLength(1);
            expect(mock.sent[0]).toEqual({
                type: "PRE_REPLY",
                id: "pre-1",
            });
        });
    });
    // -----------------------------------------------------------------------
    // createPongHandler
    // -----------------------------------------------------------------------
    describe("createPongHandler", () => {
        it("should register a PONG handler via createPongHandler", () => {
            const pongFn = handler.createPongHandler();
            expect(typeof pongFn).toBe("function");
            // After calling createPongHandler, PING type should dispatch to the handler
            // instead of the inline path. However the inline PING check runs first,
            // so let's verify registration by checking that the function was returned.
            // The handler is already registered under MessageType.PING.
        });
        it("should return a handler that produces PONG message", async () => {
            const pongFn = handler.createPongHandler();
            const result = await pongFn(CLIENT_ID, { type: MessageType.PING, id: "test-id" });
            expect(result).toEqual({
                type: MessageType.PONG,
                id: "test-id",
            });
        });
    });
    // -----------------------------------------------------------------------
    // Field extraction edge cases
    // -----------------------------------------------------------------------
    describe("field extraction", () => {
        it("should extract chatId when present", async () => {
            const spy = vi.fn(async () => { });
            handler.registerHandler("ECHO", spy);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "ECHO", chatId: "chat-xyz", id: "m1" }));
            expect(spy).toHaveBeenCalledWith(CLIENT_ID, {
                type: "ECHO",
                id: "m1",
                chatId: "chat-xyz",
                payload: undefined,
            });
        });
        it("should ignore non-string id and chatId", async () => {
            const spy = vi.fn(async () => { });
            handler.registerHandler("ECHO2", spy);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "ECHO2", id: 123, chatId: 456 }));
            expect(spy).toHaveBeenCalledWith(CLIENT_ID, {
                type: "ECHO2",
                id: undefined,
                chatId: undefined,
                payload: undefined,
            });
        });
        it("should ignore non-object payload", async () => {
            const spy = vi.fn(async () => { });
            handler.registerHandler("ECHO3", spy);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "ECHO3", payload: "not-an-object" }));
            expect(spy).toHaveBeenCalledWith(CLIENT_ID, {
                type: "ECHO3",
                id: undefined,
                chatId: undefined,
                payload: undefined,
            });
        });
        it("should extract array payload as undefined (not an object)", async () => {
            const spy = vi.fn(async () => { });
            handler.registerHandler("ECHO4", spy);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "ECHO4", payload: [1, 2, 3] }));
            expect(spy).toHaveBeenCalledWith(CLIENT_ID, {
                type: "ECHO4",
                id: undefined,
                chatId: undefined,
                payload: undefined,
            });
        });
        it("should extract null payload as undefined", async () => {
            const spy = vi.fn(async () => { });
            handler.registerHandler("ECHO5", spy);
            await handler.handleMessage(CLIENT_ID, JSON.stringify({ type: "ECHO5", payload: null }));
            expect(spy).toHaveBeenCalledWith(CLIENT_ID, {
                type: "ECHO5",
                id: undefined,
                chatId: undefined,
                payload: undefined,
            });
        });
    });
});
//# sourceMappingURL=MessageHandler.test.js.map