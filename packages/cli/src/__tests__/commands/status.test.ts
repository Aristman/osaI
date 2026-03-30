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
async function createMockGateway(): Promise<{
  port: number;
  close: () => void;
}> {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number };
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
  let gateway: { port: number; close: () => void };

  beforeEach(async () => {
    gateway = await createMockGateway();
  });

  afterEach(() => {
    gateway.close();
  });

  it("TT-005-03: should detect connected gateway status", async () => {
    const { runStatus } = await import("../../commands/status.js");

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const origStdout = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit;

    process.stdout.write = ((chunk: string) => {
      stdoutChunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(chunk);
      return true;
    }) as typeof process.stderr.write;
    process.exit = (() => {}) as never;

    try {
      await runStatus({ gatewayUrl: `ws://127.0.0.1:${gateway.port}` });
    } catch {
      // process.exit is mocked, ignore
    } finally {
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

    const stdoutChunks: string[] = [];

    const origStdout = process.stdout.write.bind(process.stdout);
    const origStderr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit;

    process.stdout.write = ((chunk: string) => {
      stdoutChunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => {
      return true;
    }) as typeof process.stderr.write;
    process.exit = (() => {}) as never;

    try {
      await runStatus({ gatewayUrl: "ws://127.0.0.1:19999" });
    } catch {
      // process.exit is mocked
    } finally {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      process.exit = origExit;
    }

    const stdout = stdoutChunks.join("");
    expect(stdout).toContain("osaI System Status");
    expect(stdout).toContain("Gateway");
  });
});
