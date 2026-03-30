/**
 * Quick Command tests (T-006)
 *
 * TT-006-05: osai "какая погода?" -- quick mode, ответ в stdout
 * TT-006-06: osai "command" -- Gateway недоступен -> error, exit 1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import { runQuickCommand } from "../../commands/quick.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  } as unknown as import("pino").Logger;
}

function startTestServer(): Promise<{
  server: http.Server;
  wsServer: InstanceType<typeof WebSocketServer>;
  url: string;
  port: number;
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
        port: addr.port,
      });
    });
  });
}

function waitForClientConnection(wsServer: InstanceType<typeof WebSocketServer>): Promise<InstanceType<typeof WebSocket>> {
  return new Promise((resolve) => {
    wsServer.on("connection", (ws) => resolve(ws));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QuickCommand", () => {

  // -----------------------------------------------------------------------
  // TT-006-05: Quick mode -- ответ в stdout
  // -----------------------------------------------------------------------
  describe("TT-006-05: quick mode sends message and receives response", () => {
    it("should send a message and receive a text block response", async () => {
      const { server, wsServer, url } = await startTestServer();

      try {
        // Set up server to respond with a text block
        wsServer.on("connection", (ws) => {
          // Wait for client messages
          ws.on("message", (data) => {
            const msg = JSON.parse(data.toString()) as Record<string, unknown>;

            if (msg["type"] === "subscribe") {
              // Acknowledge subscription
              return;
            }

            if (msg["type"] === "message") {
              // Respond with a text block
              ws.send(JSON.stringify({
                type: "block",
                session_id: msg["session_id"],
                block_type: "text",
                content: "Сегодня в Москве солнечно, +18C.",
              }));
            }
          });
        });

        const result = await runQuickCommand("какая погода?", {
          gatewayUrl: url,
          logger: createTestLogger(),
          responseTimeoutMs: 5000,
          autoApproveLowRisk: true,
        });

        expect(result.exitCode).toBe(0);
        expect(result.response).toContain("солнечно");
        expect(result.response).toContain("+18C");
        expect(result.error).toBeUndefined();
      } finally {
        wsServer.close();
        server.close();
      }
    }, 15000);

    it("should handle multiple text blocks by concatenating them", async () => {
      const { server, wsServer, url } = await startTestServer();

      try {
        wsServer.on("connection", (ws) => {
          ws.on("message", (data) => {
            const msg = JSON.parse(data.toString()) as Record<string, unknown>;

            if (msg["type"] === "message") {
              // Send multiple blocks
              ws.send(JSON.stringify({
                type: "block",
                session_id: msg["session_id"],
                block_type: "text",
                content: "First part. ",
              }));

              setTimeout(() => {
                ws.send(JSON.stringify({
                  type: "block",
                  session_id: msg["session_id"],
                  block_type: "text",
                  content: "Second part.",
                }));
              }, 100);
            }
          });
        });

        const result = await runQuickCommand("tell me a story", {
          gatewayUrl: url,
          logger: createTestLogger(),
          responseTimeoutMs: 5000,
        });

        expect(result.exitCode).toBe(0);
        expect(result.response).toContain("First part");
        expect(result.response).toContain("Second part");
      } finally {
        wsServer.close();
        server.close();
      }
    }, 15000);

    it("should auto-approve low-risk permission requests", async () => {
      const { server, wsServer, url } = await startTestServer();

      try {
        const permissionResponses: unknown[] = [];

        wsServer.on("connection", (ws) => {
          ws.on("message", (data) => {
            const msg = JSON.parse(data.toString()) as Record<string, unknown>;

            if (msg["type"] === "permission_response") {
              permissionResponses.push(msg);
            }

            if (msg["type"] === "message") {
              // First send a permission request for a low-risk read
              ws.send(JSON.stringify({
                type: "permission_request",
                request_id: "perm-001",
                session_id: msg["session_id"],
                tool: "filesystem",
                action: "read",
                params: { path: "/tmp/data.txt" },
                risk_level: "low",
              }));

              // After permission is auto-approved, send the response
              setTimeout(() => {
                ws.send(JSON.stringify({
                  type: "block",
                  session_id: msg["session_id"],
                  block_type: "text",
                  content: "File contents here.",
                }));
              }, 200);
            }
          });
        });

        const result = await runQuickCommand("read file", {
          gatewayUrl: url,
          logger: createTestLogger(),
          responseTimeoutMs: 5000,
          autoApproveLowRisk: true,
        });

        // Should have auto-approved the low-risk permission
        expect(permissionResponses).toHaveLength(1);
        const permResp = permissionResponses[0] as Record<string, unknown>;
        expect(permResp["type"]).toBe("permission_response");
        expect((permResp["payload"] as Record<string, unknown>)["allow"]).toBe(true);

        expect(result.exitCode).toBe(0);
        expect(result.response).toContain("File contents here");
      } finally {
        wsServer.close();
        server.close();
      }
    }, 15000);

    it("should deny high-risk permission requests in non-interactive mode", async () => {
      const { server, wsServer, url } = await startTestServer();

      try {
        const permissionResponses: unknown[] = [];

        wsServer.on("connection", (ws) => {
          ws.on("message", (data) => {
            const msg = JSON.parse(data.toString()) as Record<string, unknown>;

            if (msg["type"] === "permission_response") {
              permissionResponses.push(msg);
            }

            if (msg["type"] === "message") {
              // Send a high-risk permission request
              ws.send(JSON.stringify({
                type: "permission_request",
                request_id: "perm-high-001",
                session_id: msg["session_id"],
                tool: "shell",
                action: "exec",
                params: { command: "rm -rf /tmp/test" },
                risk_level: "high",
              }));
            }
          });
        });

        const result = await runQuickCommand("delete file", {
          gatewayUrl: url,
          logger: createTestLogger(),
          responseTimeoutMs: 5000,
          autoApproveLowRisk: true,
        });

        // Should have denied the high-risk permission
        expect(permissionResponses).toHaveLength(1);
        const permResp = permissionResponses[0] as Record<string, unknown>;
        expect((permResp["payload"] as Record<string, unknown>)["allow"]).toBe(false);
      } finally {
        wsServer.close();
        server.close();
      }
    }, 15000);
  });

  // -----------------------------------------------------------------------
  // TT-006-06: Gateway недоступен -> error, exit 1
  // -----------------------------------------------------------------------
  describe("TT-006-06: Gateway unavailable", () => {
    it("should return exitCode 1 and error when Gateway is not available", async () => {
      const result = await runQuickCommand("test", {
        gatewayUrl: "ws://127.0.0.1:1", // port 1 = nothing listening
        logger: createTestLogger(),
        connectTimeoutMs: 500,
        responseTimeoutMs: 1000,
      });

      expect(result.exitCode).toBe(1);
      expect(result.response).toBe("");
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Cannot connect to Gateway");
    });

    it("should return error message mentioning osai start", async () => {
      const result = await runQuickCommand("hello", {
        gatewayUrl: "ws://127.0.0.1:1",
        logger: createTestLogger(),
        connectTimeoutMs: 500,
        responseTimeoutMs: 1000,
      });

      expect(result.error).toContain("osai start");
    });

    it("should handle timeout when Gateway does not respond", async () => {
      const { server, wsServer, url } = await startTestServer();

      try {
        // Server accepts connections but never responds
        wsServer.on("connection", () => {
          // Intentionally do not respond
        });

        const result = await runQuickCommand("hello", {
          gatewayUrl: url,
          logger: createTestLogger(),
          responseTimeoutMs: 1000,
        });

        expect(result.exitCode).toBe(1);
        expect(result.error).toContain("did not respond in time");
      } finally {
        wsServer.close();
        server.close();
      }
    }, 15000);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe("edge cases", () => {
    it("should use provided sessionId if given", async () => {
      const { server, wsServer, url } = await startTestServer();
      let receivedSessionId: string | undefined;

      try {
        wsServer.on("connection", (ws) => {
          ws.on("message", (data) => {
            const msg = JSON.parse(data.toString()) as Record<string, unknown>;
            if (msg["type"] === "message") {
              receivedSessionId = msg["session_id"] as string;
              ws.send(JSON.stringify({
                type: "block",
                session_id: msg["session_id"],
                block_type: "text",
                content: "ok",
              }));
            }
          });
        });

        await runQuickCommand("test", {
          gatewayUrl: url,
          logger: createTestLogger(),
          responseTimeoutMs: 5000,
          sessionId: "my-custom-session",
        });

        expect(receivedSessionId).toBe("my-custom-session");
      } finally {
        wsServer.close();
        server.close();
      }
    }, 15000);

    it("should include chatId in messages when provided", async () => {
      const { server, wsServer, url } = await startTestServer();
      let receivedChatId: string | undefined;

      try {
        wsServer.on("connection", (ws) => {
          ws.on("message", (data) => {
            const msg = JSON.parse(data.toString()) as Record<string, unknown>;
            if (msg["type"] === "message") {
              receivedChatId = msg["chat_id"] as string | undefined;
              ws.send(JSON.stringify({
                type: "block",
                session_id: msg["session_id"],
                block_type: "text",
                content: "ok",
              }));
            }
          });
        });

        await runQuickCommand("test", {
          gatewayUrl: url,
          logger: createTestLogger(),
          responseTimeoutMs: 5000,
          chatId: "chat-123",
        });

        expect(receivedChatId).toBe("chat-123");
      } finally {
        wsServer.close();
        server.close();
      }
    }, 15000);
  });
});
