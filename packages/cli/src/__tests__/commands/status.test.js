/**
 * status command tests (T-005)
 *
 * TT-005-03: osai status -- выводит статус системы
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import { GatewayClient } from "../../ws/gateway-client.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Create a mock Gateway WS server on a random port.
 */
async function createMockGateway() {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });
    return new Promise((resolve) => {
        server.listen(0, () => {
            const addr = server.address();
            resolve({
                port: addr.port,
                close: () => {
                    wss.close();
                    server.close();
                },
            });
        });
        wss.on("connection", (_ws) => {
            // Accept connections silently
        });
    });
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Command: osai status", () => {
    let gateway;
    beforeEach(async () => {
        gateway = await createMockGateway();
    });
    afterEach(() => {
        gateway.close();
    });
    it("TT-005-03: should detect connected gateway status", async () => {
        const { runStatus } = await import("../../commands/status.js");
        const stdoutChunks = [];
        const stderrChunks = [];
        const origStdout = process.stdout.write.bind(process.stdout);
        const origStderr = process.stderr.write.bind(process.stderr);
        const origExit = process.exit;
        process.stdout.write = ((chunk) => {
            stdoutChunks.push(chunk);
            return true;
        });
        process.stderr.write = ((chunk) => {
            stderrChunks.push(chunk);
            return true;
        });
        process.exit = (() => { });
        try {
            await runStatus({ gatewayUrl: `ws://127.0.0.1:${gateway.port}` });
        }
        catch {
            // process.exit is mocked, ignore
        }
        finally {
            process.stdout.write = origStdout;
            process.stderr.write = origStderr;
            process.exit = origExit;
        }
        const stdout = stdoutChunks.join("");
        expect(stdout).toContain("osaI System Status");
        expect(stdout).toContain("Gateway");
        expect(stdout).toContain("connected");
    });
    it("TT-005-03: should show disconnected status when gateway is not available", async () => {
        const { runStatus } = await import("../../commands/status.js");
        const stdoutChunks = [];
        const origStdout = process.stdout.write.bind(process.stdout);
        const origStderr = process.stderr.write.bind(process.stderr);
        const origExit = process.exit;
        process.stdout.write = ((chunk) => {
            stdoutChunks.push(chunk);
            return true;
        });
        process.stderr.write = ((chunk) => {
            return true;
        });
        process.exit = (() => { });
        try {
            await runStatus({ gatewayUrl: "ws://127.0.0.1:19999" });
        }
        catch {
            // process.exit is mocked
        }
        finally {
            process.stdout.write = origStdout;
            process.stderr.write = origStderr;
            process.exit = origExit;
        }
        const stdout = stdoutChunks.join("");
        expect(stdout).toContain("osaI System Status");
        expect(stdout).toContain("Gateway");
    });
});
//# sourceMappingURL=status.test.js.map