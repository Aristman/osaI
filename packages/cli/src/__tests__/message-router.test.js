/**
 * MessageRouter tests (T-002)
 *
 * TT-002-04: Приём tool_stream -- router вызывает handler (tool + action + chunk)
 * TT-002-05: Приём block -- router вызывает handler (block_type + content)
 * TT-002-06: Приём permission_request -- router вызывает handler (request_id + risk_level)
 * TT-002-07: Невалидный JSON от Gateway -- логирование, без краша
 */
import { describe, it, expect, vi } from "vitest";
import { MessageRouter } from "../ws/message-router.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTestLogger() {
    return {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
        fatal: vi.fn(),
        silent: vi.fn(),
        trace: vi.fn(),
        level: "silent",
    };
}
/**
 * Создаёт mock GatewayClient с возможностью имитации входящих сообщений.
 */
function createMockClient() {
    const listeners = new Map();
    const mockClient = {
        on: (event, fn) => {
            if (!listeners.has(event)) {
                listeners.set(event, []);
            }
            listeners.get(event).push(fn);
            return mockClient;
        },
        removeListener: (event, fn) => {
            const arr = listeners.get(event);
            if (arr !== undefined) {
                const idx = arr.indexOf(fn);
                if (idx >= 0)
                    arr.splice(idx, 1);
            }
            return mockClient;
        },
        /** Имитирует входящее сообщение от Gateway */
        simulateMessage: (data) => {
            const handlers = listeners.get("message");
            if (handlers !== undefined) {
                for (const handler of handlers) {
                    handler(data);
                }
            }
        },
    };
    return mockClient;
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("MessageRouter", () => {
    const logger = createTestLogger();
    it("TT-002-04: should route tool_stream messages and provide tool, action, chunk", () => {
        const router = new MessageRouter({ logger });
        const client = createMockClient();
        router.attach(client);
        const received = [];
        router.on("tool_stream", (msg) => {
            received.push(msg);
        });
        const toolStreamMsg = {
            type: "tool_stream",
            session_id: "sess-1",
            chat_id: "chat-1",
            tool: "filesystem",
            action: "read_file",
            chunk: { path: "/tmp/test.txt", data: "hello" },
            progress: 0.5,
        };
        client.simulateMessage(JSON.stringify(toolStreamMsg));
        expect(received).toHaveLength(1);
        expect(received[0].tool).toBe("filesystem");
        expect(received[0].action).toBe("read_file");
        expect(received[0].chunk).toEqual({ path: "/tmp/test.txt", data: "hello" });
        expect(received[0].progress).toBe(0.5);
        router.detach();
    });
    it("TT-002-05: should route block messages and provide block_type, content", () => {
        const router = new MessageRouter({ logger });
        const client = createMockClient();
        router.attach(client);
        const received = [];
        router.on("block", (msg) => {
            received.push(msg);
        });
        const blockMsg = {
            type: "block",
            session_id: "sess-1",
            chat_id: "chat-1",
            block_type: "code",
            content: "const x = 42;",
            language: "typescript",
        };
        client.simulateMessage(JSON.stringify(blockMsg));
        expect(received).toHaveLength(1);
        expect(received[0].block_type).toBe("code");
        expect(received[0].content).toBe("const x = 42;");
        expect(received[0].language).toBe("typescript");
        router.detach();
    });
    it("TT-002-06: should route permission_request messages and provide request_id, risk_level", () => {
        const router = new MessageRouter({ logger });
        const client = createMockClient();
        router.attach(client);
        const received = [];
        router.on("permission_request", (msg) => {
            received.push(msg);
        });
        const permMsg = {
            type: "permission_request",
            request_id: "req-123",
            session_id: "sess-1",
            chat_id: "chat-1",
            tool: "shell",
            action: "exec",
            params: { command: "rm -rf /tmp/test" },
            risk_level: "medium",
        };
        client.simulateMessage(JSON.stringify(permMsg));
        expect(received).toHaveLength(1);
        expect(received[0].request_id).toBe("req-123");
        expect(received[0].risk_level).toBe("medium");
        expect(received[0].tool).toBe("shell");
        expect(received[0].action).toBe("exec");
        router.detach();
    });
    it("TT-002-07: should log invalid JSON without crashing", () => {
        const router = new MessageRouter({ logger });
        const client = createMockClient();
        router.attach(client);
        const errors = [];
        router.on("error", (raw, error) => {
            errors.push({ raw, error });
        });
        // Невалидный JSON
        client.simulateMessage("{invalid json!!!}");
        expect(errors).toHaveLength(1);
        expect(errors[0].raw).toContain("invalid json");
        expect(errors[0].error.message).toContain("JSON");
        // Логирование error было вызвано
        expect(logger.error).toHaveBeenCalled();
        // Роутер не крашнулся и продолжает работать
        const received = [];
        router.on("block", (msg) => received.push(msg));
        client.simulateMessage(JSON.stringify({
            type: "block",
            session_id: "s1",
            block_type: "text",
            content: "after invalid json",
        }));
        expect(received).toHaveLength(1);
        router.detach();
    });
    it("should emit error for messages with unknown type", () => {
        const router = new MessageRouter({ logger });
        const client = createMockClient();
        router.attach(client);
        const errors = [];
        router.on("error", (raw, error) => {
            errors.push({ raw, error });
        });
        const unknownMsg = JSON.stringify({ type: "unknown_type", data: 123 });
        client.simulateMessage(unknownMsg);
        expect(errors).toHaveLength(1);
        expect(errors[0].error.message).toContain("unknown_type");
        router.detach();
    });
    it("should emit error for messages without type field", () => {
        const router = new MessageRouter({ logger });
        const client = createMockClient();
        router.attach(client);
        const errors = [];
        router.on("error", (raw, error) => {
            errors.push({ raw, error });
        });
        const noTypeMsg = JSON.stringify({ data: 123 });
        client.simulateMessage(noTypeMsg);
        expect(errors).toHaveLength(1);
        expect(errors[0].error.message).toContain("'type'");
        router.detach();
    });
    it("should warn when attaching to a client while already attached", () => {
        const router = new MessageRouter({ logger });
        const client = createMockClient();
        router.attach(client);
        router.attach(client);
        expect(logger.warn).toHaveBeenCalledWith("MessageRouter is already attached to a client");
        router.detach();
    });
    it("should not fail when detaching without prior attach", () => {
        const router = new MessageRouter({ logger });
        // Не должно кидать исключение
        expect(() => router.detach()).not.toThrow();
    });
    it("should stop receiving messages after detach", () => {
        const router = new MessageRouter({ logger });
        const client = createMockClient();
        router.attach(client);
        const received = [];
        router.on("block", (msg) => received.push(msg));
        const blockMsg = {
            type: "block",
            session_id: "s1",
            block_type: "text",
            content: "before detach",
        };
        client.simulateMessage(JSON.stringify(blockMsg));
        expect(received).toHaveLength(1);
        router.detach();
        // После detach сообщения не обрабатываются
        client.simulateMessage(JSON.stringify({
            ...blockMsg,
            content: "after detach",
        }));
        expect(received).toHaveLength(1); // Остался только первый
    });
});
//# sourceMappingURL=message-router.test.js.map