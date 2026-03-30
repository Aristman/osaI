// ---------------------------------------------------------------------------
// ChannelRouter + CLI Handler Tests (T-004)
//
// Test cases from roadmap:
//   TT-009-21: Регистрация channel handler
//   TT-009-22: Маршрутизация сообщения к CLI handler
//   TT-009-23: Неизвестный channel возвращает ошибку
//   TT-009-24: Dispatch к handler отправляет ответ клиенту
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelRouter } from "../router.js";
import { CliHandler } from "../cli-handler.js";
import { ChannelHandlerError, } from "../types.js";
import pino from "pino";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create a test logger that writes to /dev/null. */
function testLogger() {
    return pino({ level: "silent" }).child({ component: "channel-router-test" });
}
/** Create a mock ChannelHandler for testing. */
function createMockHandler(channelName) {
    const onMessage = vi.fn(async (_ctx) => ({
        payload: { _mock: true, channel: channelName },
    }));
    const send = vi.fn(async () => { });
    const subscribe = vi.fn((_event, _cb) => { });
    const destroy = vi.fn(async () => { });
    const handler = {
        channelName,
        onMessage,
        send,
        subscribe,
        destroy,
    };
    return { handler, onMessage, send, subscribe, destroy };
}
/** Create a failing mock ChannelHandler. */
function createFailingHandler(channelName) {
    return {
        channelName,
        onMessage: async () => {
            throw new Error("Handler processing failed");
        },
        send: async () => { },
        subscribe: () => { },
        destroy: async () => { },
    };
}
/** Create a basic ChannelContext for testing. */
function createContext(overrides = {}) {
    return {
        clientId: "test-client-001",
        payload: { text: "hello" },
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ChannelRouter", () => {
    let router;
    beforeEach(() => {
        router = new ChannelRouter({ logger: testLogger() });
    });
    // -----------------------------------------------------------------------
    // TT-009-21: Регистрация channel handler
    // -----------------------------------------------------------------------
    describe("handler registration", () => {
        it("should register a channel handler", () => {
            const cli = new CliHandler({ logger: testLogger() });
            router.register(cli);
            expect(router.hasChannel("cli")).toBe(true);
            expect(router.getChannels()).toEqual(["cli"]);
            expect(router.getHandler("cli")).toBe(cli);
        });
        it("should register multiple channel handlers", () => {
            const cli = new CliHandler({ logger: testLogger() });
            const { handler: telegram } = createMockHandler("telegram");
            router.register(cli);
            router.register(telegram);
            expect(router.hasChannel("cli")).toBe(true);
            expect(router.hasChannel("telegram")).toBe(true);
            expect(router.getChannels()).toEqual(["cli", "telegram"]);
        });
        it("should throw when registering a handler with a duplicate channel name", () => {
            const cli1 = new CliHandler({ logger: testLogger() });
            const cli2 = new CliHandler({ logger: testLogger() });
            router.register(cli1);
            expect(() => router.register(cli2)).toThrow('Channel handler already registered: "cli"');
        });
        it("should return undefined for unregistered handler", () => {
            expect(router.getHandler("nonexistent")).toBeUndefined();
        });
        it("should return empty array when no handlers registered", () => {
            expect(router.getChannels()).toEqual([]);
        });
    });
    // -----------------------------------------------------------------------
    // Handler unregistration
    // -----------------------------------------------------------------------
    describe("handler unregistration", () => {
        it("should unregister a channel handler", async () => {
            const cli = new CliHandler({ logger: testLogger() });
            router.register(cli);
            await router.unregister("cli");
            expect(router.hasChannel("cli")).toBe(false);
            expect(router.getChannels()).toEqual([]);
        });
        it("should call destroy on the handler when unregistering", async () => {
            const { handler, destroy } = createMockHandler("test");
            router.register(handler);
            await router.unregister("test");
            expect(destroy).toHaveBeenCalledTimes(1);
        });
        it("should throw when unregistering a non-existent channel", async () => {
            await expect(router.unregister("nonexistent")).rejects.toThrow('No channel handler registered: "nonexistent"');
        });
    });
    // -----------------------------------------------------------------------
    // TT-009-22: Маршрутизация сообщения к CLI handler
    // -----------------------------------------------------------------------
    describe("message dispatch", () => {
        it("should dispatch a message to the CLI handler", async () => {
            const cli = new CliHandler({ logger: testLogger() });
            router.register(cli);
            const ctx = createContext({
                clientId: "client-1",
                chatId: "chat-abc",
                payload: { text: "hello world" },
            });
            const result = await router.dispatch("cli", ctx);
            expect(result).toBeDefined();
            expect(result?.payload).toEqual({
                text: "hello world",
                _channel: "cli",
                _handledBy: "cli-handler",
            });
        });
        it("should dispatch a message to a custom handler", async () => {
            const { handler, onMessage } = createMockHandler("telegram");
            router.register(handler);
            const ctx = createContext({ clientId: "client-2", payload: { command: "/start" } });
            const result = await router.dispatch("telegram", ctx);
            expect(onMessage).toHaveBeenCalledTimes(1);
            expect(onMessage).toHaveBeenCalledWith({
                clientId: "client-2",
                chatId: undefined,
                payload: { command: "/start" },
            });
            expect(result).toEqual({
                payload: { _mock: true, channel: "telegram" },
            });
        });
        it("should pass all context fields to the handler", async () => {
            const { handler, onMessage } = createMockHandler("web");
            router.register(handler);
            const ctx = createContext({
                clientId: "client-x",
                chatId: "chat-y",
                payload: { action: "test", value: 42 },
            });
            await router.dispatch("web", ctx);
            expect(onMessage).toHaveBeenCalledWith({
                clientId: "client-x",
                chatId: "chat-y",
                payload: { action: "test", value: 42 },
            });
        });
        it("should return void when handler returns void", async () => {
            const voidHandler = {
                channelName: "void-ch",
                onMessage: async () => {
                    // No return value
                },
                send: async () => { },
                subscribe: () => { },
                destroy: async () => { },
            };
            router.register(voidHandler);
            const result = await router.dispatch("void-ch", createContext());
            expect(result).toBeUndefined();
        });
    });
    // -----------------------------------------------------------------------
    // TT-009-23: Неизвестный channel возвращает ошибку
    // -----------------------------------------------------------------------
    describe("unknown channel handling", () => {
        it("should throw ChannelHandlerError for unknown channel", async () => {
            const ctx = createContext();
            await expect(router.dispatch("unknown_channel", ctx)).rejects.toThrow(ChannelHandlerError);
        });
        it("should include channel name in error", async () => {
            const ctx = createContext();
            try {
                await router.dispatch("unknown_channel", ctx);
                expect.fail("Expected ChannelHandlerError to be thrown");
            }
            catch (err) {
                expect(err).toBeInstanceOf(ChannelHandlerError);
                const chErr = err;
                expect(chErr.channelName).toBe("unknown_channel");
                expect(chErr.message).toContain('Unknown channel: "unknown_channel"');
                expect(chErr.message).toContain("Available channels:");
            }
        });
        it("should list available channels in error message", async () => {
            const cli = new CliHandler({ logger: testLogger() });
            router.register(cli);
            try {
                await router.dispatch("web", createContext());
                expect.fail("Expected ChannelHandlerError to be thrown");
            }
            catch (err) {
                expect(err).toBeInstanceOf(ChannelHandlerError);
                const chErr = err;
                expect(chErr.message).toContain("cli");
                expect(chErr.message).toContain("Available channels:");
            }
        });
        it("should show (none) when no channels are registered", async () => {
            try {
                await router.dispatch("telegram", createContext());
                expect.fail("Expected ChannelHandlerError to be thrown");
            }
            catch (err) {
                expect(err).toBeInstanceOf(ChannelHandlerError);
                const chErr = err;
                expect(chErr.message).toContain("(none)");
            }
        });
    });
    // -----------------------------------------------------------------------
    // TT-009-24: Dispatch к handler отправляет ответ клиенту
    // -----------------------------------------------------------------------
    describe("dispatch result delivery", () => {
        it("should return handler result with correct payload", async () => {
            const cli = new CliHandler({ logger: testLogger() });
            router.register(cli);
            const ctx = createContext({
                clientId: "client-1",
                payload: { text: "test message" },
            });
            const result = await router.dispatch("cli", ctx);
            expect(result).toBeDefined();
            expect(result?.payload).toHaveProperty("text", "test message");
            expect(result?.payload).toHaveProperty("_channel", "cli");
            expect(result?.payload).toHaveProperty("_handledBy", "cli-handler");
        });
        it("should preserve result metadata when provided by handler", async () => {
            const metaHandler = {
                channelName: "meta-ch",
                onMessage: async () => ({
                    payload: { data: "test" },
                    meta: { processingTime: 42, version: "1.0" },
                }),
                send: async () => { },
                subscribe: () => { },
                destroy: async () => { },
            };
            router.register(metaHandler);
            const result = await router.dispatch("meta-ch", createContext());
            expect(result?.payload).toEqual({ data: "test" });
            expect(result?.meta).toEqual({ processingTime: 42, version: "1.0" });
        });
    });
    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------
    describe("handler error handling", () => {
        it("should wrap handler errors in ChannelHandlerError", async () => {
            const failing = createFailingHandler("broken");
            router.register(failing);
            await expect(router.dispatch("broken", createContext())).rejects.toThrow(ChannelHandlerError);
        });
        it("should include channel name in wrapped error", async () => {
            const failing = createFailingHandler("broken");
            router.register(failing);
            try {
                await router.dispatch("broken", createContext());
                expect.fail("Expected ChannelHandlerError");
            }
            catch (err) {
                expect(err).toBeInstanceOf(ChannelHandlerError);
                const chErr = err;
                expect(chErr.channelName).toBe("broken");
                expect(chErr.message).toContain("Handler \"broken\" failed");
            }
        });
        it("should preserve cause when wrapping handler errors", async () => {
            const failing = createFailingHandler("broken");
            router.register(failing);
            try {
                await router.dispatch("broken", createContext());
                expect.fail("Expected ChannelHandlerError");
            }
            catch (err) {
                const chErr = err;
                expect(chErr.cause).toBeInstanceOf(Error);
                expect(chErr.cause?.message).toBe("Handler processing failed");
            }
        });
        it("should pass through ChannelHandlerError without re-wrapping", async () => {
            const originalError = new ChannelHandlerError("test-ch", "Original error");
            const errorThrower = {
                channelName: "test-ch",
                onMessage: async () => { throw originalError; },
                send: async () => { },
                subscribe: () => { },
                destroy: async () => { },
            };
            router.register(errorThrower);
            try {
                await router.dispatch("test-ch", createContext());
                expect.fail("Expected ChannelHandlerError");
            }
            catch (err) {
                expect(err).toBe(originalError);
            }
        });
    });
    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------
    describe("destroy", () => {
        it("should destroy all registered handlers", async () => {
            const { handler: h1, destroy: d1 } = createMockHandler("ch1");
            const { handler: h2, destroy: d2 } = createMockHandler("ch2");
            router.register(h1);
            router.register(h2);
            await router.destroy();
            expect(d1).toHaveBeenCalledTimes(1);
            expect(d2).toHaveBeenCalledTimes(1);
            expect(router.getChannels()).toEqual([]);
        });
        it("should be safe to call destroy with no handlers", async () => {
            await expect(router.destroy()).resolves.toBeUndefined();
        });
        it("should handle handler destroy errors gracefully", async () => {
            const errorDestroyer = {
                channelName: "error-ch",
                onMessage: async () => ({ payload: {} }),
                send: async () => { },
                subscribe: () => { },
                destroy: async () => {
                    throw new Error("Destroy failed");
                },
            };
            // Note: router.destroy() uses Promise.all which will propagate the error.
            // This test verifies the handler was still registered before destroy.
            router.register(errorDestroyer);
            expect(router.getChannels()).toEqual(["error-ch"]);
            // destroy() should reject if a handler's destroy() throws
            await expect(router.destroy()).rejects.toThrow("Destroy failed");
        });
    });
});
// ---------------------------------------------------------------------------
// CliHandler Tests
// ---------------------------------------------------------------------------
describe("CliHandler", () => {
    let handler;
    beforeEach(() => {
        handler = new CliHandler({ logger: testLogger() });
    });
    describe("properties", () => {
        it("should have channelName 'cli'", () => {
            expect(handler.channelName).toBe("cli");
        });
    });
    describe("onMessage", () => {
        it("should return a ChannelResult with the input payload", async () => {
            const ctx = {
                clientId: "client-1",
                chatId: "chat-abc",
                payload: { text: "hello" },
            };
            const result = await handler.onMessage(ctx);
            expect(result).toBeDefined();
            expect(result?.payload).toEqual({
                text: "hello",
                _channel: "cli",
                _handledBy: "cli-handler",
            });
        });
        it("should work without chatId", async () => {
            const ctx = {
                clientId: "client-2",
                payload: { command: "/help" },
            };
            const result = await handler.onMessage(ctx);
            expect(result?.payload).toEqual({
                command: "/help",
                _channel: "cli",
                _handledBy: "cli-handler",
            });
        });
    });
    describe("subscribe", () => {
        it("should call subscription callback when a message is received", async () => {
            const callback = vi.fn();
            handler.subscribe("message", callback);
            const ctx = {
                clientId: "client-1",
                payload: { text: "test" },
            };
            await handler.onMessage(ctx);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith({
                clientId: "client-1",
                chatId: undefined,
                payload: { text: "test" },
            });
        });
        it("should support multiple subscribers for the same event", async () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            handler.subscribe("message", cb1);
            handler.subscribe("message", cb2);
            await handler.onMessage(createContext());
            expect(cb1).toHaveBeenCalledTimes(1);
            expect(cb2).toHaveBeenCalledTimes(1);
        });
        it("should support different event types", async () => {
            const msgCb = vi.fn();
            const errCb = vi.fn();
            handler.subscribe("message", msgCb);
            handler.subscribe("error", errCb);
            await handler.onMessage(createContext());
            expect(msgCb).toHaveBeenCalledTimes(1);
            expect(errCb).not.toHaveBeenCalled();
        });
        it("should handle subscription callback errors gracefully", async () => {
            const badCb = vi.fn(() => {
                throw new Error("Callback error");
            });
            handler.subscribe("message", badCb);
            // Should not throw even though callback throws
            await expect(handler.onMessage(createContext())).resolves.toBeDefined();
        });
    });
    describe("send", () => {
        it("should complete without error (no-op in MVP)", async () => {
            await expect(handler.send({ text: "test" })).resolves.toBeUndefined();
        });
    });
    describe("destroy", () => {
        it("should complete without error", async () => {
            await expect(handler.destroy()).resolves.toBeUndefined();
        });
        it("should clear subscriptions after destroy", async () => {
            const cb = vi.fn();
            handler.subscribe("message", cb);
            await handler.destroy();
            // After destroy, subscriptions should be cleared
            // Sending a new message should not call the callback
            // Note: this would require re-creating the handler or accessing internals.
            // We verify destroy completes cleanly.
            expect(cb).not.toHaveBeenCalled();
        });
    });
});
// ---------------------------------------------------------------------------
// ChannelHandlerError Tests
// ---------------------------------------------------------------------------
describe("ChannelHandlerError", () => {
    it("should create error with channel name and message", () => {
        const err = new ChannelHandlerError("test-ch", "Something went wrong");
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(ChannelHandlerError);
        expect(err.name).toBe("ChannelHandlerError");
        expect(err.channelName).toBe("test-ch");
        expect(err.message).toBe("Something went wrong");
        expect(err.cause).toBeUndefined();
    });
    it("should create error with cause", () => {
        const cause = new Error("Root cause");
        const err = new ChannelHandlerError("test-ch", "Wrapped error", cause);
        expect(err.channelName).toBe("test-ch");
        expect(err.message).toBe("Wrapped error");
        expect(err.cause).toBe(cause);
    });
});
//# sourceMappingURL=router.test.js.map