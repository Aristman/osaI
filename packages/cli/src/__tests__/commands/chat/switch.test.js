/**
 * Chat Switch command tests (T-004)
 *
 * TT-004-03: osai chat switch <id> -- success message, exit 0
 * TT-004-06: Gateway unavailable -- error on STDERR, exit 1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer } from "ws";
import http from "node:http";
import { runChatSwitch } from "../../../commands/chat/switch.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function startTestServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        const wsServer = new WebSocketServer({ server });
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            resolve({
                server,
                wsServer,
                url: `ws://127.0.0.1:${addr.port}`,
            });
        });
    });
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("runChatSwitch", () => {
    let stdoutSpy;
    let stderrSpy;
    let exitSpy;
    beforeEach(() => {
        stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("process.exit called");
        });
    });
    afterEach(() => {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        exitSpy.mockRestore();
    });
    it("TT-004-03: should switch active chat and print success message", async () => {
        const { server, wsServer, url } = await startTestServer();
        wsServer.on("connection", (ws) => {
            ws.on("message", () => {
                ws.send(JSON.stringify({
                    type: "command_response",
                    active_chat_id: "chat-abc123",
                    name: "My Chat",
                }));
                ws.close();
            });
        });
        try {
            await runChatSwitch("chat-abc123", { gatewayUrl: url });
            const stdoutCalls = stdoutSpy.mock.calls.map((call) => call[0]).join("");
            expect(stdoutCalls).toContain("Switched to chat");
            expect(stdoutCalls).toContain("chat-abc123");
            expect(stdoutCalls).toContain("My Chat");
            expect(exitSpy).not.toHaveBeenCalled();
        }
        finally {
            wsServer.close();
            server.close();
        }
    }, 10000);
    it("TT-004-03: should reject empty chat ID", async () => {
        try {
            await runChatSwitch("", { gatewayUrl: "ws://127.0.0.1:1" });
        }
        catch {
            // Expected: process.exit throws
        }
        const stderrCalls = stderrSpy.mock.calls.map((call) => call[0]).join("");
        expect(stderrCalls).toContain("Chat ID is required");
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
    it("TT-004-06: should print error when Gateway is unavailable", async () => {
        try {
            await runChatSwitch("chat-nonexistent", { gatewayUrl: "ws://127.0.0.1:1" });
        }
        catch {
            // Expected: process.exit throws
        }
        const stderrCalls = stderrSpy.mock.calls.map((call) => call[0]).join("");
        expect(stderrCalls).toContain("Cannot connect to Gateway");
        expect(exitSpy).toHaveBeenCalledWith(1);
    }, 10000);
});
//# sourceMappingURL=switch.test.js.map