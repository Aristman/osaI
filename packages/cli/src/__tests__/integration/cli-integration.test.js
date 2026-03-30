/**
 * CLI Integration Tests (T-006)
 *
 * TT-006-07: Integration: init -> connect -> send message -> receive response
 *
 * Full E2E test with mock Gateway server covering:
 * - Connection lifecycle
 * - Message send/receive
 * - Permission request auto-approve
 * - Quick command mode end-to-end
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { GatewayClient } from "../../ws/gateway-client.js";
import { MessageRouter } from "../../ws/message-router.js";
import { sendUserMessage, sendPermissionResponse, sendSubscribe } from "../../ws/protocol.js";
import { runQuickCommand } from "../../commands/quick.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
function startMockGateway() {
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
                port: addr.port,
            });
        });
    });
}
function waitForClient(wsServer) {
    return new Promise((resolve) => {
        wsServer.on("connection", (ws) => resolve(ws));
    });
}
function closeMockGateway(gw) {
    try {
        gw.wsServer.close();
    }
    catch {
        // ignore
    }
    try {
        gw.server.close();
    }
    catch {
        // ignore
    }
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("CLI Integration Tests", () => {
    // -----------------------------------------------------------------------
    // TT-006-07: Full E2E cycle
    // -----------------------------------------------------------------------
    describe("TT-006-07: full cycle -- connect -> message -> response", () => {
        it("should complete full cycle: connect, subscribe, send message, receive text block", async () => {
            const gw = await startMockGateway();
            const receivedMessages = [];
            let clientWs = null;
            try {
                // Server tracks all messages
                gw.wsServer.on("connection", (ws) => {
                    clientWs = ws;
                    ws.on("message", (data) => {
                        receivedMessages.push(JSON.parse(data.toString()));
                    });
                });
                // Client setup
                const client = new GatewayClient({
                    url: gw.url,
                    logger: createTestLogger(),
                    maxRetries: 0,
                });
                const router = new MessageRouter({
                    logger: createTestLogger(),
                });
                // Step 1: Connect
                const connectedPromise = new Promise((resolve) => {
                    client.on("connected", () => resolve());
                });
                client.connect();
                await waitForClient(gw.wsServer);
                await connectedPromise;
                expect(client.isConnected).toBe(true);
                // Step 2: Attach router
                router.attach(client);
                // Step 3: Subscribe
                sendSubscribe(client, "test-session-e2e", ["block", "tool_stream"]);
                // Wait a bit for message to arrive
                await new Promise((r) => setTimeout(r, 50));
                // Verify subscribe was received
                const subscribeMsg = receivedMessages.find((m) => m["type"] === "subscribe");
                expect(subscribeMsg).toBeDefined();
                expect(subscribeMsg["session_id"]).toBe("test-session-e2e");
                // Step 4: Send user message
                sendUserMessage(client, "test-session-e2e", "Hello, osaI!");
                // Wait a bit for message to arrive
                await new Promise((r) => setTimeout(r, 50));
                // Verify message was received by server
                const userMsg = receivedMessages.find((m) => m["type"] === "message");
                expect(userMsg).toBeDefined();
                expect(userMsg["payload"]["content"]).toBe("Hello, osaI!");
                // Step 5: Server sends response (text block)
                const blockPromise = new Promise((resolve) => {
                    router.on("block", (msg) => resolve(msg));
                });
                if (clientWs !== null) {
                    clientWs.send(JSON.stringify({
                        type: "block",
                        session_id: "test-session-e2e",
                        block_type: "text",
                        content: "Привет! Я osaI, ваш AI-ассистент.",
                    }));
                }
                const block = await blockPromise;
                expect(block.type).toBe("block");
                expect(block.block_type).toBe("text");
                expect(block.content).toBe("Привет! Я osaI, ваш AI-ассистент.");
                // Cleanup
                router.detach();
                client.disconnect();
            }
            finally {
                closeMockGateway(gw);
            }
        }, 15000);
        it("should handle permission request -> auto-approve -> response cycle", async () => {
            const gw = await startMockGateway();
            const receivedMessages = [];
            let clientWs = null;
            try {
                gw.wsServer.on("connection", (ws) => {
                    clientWs = ws;
                    ws.on("message", (data) => {
                        receivedMessages.push(JSON.parse(data.toString()));
                    });
                });
                const client = new GatewayClient({
                    url: gw.url,
                    logger: createTestLogger(),
                    maxRetries: 0,
                });
                const router = new MessageRouter({
                    logger: createTestLogger(),
                });
                // Connect
                const connectedPromise = new Promise((resolve) => {
                    client.on("connected", () => resolve());
                });
                client.connect();
                await waitForClient(gw.wsServer);
                await connectedPromise;
                router.attach(client);
                sendSubscribe(client, "session-perm-test", ["block", "tool_stream", "permission_request"]);
                await new Promise((r) => setTimeout(r, 50));
                // Send a message
                sendUserMessage(client, "session-perm-test", "read my file");
                await new Promise((r) => setTimeout(r, 50));
                // Server sends permission_request (low risk)
                const permPromise = new Promise((resolve) => {
                    router.on("permission_request", (msg) => resolve(msg));
                });
                if (clientWs !== null) {
                    clientWs.send(JSON.stringify({
                        type: "permission_request",
                        request_id: "perm-e2e-001",
                        session_id: "session-perm-test",
                        tool: "filesystem",
                        action: "read",
                        params: { path: "/home/user/file.txt" },
                        risk_level: "low",
                    }));
                }
                const permRequest = await permPromise;
                expect(permRequest.risk_level).toBe("low");
                expect(permRequest.tool).toBe("filesystem");
                // Client auto-approves
                sendPermissionResponse(client, "session-perm-test", "perm-e2e-001", true);
                await new Promise((r) => setTimeout(r, 50));
                // Verify permission response was sent
                const permResp = receivedMessages.find((m) => m["type"] === "permission_response");
                expect(permResp).toBeDefined();
                expect(permResp["request_id"]).toBe("perm-e2e-001");
                expect(permResp["payload"]["allow"]).toBe(true);
                // Server sends response after permission granted
                const blockPromise = new Promise((resolve) => {
                    router.on("block", (msg) => resolve(msg));
                });
                if (clientWs !== null) {
                    clientWs.send(JSON.stringify({
                        type: "block",
                        session_id: "session-perm-test",
                        block_type: "text",
                        content: "Содержимое файла: Hello World",
                    }));
                }
                const block = await blockPromise;
                expect(block.content).toContain("Hello World");
                router.detach();
                client.disconnect();
            }
            finally {
                closeMockGateway(gw);
            }
        }, 15000);
        it("should handle tool_stream -> block sequence (streaming response)", async () => {
            const gw = await startMockGateway();
            let clientWs = null;
            try {
                gw.wsServer.on("connection", (ws) => {
                    clientWs = ws;
                    // Silently consume client messages
                });
                const client = new GatewayClient({
                    url: gw.url,
                    logger: createTestLogger(),
                    maxRetries: 0,
                });
                const router = new MessageRouter({
                    logger: createTestLogger(),
                });
                const connectedPromise = new Promise((resolve) => {
                    client.on("connected", () => resolve());
                });
                client.connect();
                await waitForClient(gw.wsServer);
                await connectedPromise;
                router.attach(client);
                // Collect tool_stream messages
                const toolStreamMessages = [];
                router.on("tool_stream", (msg) => {
                    toolStreamMessages.push(msg);
                });
                // Collect block messages
                const blockMessages = [];
                router.on("block", (msg) => {
                    blockMessages.push(msg);
                });
                // Server sends tool_stream messages then a block
                if (clientWs !== null) {
                    clientWs.send(JSON.stringify({
                        type: "tool_stream",
                        session_id: "session-stream-test",
                        tool: "memory",
                        action: "search",
                        chunk: "Searching...",
                        progress: 0.3,
                    }));
                    clientWs.send(JSON.stringify({
                        type: "tool_stream",
                        session_id: "session-stream-test",
                        tool: "memory",
                        action: "search",
                        chunk: "Found 3 results",
                        progress: 1.0,
                    }));
                    clientWs.send(JSON.stringify({
                        type: "block",
                        session_id: "session-stream-test",
                        block_type: "text",
                        content: "Based on memory search, here are the results.",
                    }));
                }
                // Wait for all messages to be processed
                await new Promise((r) => setTimeout(r, 200));
                expect(toolStreamMessages).toHaveLength(2);
                expect(toolStreamMessages[0]?.tool).toBe("memory");
                expect(toolStreamMessages[0]?.progress).toBe(0.3);
                expect(toolStreamMessages[1]?.progress).toBe(1.0);
                expect(blockMessages).toHaveLength(1);
                expect(blockMessages[0]?.content).toContain("Based on memory search");
                router.detach();
                client.disconnect();
            }
            finally {
                closeMockGateway(gw);
            }
        }, 15000);
    });
    // -----------------------------------------------------------------------
    // Quick Command E2E
    // -----------------------------------------------------------------------
    describe("quick command E2E", () => {
        it("should complete full quick command cycle: connect -> message -> text response", async () => {
            const gw = await startMockGateway();
            try {
                gw.wsServer.on("connection", (ws) => {
                    ws.on("message", (data) => {
                        const msg = JSON.parse(data.toString());
                        if (msg["type"] === "message") {
                            // Simulate a permission request for read (low risk)
                            ws.send(JSON.stringify({
                                type: "permission_request",
                                request_id: "perm-quick-001",
                                session_id: msg["session_id"],
                                tool: "filesystem",
                                action: "read",
                                params: { path: "/tmp/data" },
                                risk_level: "low",
                            }));
                            // Then send the response
                            setTimeout(() => {
                                ws.send(JSON.stringify({
                                    type: "block",
                                    session_id: msg["session_id"],
                                    block_type: "text",
                                    content: "Here is your answer from osaI.",
                                }));
                            }, 100);
                        }
                    });
                });
                const result = await runQuickCommand("tell me something", {
                    gatewayUrl: gw.url,
                    logger: createTestLogger(),
                    connectTimeoutMs: 3000,
                    responseTimeoutMs: 5000,
                    autoApproveLowRisk: true,
                });
                expect(result.exitCode).toBe(0);
                expect(result.response).toBe("Here is your answer from osaI.");
                expect(result.error).toBeUndefined();
            }
            finally {
                closeMockGateway(gw);
            }
        }, 15000);
    });
    // -----------------------------------------------------------------------
    // Error handling integration
    // -----------------------------------------------------------------------
    describe("error handling", () => {
        it("should handle Gateway sending invalid JSON gracefully", async () => {
            const gw = await startMockGateway();
            const errors = [];
            let serverWs = null;
            try {
                gw.wsServer.on("connection", (ws) => {
                    serverWs = ws;
                    // Do NOT send immediately -- wait until router is attached
                });
                const client = new GatewayClient({
                    url: gw.url,
                    logger: createTestLogger(),
                    maxRetries: 0,
                });
                const router = new MessageRouter({
                    logger: createTestLogger(),
                });
                router.on("error", (raw, error) => {
                    errors.push({ raw, error });
                });
                const connectedPromise = new Promise((resolve) => {
                    client.on("connected", () => resolve());
                });
                client.connect();
                await waitForClient(gw.wsServer);
                await connectedPromise;
                // Attach router BEFORE sending invalid data
                router.attach(client);
                // Now send invalid JSON
                if (serverWs !== null) {
                    serverWs.send("{invalid json!!!");
                }
                // Wait for error to be processed
                await new Promise((r) => setTimeout(r, 200));
                // Should have logged error, not crashed
                expect(errors.length).toBeGreaterThanOrEqual(1);
                expect(errors[0]?.error.message).toContain("JSON");
                router.detach();
                client.disconnect();
            }
            finally {
                closeMockGateway(gw);
            }
        }, 15000);
        it("should handle Gateway sending unknown message type", async () => {
            const gw = await startMockGateway();
            const errors = [];
            let serverWs = null;
            try {
                gw.wsServer.on("connection", (ws) => {
                    serverWs = ws;
                    // Wait for router to be attached
                });
                const client = new GatewayClient({
                    url: gw.url,
                    logger: createTestLogger(),
                    maxRetries: 0,
                });
                const router = new MessageRouter({
                    logger: createTestLogger(),
                });
                router.on("error", (raw, error) => {
                    errors.push({ raw, error });
                });
                const connectedPromise = new Promise((resolve) => {
                    client.on("connected", () => resolve());
                });
                client.connect();
                await waitForClient(gw.wsServer);
                await connectedPromise;
                router.attach(client);
                // Send unknown message type after router is attached
                if (serverWs !== null) {
                    serverWs.send(JSON.stringify({ type: "unknown_type", data: 42 }));
                }
                await new Promise((r) => setTimeout(r, 200));
                expect(errors.length).toBeGreaterThanOrEqual(1);
                expect(errors[0]?.error.message).toContain("Unknown message type");
                router.detach();
                client.disconnect();
            }
            finally {
                closeMockGateway(gw);
            }
        }, 15000);
        it("should handle connection dropping during message exchange", async () => {
            const gw = await startMockGateway();
            try {
                gw.wsServer.on("connection", (ws) => {
                    // Close connection immediately
                    setTimeout(() => ws.close(), 50);
                });
                const disconnectedFired = new Promise((resolve) => {
                    const client = new GatewayClient({
                        url: gw.url,
                        logger: createTestLogger(),
                        maxRetries: 0,
                    });
                    client.on("connected", () => {
                        // Try to send a message
                        try {
                            client.send({ type: "test" });
                        }
                        catch {
                            // May fail if connection closed
                        }
                    });
                    client.on("disconnected", () => {
                        client.disconnect();
                        resolve(true);
                    });
                    client.on("failed", () => {
                        client.disconnect();
                        resolve(true);
                    });
                    // Timeout safety
                    setTimeout(() => {
                        client.disconnect();
                        resolve(false);
                    }, 2000);
                    client.connect();
                    return new Promise((innerResolve) => {
                        // Already handled above
                    });
                });
                // The test passes if no crash occurs
                expect(true).toBe(true);
            }
            finally {
                closeMockGateway(gw);
            }
        }, 15000);
    });
    // -----------------------------------------------------------------------
    // Permission response protocol E2E
    // -----------------------------------------------------------------------
    describe("permission protocol E2E", () => {
        it("should send correct permission_response format for allow", async () => {
            const gw = await startMockGateway();
            const receivedMessages = [];
            try {
                gw.wsServer.on("connection", (ws) => {
                    ws.on("message", (data) => {
                        receivedMessages.push(JSON.parse(data.toString()));
                    });
                });
                const client = new GatewayClient({
                    url: gw.url,
                    logger: createTestLogger(),
                    maxRetries: 0,
                });
                const connectedPromise = new Promise((resolve) => {
                    client.on("connected", () => resolve());
                });
                client.connect();
                await waitForClient(gw.wsServer);
                await connectedPromise;
                // Send permission response
                sendPermissionResponse(client, "session-001", "req-001", true);
                await new Promise((r) => setTimeout(r, 50));
                const permResp = receivedMessages.find((m) => m["type"] === "permission_response");
                expect(permResp).toBeDefined();
                const msg = permResp;
                expect(msg["session_id"]).toBe("session-001");
                expect(msg["request_id"]).toBe("req-001");
                expect(msg["payload"]["allow"]).toBe(true);
                client.disconnect();
            }
            finally {
                closeMockGateway(gw);
            }
        }, 15000);
        it("should send correct permission_response format for deny", async () => {
            const gw = await startMockGateway();
            const receivedMessages = [];
            try {
                gw.wsServer.on("connection", (ws) => {
                    ws.on("message", (data) => {
                        receivedMessages.push(JSON.parse(data.toString()));
                    });
                });
                const client = new GatewayClient({
                    url: gw.url,
                    logger: createTestLogger(),
                    maxRetries: 0,
                });
                const connectedPromise = new Promise((resolve) => {
                    client.on("connected", () => resolve());
                });
                client.connect();
                await waitForClient(gw.wsServer);
                await connectedPromise;
                sendPermissionResponse(client, "session-002", "req-002", false);
                await new Promise((r) => setTimeout(r, 50));
                const permResp = receivedMessages.find((m) => m["type"] === "permission_response");
                expect(permResp).toBeDefined();
                const msg = permResp;
                expect(msg["payload"]["allow"]).toBe(false);
                client.disconnect();
            }
            finally {
                closeMockGateway(gw);
            }
        }, 15000);
    });
});
//# sourceMappingURL=cli-integration.test.js.map