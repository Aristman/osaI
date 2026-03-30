/**
 * Gateway Connector tests (T-004)
 *
 * Tests for executeGatewayCommand -- connection handling,
 * response collection, timeout behavior, and error reporting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Start a test WebSocket server on a random port.
 */
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
describe("executeGatewayCommand", () => {
    it("should return success with response data when Gateway responds", async () => {
        const { server, wsServer, url } = await startTestServer();
        // Gateway mock: respond to command with a command_response
        wsServer.on("connection", (ws) => {
            ws.on("message", (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.type === "command") {
                    ws.send(JSON.stringify({
                        type: "command_response",
                        payload: { command: msg.payload, result: "ok" },
                    }));
                    ws.close();
                }
            });
        });
        try {
            const { executeGatewayCommand } = await import("../../ws/gateway-connector.js");
            const result = await executeGatewayCommand("chat_list", undefined, {
                url,
                connectTimeoutMs: 2000,
                responseTimeoutMs: 2000,
            });
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data.type).toBe("command_response");
        }
        finally {
            wsServer.close();
            server.close();
        }
    }, 10000);
    it("should return failure with error message when Gateway is unavailable", async () => {
        const { executeGatewayCommand } = await import("../../ws/gateway-connector.js");
        const result = await executeGatewayCommand("chat_list", undefined, {
            url: "ws://127.0.0.1:1", // Port where nothing is listening
            connectTimeoutMs: 500,
            responseTimeoutMs: 1000,
        });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain("Cannot connect to Gateway");
    }, 10000);
    it("should send command with correct payload", async () => {
        const { server, wsServer, url } = await startTestServer();
        let receivedCommand = null;
        let receivedArgs;
        wsServer.on("connection", (ws) => {
            ws.on("message", (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.type === "command") {
                    receivedCommand = msg.payload.command;
                    receivedArgs = msg.payload.args;
                    ws.send(JSON.stringify({ type: "command_response", payload: {} }));
                    ws.close();
                }
            });
        });
        try {
            const { executeGatewayCommand } = await import("../../ws/gateway-connector.js");
            await executeGatewayCommand("chat_create", { name: "Test" }, {
                url,
                connectTimeoutMs: 2000,
                responseTimeoutMs: 2000,
            });
            expect(receivedCommand).toBe("chat_create");
            expect(receivedArgs).toEqual({ name: "Test" });
        }
        finally {
            wsServer.close();
            server.close();
        }
    }, 10000);
    it("should return failure with timeout message when Gateway does not respond", async () => {
        const { server, wsServer, url } = await startTestServer();
        // Gateway mock: connect but never respond
        wsServer.on("connection", () => {
            // Intentionally do not send any response
        });
        try {
            const { executeGatewayCommand } = await import("../../ws/gateway-connector.js");
            const result = await executeGatewayCommand("chat_list", undefined, {
                url,
                connectTimeoutMs: 2000,
                responseTimeoutMs: 500, // Short timeout for test
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain("did not respond in time");
        }
        finally {
            wsServer.close();
            server.close();
        }
    }, 10000);
});
//# sourceMappingURL=gateway-connector.test.js.map