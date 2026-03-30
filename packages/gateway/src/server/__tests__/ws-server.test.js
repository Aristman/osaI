import { Writable } from "node:stream";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import WebSocket from "ws";
import { WsServer } from "../ws-server.js";
import pino from "pino";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Pick a random free port from the ephemeral range to avoid collisions. */
function randomPort() {
    return 18_000 + Math.floor(Math.random() * 2_000);
}
/** Wait for a WebSocket to enter the OPEN state. */
function wsOpen(ws) {
    return new Promise((resolve, reject) => {
        if (ws.readyState === WebSocket.OPEN)
            return resolve();
        const timer = setTimeout(() => {
            reject(new Error("wsOpen timeout"));
        }, 5_000);
        ws.once("open", () => {
            clearTimeout(timer);
            resolve();
        });
        ws.once("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
/** Wait for a WebSocket to close. */
function wsClose(ws) {
    return new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED)
            return resolve();
        ws.once("close", () => resolve());
    });
}
/** Create a test logger that writes to /dev/null for cleaner test output. */
function testLogger() {
    return pino({ level: "silent" }).child({ component: "ws-server-test" });
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("WsServer", () => {
    let port;
    let server;
    beforeEach(() => {
        port = randomPort();
        server = new WsServer({ port, logger: testLogger() });
    });
    afterEach(async () => {
        try {
            await server.stop();
        }
        catch {
            // Ignore -- server may not have been started.
        }
    });
    // -------------------------------------------------------------------------
    // TT-009-01: WS server starts on configured host:port
    // -------------------------------------------------------------------------
    describe("start / stop lifecycle", () => {
        it("should start on the configured port", async () => {
            await server.start();
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);
            await wsOpen(ws);
            ws.close();
            await wsClose(ws);
        });
        it("should reject when port is already in use", async () => {
            await server.start();
            const duplicate = new WsServer({ port, logger: testLogger() });
            await expect(duplicate.start()).rejects.toThrow();
        });
        it("should stop gracefully and close all connections", async () => {
            await server.start();
            const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
            const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
            await wsOpen(ws1);
            await wsOpen(ws2);
            expect(server.getConnections()).toBe(2);
            const stopPromise = server.stop();
            await Promise.all([wsClose(ws1), wsClose(ws2)]);
            await stopPromise;
            expect(server.getConnections()).toBe(0);
        });
        it("should be safe to call stop() when not started", async () => {
            await expect(server.stop()).resolves.toBeUndefined();
        });
    });
    // -------------------------------------------------------------------------
    // TT-009-02: Connection / disconnection events
    // -------------------------------------------------------------------------
    describe("connection events", () => {
        it("should fire onConnection callback with clientId", async () => {
            await server.start();
            const connected = vi.fn();
            server.onConnection(connected);
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);
            await wsOpen(ws);
            // Give a tick for the callback to fire.
            await new Promise((r) => setTimeout(r, 50));
            expect(connected).toHaveBeenCalledTimes(1);
            expect(typeof connected.mock.calls[0][0]).toBe("string");
            ws.close();
            await wsClose(ws);
        });
        it("should fire onDisconnection callback", async () => {
            await server.start();
            const disconnected = vi.fn();
            server.onDisconnection(disconnected);
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);
            await wsOpen(ws);
            ws.close(1000, "bye");
            await wsClose(ws);
            // Give a tick for the callback to fire.
            await new Promise((r) => setTimeout(r, 50));
            expect(disconnected).toHaveBeenCalledTimes(1);
        });
        it("should update connection count on connect and disconnect", async () => {
            await server.start();
            const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
            await wsOpen(ws1);
            await new Promise((r) => setTimeout(r, 50));
            expect(server.getConnections()).toBe(1);
            const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
            await wsOpen(ws2);
            await new Promise((r) => setTimeout(r, 50));
            expect(server.getConnections()).toBe(2);
            ws1.close(1000);
            await wsClose(ws1);
            await new Promise((r) => setTimeout(r, 50));
            expect(server.getConnections()).toBe(1);
            ws2.close(1000);
            await wsClose(ws2);
            await new Promise((r) => setTimeout(r, 50));
            expect(server.getConnections()).toBe(0);
        });
    });
    // -------------------------------------------------------------------------
    // TT-009-03: Heartbeat mechanism (ping/pong)
    // -------------------------------------------------------------------------
    describe("heartbeat", () => {
        it("should keep alive connections that respond to pongs", async () => {
            // Use a very short heartbeat interval for testing.
            const hbServer = new WsServer({
                port: randomPort(),
                heartbeatIntervalMs: 100,
                logger: testLogger(),
            });
            await hbServer.start();
            const ws = new WebSocket(`ws://127.0.0.1:${hbServer["config"].port}`);
            await wsOpen(ws);
            await new Promise((r) => setTimeout(r, 50));
            expect(hbServer.getConnections()).toBe(1);
            // Wait for several heartbeat cycles.
            await new Promise((r) => setTimeout(r, 400));
            // Connection should still be alive.
            expect(hbServer.getConnections()).toBe(1);
            ws.close();
            await wsClose(ws);
            await hbServer.stop();
        }, 10_000);
        it("should terminate connections that do not respond to pongs", async () => {
            const hbServer = new WsServer({
                port: randomPort(),
                heartbeatIntervalMs: 100,
                logger: testLogger(),
            });
            await hbServer.start();
            // Open a raw TCP connection that performs a valid WebSocket upgrade
            // handshake but then stops reading (never responds to pings).
            const { createConnection } = await import("node:net");
            const crypto = await import("node:crypto");
            const socket = createConnection({
                host: "127.0.0.1",
                port: hbServer["config"].port,
            });
            await new Promise((resolve) => socket.once("connect", resolve));
            const key = Buffer.from(crypto.randomBytes(16)).toString("base64");
            socket.write([
                "GET / HTTP/1.1",
                "Host: 127.0.0.1",
                "Upgrade: websocket",
                "Connection: Upgrade",
                `Sec-WebSocket-Key: ${key}`,
                "Sec-WebSocket-Version: 13",
                "",
                "",
            ].join("\r\n"));
            // Wait for the server to send the upgrade response and emit "connection".
            await new Promise((r) => setTimeout(r, 100));
            expect(hbServer.getConnections()).toBe(1);
            // Wait for heartbeat: server sends ping, waits one cycle, then terminates.
            await new Promise((r) => setTimeout(r, 400));
            expect(hbServer.getConnections()).toBe(0);
            socket.destroy();
            await hbServer.stop();
        }, 10_000);
    });
    // -------------------------------------------------------------------------
    // send() and broadcast()
    // -------------------------------------------------------------------------
    describe("messaging", () => {
        it("should send a message to a specific client", async () => {
            await server.start();
            let receivedClientId;
            const connected = vi.fn((id) => {
                receivedClientId = id;
            });
            server.onConnection(connected);
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);
            await wsOpen(ws);
            await new Promise((r) => setTimeout(r, 50));
            const received = new Promise((resolve) => {
                ws.once("message", (data) => resolve(data.toString()));
            });
            server.send(receivedClientId, { type: "test", payload: "hello" });
            const msg = (await received);
            const parsed = JSON.parse(msg);
            expect(parsed).toEqual({ type: "test", payload: "hello" });
            ws.close();
            await wsClose(ws);
        });
        it("should not throw when sending to a non-existent client", async () => {
            await server.start();
            expect(() => server.send("non-existent-id", { test: true })).not.toThrow();
        });
        it("should broadcast a message to all connected clients", async () => {
            await server.start();
            const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
            const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
            await wsOpen(ws1);
            await wsOpen(ws2);
            await new Promise((r) => setTimeout(r, 50));
            const msg1 = new Promise((resolve) => ws1.once("message", (d) => resolve(d.toString())));
            const msg2 = new Promise((resolve) => ws2.once("message", (d) => resolve(d.toString())));
            server.broadcast({ type: "announcement", text: "hi" });
            const [r1, r2] = await Promise.all([msg1, msg2]);
            expect(JSON.parse(r1)).toEqual({ type: "announcement", text: "hi" });
            expect(JSON.parse(r2)).toEqual({ type: "announcement", text: "hi" });
            ws1.close();
            ws2.close();
            await Promise.all([wsClose(ws1), wsClose(ws2)]);
        });
    });
    // -------------------------------------------------------------------------
    // TT-009-05: Security -- does not accept external connections (127.0.0.1)
    // -------------------------------------------------------------------------
    describe("network security", () => {
        it("should only bind to 127.0.0.1 by default", async () => {
            const srv = new WsServer({ port: randomPort(), logger: testLogger() });
            await srv.start();
            // We cannot reliably test 0.0.0.0 rejection in CI (depends on network stack),
            // but we verify the config was applied correctly.
            expect(srv["config"].host).toBe("127.0.0.1");
            await srv.stop();
        });
    });
    // -------------------------------------------------------------------------
    // TT-009-06: Logging events through pino
    // -------------------------------------------------------------------------
    describe("logging", () => {
        /** Helper: create a log sink that collects parsed JSON entries. */
        function createLogSink() {
            const entries = [];
            const stream = new Writable({
                write(chunk, _encoding, cb) {
                    // Pino v10 writes serialized JSON strings (Buffer).
                    const str = Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);
                    entries.push(JSON.parse(str.trim()));
                    cb();
                },
            });
            return { stream, entries };
        }
        it("should log connection events", async () => {
            const { stream, entries } = createLogSink();
            const logger = pino(stream).child({ component: "ws-server" });
            const logServer = new WsServer({ port: randomPort(), logger });
            await logServer.start();
            const ws = new WebSocket(`ws://127.0.0.1:${logServer["config"].port}`);
            await wsOpen(ws);
            await new Promise((r) => setTimeout(r, 100));
            const connectLogs = entries.filter((e) => e.msg === "Client connected");
            expect(connectLogs.length).toBeGreaterThanOrEqual(1);
            expect(connectLogs[0]).toHaveProperty("clientId");
            ws.close();
            await wsClose(ws);
            await logServer.stop();
        });
        it("should log disconnection events", async () => {
            const { stream, entries } = createLogSink();
            const logger = pino(stream).child({ component: "ws-server" });
            const logServer = new WsServer({ port: randomPort(), logger });
            await logServer.start();
            const ws = new WebSocket(`ws://127.0.0.1:${logServer["config"].port}`);
            await wsOpen(ws);
            await new Promise((r) => setTimeout(r, 50));
            ws.close(1000, "test");
            await wsClose(ws);
            await new Promise((r) => setTimeout(r, 100));
            const disconnectLogs = entries.filter((e) => e.msg === "Client disconnected");
            expect(disconnectLogs.length).toBe(1);
            expect(disconnectLogs[0]).toHaveProperty("clientId");
            expect(disconnectLogs[0]).toHaveProperty("code", 1000);
            await logServer.stop();
        });
    });
});
//# sourceMappingURL=ws-server.test.js.map