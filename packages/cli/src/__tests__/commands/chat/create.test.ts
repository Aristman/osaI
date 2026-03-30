/**
 * Chat Create command tests (T-004)
 *
 * TT-004-02: osai chat create --name "Test" -- success with chat_id, exit 0
 * TT-004-06: Gateway unavailable -- error on STDERR, exit 1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer } from "ws";
import http from "node:http";
import { runChatCreate } from "../../../commands/chat/create.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startTestServer(): Promise<{
  server: http.Server;
  wsServer: InstanceType<typeof WebSocketServer>;
  url: string;
}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const wsServer = new WebSocketServer({ server });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
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

describe("runChatCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

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

  it("TT-004-02: should create chat and print success message with chat_id", async () => {
    const { server, wsServer, url } = await startTestServer();

    wsServer.on("connection", (ws) => {
      ws.on("message", () => {
        ws.send(JSON.stringify({
          type: "command_response",
          chat_id: "chat-abc123",
          name: "Test",
        }));
        ws.close();
      });
    });

    try {
      await runChatCreate({ name: "Test", gatewayUrl: url });

      const stdoutCalls = stdoutSpy.mock.calls.map((call) => call[0] as string).join("");
      expect(stdoutCalls).toContain("Chat created successfully");
      expect(stdoutCalls).toContain("chat-abc123");
      expect(stdoutCalls).toContain("Test");
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      wsServer.close();
      server.close();
    }
  }, 10000);

  it("TT-004-02: should create chat without name", async () => {
    const { server, wsServer, url } = await startTestServer();

    wsServer.on("connection", (ws) => {
      ws.on("message", () => {
        ws.send(JSON.stringify({
          type: "command_response",
          chat_id: "chat-no-name",
        }));
        ws.close();
      });
    });

    try {
      await runChatCreate({ gatewayUrl: url });

      const stdoutCalls = stdoutSpy.mock.calls.map((call) => call[0] as string).join("");
      expect(stdoutCalls).toContain("chat-no-name");
      expect(stdoutCalls).toContain("Untitled");
    } finally {
      wsServer.close();
      server.close();
    }
  }, 10000);

  it("TT-004-06: should print error when Gateway is unavailable", async () => {
    try {
      await runChatCreate({ gatewayUrl: "ws://127.0.0.1:1" });
    } catch {
      // Expected: process.exit throws
    }

    const stderrCalls = stderrSpy.mock.calls.map((call) => call[0] as string).join("");
    expect(stderrCalls).toContain("Cannot connect to Gateway");
    expect(exitSpy).toHaveBeenCalledWith(1);
  }, 10000);
});
