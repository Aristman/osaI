/**
 * Protocol tests (T-002)
 *
 * TT-002-01: Отправка message типа в Gateway -- корректный JSON на WS, с session_id
 * TT-002-02: Отправка command типа в Gateway -- корректный JSON, payload передан
 * TT-002-03: Отправка permission_response (allow/deny) -- корректный JSON с request_id
 */
import { describe, it, expect, vi } from "vitest";
import { sendUserMessage, sendCommand, sendPermissionResponse, sendSubscribe, } from "../ws/protocol.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Создаёт mock GatewayClient, который перехватывает send() и сохраняет
 * сериализованный JSON (повторяя поведение реального GatewayClient).
 */
function createMockClient() {
    const sent = [];
    const client = {
        send: (data) => {
            // Повторяем поведение настоящего GatewayClient.send():
            // объекты сериализуются в JSON строку
            const payload = typeof data === "string" ? data : JSON.stringify(data);
            sent.push(JSON.parse(payload));
        },
    };
    return { client, sent };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Protocol: sendUserMessage", () => {
    it("TT-002-01: should send message type with session_id and content", () => {
        const { client, sent } = createMockClient();
        sendUserMessage(client, "session-123", "Hello Gateway");
        expect(sent).toHaveLength(1);
        const msg = sent[0];
        expect(msg.type).toBe("message");
        expect(msg.session_id).toBe("session-123");
        expect(msg.payload.content).toBe("Hello Gateway");
        expect(msg.chat_id).toBeUndefined();
    });
    it("TT-002-01: should include chat_id when provided", () => {
        const { client, sent } = createMockClient();
        sendUserMessage(client, "session-123", "Hello", "chat-456");
        expect(sent).toHaveLength(1);
        const msg = sent[0];
        expect(msg.type).toBe("message");
        expect(msg.session_id).toBe("session-123");
        expect(msg.chat_id).toBe("chat-456");
        expect(msg.payload.content).toBe("Hello");
    });
});
describe("Protocol: sendCommand", () => {
    it("TT-002-02: should send command type with payload", () => {
        const { client, sent } = createMockClient();
        sendCommand(client, "session-123", "chat_list");
        expect(sent).toHaveLength(1);
        const msg = sent[0];
        expect(msg.type).toBe("command");
        expect(msg.session_id).toBe("session-123");
        expect(msg.payload.command).toBe("chat_list");
        expect(msg.payload.args).toBeUndefined();
    });
    it("TT-002-02: should include args when provided", () => {
        const { client, sent } = createMockClient();
        sendCommand(client, "session-123", "chat_create", { name: "Test" });
        expect(sent).toHaveLength(1);
        const msg = sent[0];
        expect(msg.type).toBe("command");
        expect(msg.payload.command).toBe("chat_create");
        expect(msg.payload.args).toEqual({ name: "Test" });
    });
    it("TT-002-02: should include chat_id when provided", () => {
        const { client, sent } = createMockClient();
        sendCommand(client, "session-123", "chat_list", undefined, "chat-456");
        expect(sent).toHaveLength(1);
        const msg = sent[0];
        expect(msg.chat_id).toBe("chat-456");
    });
});
describe("Protocol: sendPermissionResponse", () => {
    it("TT-002-03: should send permission_response with allow=true", () => {
        const { client, sent } = createMockClient();
        sendPermissionResponse(client, "session-123", "req-789", true);
        expect(sent).toHaveLength(1);
        const msg = sent[0];
        expect(msg.type).toBe("permission_response");
        expect(msg.session_id).toBe("session-123");
        expect(msg.request_id).toBe("req-789");
        expect(msg.payload.allow).toBe(true);
    });
    it("TT-002-03: should send permission_response with allow=false (deny)", () => {
        const { client, sent } = createMockClient();
        sendPermissionResponse(client, "session-123", "req-789", false);
        expect(sent).toHaveLength(1);
        const msg = sent[0];
        expect(msg.type).toBe("permission_response");
        expect(msg.session_id).toBe("session-123");
        expect(msg.request_id).toBe("req-789");
        expect(msg.payload.allow).toBe(false);
    });
});
describe("Protocol: sendSubscribe", () => {
    it("should send subscribe type with events", () => {
        const { client, sent } = createMockClient();
        sendSubscribe(client, "session-123", ["tool_stream", "block"]);
        expect(sent).toHaveLength(1);
        const msg = sent[0];
        expect(msg.type).toBe("subscribe");
        expect(msg.session_id).toBe("session-123");
        expect(msg.payload.events).toEqual(["tool_stream", "block"]);
    });
    it("should include chat_id when provided", () => {
        const { client, sent } = createMockClient();
        sendSubscribe(client, "session-123", ["tool_stream"], "chat-456");
        expect(sent).toHaveLength(1);
        const msg = sent[0];
        expect(msg.chat_id).toBe("chat-456");
    });
});
//# sourceMappingURL=protocol.test.js.map