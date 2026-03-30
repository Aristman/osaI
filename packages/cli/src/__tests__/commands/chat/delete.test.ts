/**
 * Chat Delete command tests (T-004)
 *
 * TT-004-04: osai chat delete <id> -- confirmation prompt, success/error
 * TT-004-06: Gateway unavailable -- error on STDERR, exit 1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer } from "ws";
import http from "node:http";
import { runChatDelete } from "../../../commands/chat/delete.js";

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

describe("runChatDelete", () => {
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

  it("TT-004-04: should delete chat with --yes flag and print success", async () => {
    const { server, wsServer, url } = await startTestServer();

    wsServer.on("connection", (ws) => {
      ws.on("message", () => {
        ws.send(JSON.stringify({
          type: "command_response",
          deleted_chat_id: "chat-to-delete",
        }));
        ws.close();
      });
    });

    try {
      await runChatDelete("chat-to-delete", { gatewayUrl: url, yes: true });

      const stdoutCalls = stdoutSpy.mock.calls.map((call) => call[0] as string).join("");
      expect(stdoutCalls).toContain("chat-to-delete");
      expect(stdoutCalls).toContain("deleted");
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      wsServer.close();
      server.close();
    }
  }, 10000);

  it("TT-004-04: should reject empty chat ID", async () => {
    try {
      await runChatDelete("", { gatewayUrl: "ws://127.0.0.1:1" });
    } catch {
      // Expected: process.exit throws
    }

    const stderrCalls = stderrSpy.mock.calls.map((call) => call[0] as string).join("");
    expect(stderrCalls).toContain("Chat ID is required");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("TT-004-06: should print error when Gateway is unavailable", async () => {
    try {
      await runChatDelete("chat-nonexistent", { gatewayUrl: "ws://127.0.0.1:1", yes: true });
    } catch {
      // Expected: process.exit throws
    }

    const stderrCalls = stderrSpy.mock.calls.map((call) => call[0] as string).join("");
    expect(stderrCalls).toContain("Cannot connect to Gateway");
    expect(exitSpy).toHaveBeenCalledWith(1);
  }, 10000);
});
