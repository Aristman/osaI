/**
 * Chat Archive command tests (T-004)
 *
 * TT-004-05: osai chat archive <id> -- success message, exit 0
 * TT-004-06: Gateway unavailable -- error on STDERR, exit 1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer } from "ws";
import http from "node:http";
import { runChatArchive } from "../../../commands/chat/archive.js";

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

describe("runChatArchive", () => {
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

  it("TT-004-05: should archive chat and print success message", async () => {
    const { server, wsServer, url } = await startTestServer();

    wsServer.on("connection", (ws) => {
      ws.on("message", () => {
        ws.send(JSON.stringify({
          type: "command_response",
          archived_chat_id: "chat-to-archive",
          name: "Old Chat",
        }));
        ws.close();
      });
    });

    try {
      await runChatArchive("chat-to-archive", { gatewayUrl: url });

      const stdoutCalls = stdoutSpy.mock.calls.map((call) => call[0] as string).join("");
      expect(stdoutCalls).toContain("chat-to-archive");
      expect(stdoutCalls).toContain("Old Chat");
      expect(stdoutCalls).toContain("archived");
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      wsServer.close();
      server.close();
    }
  }, 10000);

  it("TT-004-05: should archive chat without name in response", async () => {
    const { server, wsServer, url } = await startTestServer();

    wsServer.on("connection", (ws) => {
      ws.on("message", () => {
        ws.send(JSON.stringify({
          type: "command_response",
          archived_chat_id: "chat-xyz",
        }));
        ws.close();
      });
    });

    try {
      await runChatArchive("chat-xyz", { gatewayUrl: url });

      const stdoutCalls = stdoutSpy.mock.calls.map((call) => call[0] as string).join("");
      expect(stdoutCalls).toContain("chat-xyz");
      expect(stdoutCalls).toContain("archived");
    } finally {
      wsServer.close();
      server.close();
    }
  }, 10000);

  it("TT-004-05: should reject empty chat ID", async () => {
    try {
      await runChatArchive("", { gatewayUrl: "ws://127.0.0.1:1" });
    } catch {
      // Expected: process.exit throws
    }

    const stderrCalls = stderrSpy.mock.calls.map((call) => call[0] as string).join("");
    expect(stderrCalls).toContain("Chat ID is required");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("TT-004-06: should print error when Gateway is unavailable", async () => {
    try {
      await runChatArchive("chat-nonexistent", { gatewayUrl: "ws://127.0.0.1:1" });
    } catch {
      // Expected: process.exit throws
    }

    const stderrCalls = stderrSpy.mock.calls.map((call) => call[0] as string).join("");
    expect(stderrCalls).toContain("Cannot connect to Gateway");
    expect(exitSpy).toHaveBeenCalledWith(1);
  }, 10000);
});
