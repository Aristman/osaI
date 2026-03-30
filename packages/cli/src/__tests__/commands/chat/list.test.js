/**
 * Chat List command tests (T-004)
 *
 * TT-004-01: osai chat list -- outputs table with id, name, status, last activity
 * TT-004-06: Gateway unavailable -- error on STDERR, exit 1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer } from "ws";
import http from "node:http";
import { runChatList } from "../../../commands/chat/list.js";
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
describe("runChatList", () => {
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
    it("TT-004-01: should output a table with chat id, name, status, last_activity", async () => {
        const { server, wsServer, url } = await startTestServer();
        wsServer.on("connection", (ws) => {
            ws.on("message", () => {
                ws.send(JSON.stringify({
                    type: "command_response",
                    chats: [
                        { id: "chat-1", name: "Test Chat", status: "active", last_activity: "2026-03-30 12:00" },
                        { id: "chat-2", name: "Work", status: "archived", last_activity: "2026-03-29 08:00" },
                    ],
                }));
                ws.close();
            });
        });
        try {
            await runChatList({ gatewayUrl: url });
            const stdoutCalls = stdoutSpy.mock.calls.map((call) => call[0]).join("");
            expect(stdoutCalls).toContain("chat-1");
            expect(stdoutCalls).toContain("Test Chat");
            expect(stdoutCalls).toContain("active");
            expect(stdoutCalls).toContain("2026-03-30 12:00");
            expect(stdoutCalls).toContain("chat-2");
            expect(stdoutCalls).toContain("Work");
            expect(stdoutCalls).toContain("archived");
            expect(stdoutCalls).toContain("ID");
            expect(stdoutCalls).toContain("Name");
            expect(stdoutCalls).toContain("Status");
            expect(stdoutCalls).toContain("Last Activity");
        }
        finally {
            wsServer.close();
            server.close();
        }
    }, 10000);
    it("TT-004-01: should output 'No chats found' when there are no chats", async () => {
        const { server, wsServer, url } = await startTestServer();
        wsServer.on("connection", (ws) => {
            ws.on("message", () => {
                ws.send(JSON.stringify({ type: "command_response", chats: [] }));
                ws.close();
            });
        });
        try {
            await runChatList({ gatewayUrl: url });
            const stdoutCalls = stdoutSpy.mock.calls.map((call) => call[0]).join("");
            expect(stdoutCalls).toContain("No chats found");
        }
        finally {
            wsServer.close();
            server.close();
        }
    }, 10000);
    it("TT-004-06: should print error when Gateway is unavailable", async () => {
        try {
            await runChatList({ gatewayUrl: "ws://127.0.0.1:1" });
        }
        catch {
            // Expected: process.exit throws
        }
        const stderrCalls = stderrSpy.mock.calls.map((call) => call[0]).join("");
        expect(stderrCalls).toContain("Cannot connect to Gateway");
        expect(exitSpy).toHaveBeenCalledWith(1);
    }, 10000);
});
//# sourceMappingURL=list.test.js.map