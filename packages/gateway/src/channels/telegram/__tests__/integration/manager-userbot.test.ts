// ---------------------------------------------------------------------------
// Integration Test: Manager -> UserbotBridge (T-009)
//
// Tests TelegramManager coordination with UserbotBridge:
//   - Manager starts/stops userbot bridge lifecycle
//   - bot+userbot mode: both components start
//   - bot-only mode: userbot stays stopped
//   - Graceful degradation when userbot fails
//   - Manager status reflects userbot state
//
// Uses mock child_process for Python process simulation.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import pino from "pino";
import {
  TelegramManager,
  type TelegramManagerConfig,
} from "../../manager.js";
import {
  UserbotBridge,
  type UserbotBridgeConfig,
} from "../../userbot.js";
import type {
  TelegramConfig,
  BridgeRequest,
  BridgeResponse,
} from "../../types.js";

// ---------------------------------------------------------------------------
// Mock factory -- hoisted for vi.mock
// ---------------------------------------------------------------------------

const mockSpawnFactory = vi.hoisted(() => {
  let totalSpawnCalls = 0;

  function createMockProcess(): {
    process: ChildProcess;
    emitStdout: (data: string) => void;
    getStdinData: () => string;
  } {
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    let stdinData = "";

    const stdinMock = {
      write: vi.fn((data: string, _encoding: unknown, callback: ((err?: Error | null) => void) | undefined) => {
        stdinData += data;
        if (typeof callback === "function") callback(null);
        else if (_encoding && typeof _encoding === "function") (_encoding as (err?: Error | null) => void)(null);
      }),
      end: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
    };

    function createReadableMock(streamKey: string): { on: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
      return {
        on: vi.fn((_event: string, fn: (...args: unknown[]) => void) => {
          if (!listeners[streamKey]) listeners[streamKey] = [];
          listeners[streamKey]!.push(fn);
        }),
        removeAllListeners: vi.fn(),
        destroy: vi.fn(),
      };
    }

    const stdoutMock = createReadableMock("stdout-data");
    const stderrMock = createReadableMock("stderr-data");

    const mockProcess = {
      stdin: stdinMock,
      stdout: stdoutMock,
      stderr: stderrMock,
      pid: 54321,
      killed: false,
      kill: vi.fn((signal?: string) => {
        mockProcess.killed = true;
        const closeListeners = listeners["close"];
        if (closeListeners) {
          for (const fn of closeListeners) {
            fn(signal === "SIGKILL" ? null : 0, signal ?? "SIGTERM");
          }
        }
      }),
      on: vi.fn((_event: string, fn: (...args: unknown[]) => void) => {
        const event = _event;
        if (!listeners[event]) listeners[event] = [];
        listeners[event]!.push(fn);
      }),
      once: vi.fn((_event: string, fn: (...args: unknown[]) => void) => {
        const event = _event;
        if (!listeners[event]) listeners[event] = [];
        listeners[event]!.push(fn);
      }),
      removeAllListeners: vi.fn(),
      ref: vi.fn(),
      unref: vi.fn(),
      connected: true,
      spawnargs: ["python3", "/fake/telethon_userbot/main.py"],
      spawnfile: "python3",
    } as unknown as ChildProcess;

    return {
      process: mockProcess,
      emitStdout(data: string): void {
        const stdoutListeners = listeners["stdout-data"];
        if (stdoutListeners) {
          for (const fn of stdoutListeners) {
            fn(Buffer.from(data));
          }
        }
      },
      getStdinData(): string {
        return stdinData;
      },
    };
  }

  let currentMock: ReturnType<typeof createMockProcess> | null = null;

  return {
    createMockProcess,
    incrementSpawnCalls: () => { totalSpawnCalls += 1; },
    getCurrentMock: () => currentMock,
    setCurrentMock: (mock: ReturnType<typeof createMockProcess> | null) => {
      currentMock = mock;
    },
    getTotalSpawnCalls: () => totalSpawnCalls,
    resetTotalSpawnCalls: () => { totalSpawnCalls = 0; },
  };
});

vi.mock("node:child_process", () => ({
  spawn: vi.fn((...args: unknown[]) => {
    const fresh = mockSpawnFactory.createMockProcess();
    mockSpawnFactory.setCurrentMock(fresh);
    mockSpawnFactory.incrementSpawnCalls();
    return fresh.process;
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function testLogger(): pino.Logger {
  return pino({ level: "silent" }).child({ component: "integration-test" });
}

function createTestConfig(overrides: Partial<TelegramConfig> = {}): TelegramConfig {
  return {
    bot: {
      enabled: true,
      token: "test-bot-token",
      allowedUsers: ["12345"],
      ...overrides.bot,
    },
    userbot: {
      enabled: true,
      apiId: 12345,
      apiHash: "test-api-hash",
      phone: "+79991234567",
      ...overrides.userbot,
    },
    mirrors: [],
    ...overrides,
  };
}

function createManagerConfig(
  overrides: Partial<TelegramConfig> = {},
  logger?: pino.Logger,
): TelegramManagerConfig {
  return {
    config: createTestConfig(overrides),
    logger: logger ?? testLogger(),
  };
}

function createBridgeConfig(
  overrides: Partial<UserbotBridgeConfig> = {},
): UserbotBridgeConfig {
  return {
    pythonPath: "python3",
    scriptPath: "/fake/telethon_userbot/main.py",
    apiId: 12345,
    apiHash: "test-api-hash",
    phone: "+79991234567",
    healthCheckTimeoutMs: 2000,
    maxRestartAttempts: 3,
    logger: testLogger(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Integration: TelegramManager <-> UserbotBridge", () => {
  let bridge: UserbotBridge;

  beforeEach(() => {
    mockSpawnFactory.setCurrentMock(null);
    mockSpawnFactory.resetTotalSpawnCalls();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (bridge) {
      try {
        await bridge.stop();
      } catch {
        // ignore
      }
    }
  });

  // -------------------------------------------------------------------------
  // Manager starts userbot in bot+userbot mode
  // -------------------------------------------------------------------------
  describe("userbot lifecycle via manager", () => {
    it("should start manager in bot+userbot mode", async () => {
      const manager = new TelegramManager(createManagerConfig());
      await manager.start();

      const status = manager.getStatus();
      expect(status.mode).toBe("bot+userbot");
      expect(status.started).toBe(true);
      expect(status.bot.status).toBe("running");
      expect(status.userbot.status).toBe("running");

      await manager.stop();
    });

    it("should keep userbot stopped in bot-only mode", async () => {
      const manager = new TelegramManager(
        createManagerConfig({
          userbot: { enabled: false, apiId: 1, apiHash: "x", phone: "1" },
        }),
      );
      await manager.start();

      const status = manager.getStatus();
      expect(status.mode).toBe("bot-only");
      expect(status.userbot.status).toBe("stopped");

      await manager.stop();
    });

    it("should stop userbot when manager stops", async () => {
      const manager = new TelegramManager(createManagerConfig());
      await manager.start();

      expect(manager.getStatus().userbot.status).toBe("running");

      await manager.stop();

      expect(manager.getStatus().userbot.status).toBe("stopped");
      expect(manager.isStarted()).toBe(false);
    });

    it("should start mirror when mirrors configured in bot+userbot mode", async () => {
      const manager = new TelegramManager(
        createManagerConfig({
          mirrors: [
            {
              chatId: "chat-1",
              telegramChatId: -1001234567890,
              direction: "both",
            },
          ],
        }),
      );
      await manager.start();

      const status = manager.getStatus();
      expect(status.mirror.status).toBe("running");
      expect(status.bot.status).toBe("running");
      expect(status.userbot.status).toBe("running");

      await manager.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Direct UserbotBridge lifecycle (manager delegates to bridge)
  // -------------------------------------------------------------------------
  describe("UserbotBridge lifecycle", () => {
    it("should start and stop bridge", async () => {
      bridge = new UserbotBridge(createBridgeConfig());
      await bridge.start();

      expect(bridge.isRunning()).toBe(true);

      await bridge.stop();

      expect(bridge.isRunning()).toBe(false);
    });

    it("should pass correct configuration to bridge", () => {
      const config = createBridgeConfig({
        pythonPath: "/custom/python3.12",
        scriptPath: "/custom/path/main.py",
        apiId: 99999,
        apiHash: "custom-hash",
        phone: "+79990000000",
        maxRestartAttempts: 5,
        healthCheckTimeoutMs: 10000,
      });

      bridge = new UserbotBridge(config);

      const retrievedConfig = bridge.getConfig();
      expect(retrievedConfig.pythonPath).toBe("/custom/python3.12");
      expect(retrievedConfig.scriptPath).toBe("/custom/path/main.py");
      expect(retrievedConfig.apiId).toBe(99999);
      expect(retrievedConfig.apiHash).toBe("custom-hash");
      expect(retrievedConfig.phone).toBe("+79990000000");
      expect(retrievedConfig.maxRestartAttempts).toBe(5);
      expect(retrievedConfig.healthCheckTimeoutMs).toBe(10000);
    });

    it("should spawn Python process with correct arguments", async () => {
      bridge = new UserbotBridge(
        createBridgeConfig({
          pythonPath: "/usr/bin/python3.11",
          scriptPath: "/opt/osai/telethon_userbot/main.py",
          apiId: 55555,
          apiHash: "integration-hash",
          phone: "+79991112233",
        }),
      );

      await bridge.start();

      const mock = mockSpawnFactory.getCurrentMock();
      expect(mock).not.toBeNull();
    });

    it("should kill Python process on stop", async () => {
      bridge = new UserbotBridge(createBridgeConfig());
      await bridge.start();

      const mock = mockSpawnFactory.getCurrentMock()!;

      await bridge.stop();

      expect(mock.process.kill).toHaveBeenCalled();
      expect(bridge.isRunning()).toBe(false);
    });

    it("should throw on double start", async () => {
      bridge = new UserbotBridge(createBridgeConfig());
      await bridge.start();

      await expect(bridge.start()).rejects.toThrow("already running");
    });

    it("should throw on stop when not running", async () => {
      bridge = new UserbotBridge(createBridgeConfig());

      await expect(bridge.stop()).rejects.toThrow("not running");
    });

    it("should allow restart cycle: start -> stop -> start", async () => {
      bridge = new UserbotBridge(createBridgeConfig());

      await bridge.start();
      expect(bridge.isRunning()).toBe(true);
      const callsAfterFirstStart = mockSpawnFactory.getTotalSpawnCalls();

      await bridge.stop();
      expect(bridge.isRunning()).toBe(false);

      await bridge.start();
      expect(bridge.isRunning()).toBe(true);
      expect(mockSpawnFactory.getTotalSpawnCalls()).toBeGreaterThan(callsAfterFirstStart);
    });
  });

  // -------------------------------------------------------------------------
  // Bridge protocol communication
  // -------------------------------------------------------------------------
  describe("bridge protocol", () => {
    it("should send request and receive response via stdio", async () => {
      bridge = new UserbotBridge(createBridgeConfig());
      await bridge.start();

      const mock = mockSpawnFactory.getCurrentMock()!;
      const sendPromise = bridge.sendMessage("chat-1", "Hello");

      const requestLine = mock.getStdinData();
      expect(requestLine).toContain('"type":"send_message"');

      const parsedRequest = JSON.parse(requestLine.trim()) as BridgeRequest;
      expect(parsedRequest.params).toEqual({ chatId: "chat-1", text: "Hello" });

      mock.emitStdout(
        JSON.stringify({
          type: "send_result",
          id: parsedRequest.id,
          data: { success: true, messageId: 42 },
        }) + "\n",
      );

      const result = await sendPromise;
      expect(result).toEqual({ success: true, messageId: 42 });
    });

    it("should handle health check via bridge protocol", async () => {
      bridge = new UserbotBridge(createBridgeConfig());
      await bridge.start();

      const mock = mockSpawnFactory.getCurrentMock()!;
      const healthPromise = bridge.healthCheck();

      const requestLine = mock.getStdinData();
      const parsedRequest = JSON.parse(requestLine.trim()) as BridgeRequest;
      expect(parsedRequest.type).toBe("health");

      mock.emitStdout(
        JSON.stringify({
          type: "health",
          id: parsedRequest.id,
          data: { status: "ok", uptime: 600 },
        }) + "\n",
      );

      const result = await healthPromise;
      expect(result).toEqual({ status: "ok", uptime: 600 });
    });

    it("should handle getChats via bridge protocol", async () => {
      bridge = new UserbotBridge(createBridgeConfig());
      await bridge.start();

      const mock = mockSpawnFactory.getCurrentMock()!;
      const chatsPromise = bridge.getChats();

      const requestLine = mock.getStdinData();
      const parsedRequest = JSON.parse(requestLine.trim()) as BridgeRequest;
      expect(parsedRequest.type).toBe("get_chats");

      mock.emitStdout(
        JSON.stringify({
          type: "send_result",
          id: parsedRequest.id,
          data: {
            chats: [
              { id: -100123, title: "Test Group", type: "supergroup" },
            ],
          },
        }) + "\n",
      );

      const result = await chatsPromise;
      expect(result).toEqual({
        chats: [{ id: -100123, title: "Test Group", type: "supergroup" }],
      });
    });

    it("should correlate concurrent requests correctly", async () => {
      bridge = new UserbotBridge(createBridgeConfig());
      await bridge.start();

      const mock = mockSpawnFactory.getCurrentMock()!;

      // Send two concurrent requests
      const promise1 = bridge.sendMessage("chat-1", "first");
      const promise2 = bridge.getChats();

      const allStdin = mock.getStdinData();
      const lines = allStdin.trim().split("\n");
      expect(lines).toHaveLength(2);

      const req1 = JSON.parse(lines[0]!) as BridgeRequest;
      const req2 = JSON.parse(lines[1]!) as BridgeRequest;

      // Respond in reverse order
      mock.emitStdout(
        JSON.stringify({
          type: "send_result",
          id: req2.id,
          data: { chats: [] },
        }) + "\n",
      );
      mock.emitStdout(
        JSON.stringify({
          type: "send_result",
          id: req1.id,
          data: { success: true, messageId: 1 },
        }) + "\n",
      );

      const result2 = await promise2;
      const result1 = await promise1;

      // Each promise gets correct response despite reverse order
      expect(result2).toEqual({ chats: [] });
      expect(result1).toEqual({ success: true, messageId: 1 });
    });

    it("should reject pending requests on stop", async () => {
      bridge = new UserbotBridge(createBridgeConfig());
      await bridge.start();

      // Start a request but don't respond
      const sendPromise = bridge.sendMessage("chat-1", "test");

      // Stop the bridge -- pending request should be rejected
      await bridge.stop();

      await expect(sendPromise).rejects.toThrow("Bridge stopped while request was pending");
    });
  });

  // -------------------------------------------------------------------------
  // Incoming message handling
  // -------------------------------------------------------------------------
  describe("incoming messages from Python", () => {
    it("should invoke onMessage callback for unsolicited messages", async () => {
      const messages: BridgeResponse[] = [];
      bridge = new UserbotBridge(
        createBridgeConfig({
          onMessage: (msg) => messages.push(msg),
        }),
      );
      await bridge.start();

      const mock = mockSpawnFactory.getCurrentMock()!;
      mock.emitStdout(
        JSON.stringify({
          type: "message",
          id: "incoming-001",
          data: {
            chatId: -1001234567890,
            senderId: 99999,
            text: "Hello from Telegram",
            messageId: 42,
          },
        }) + "\n",
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messages).toHaveLength(1);
      expect(messages[0]!.type).toBe("message");
      expect(messages[0]!.data).toEqual({
        chatId: -1001234567890,
        senderId: 99999,
        text: "Hello from Telegram",
        messageId: 42,
      });
    });

    it("should handle invalid JSON from Python gracefully", async () => {
      bridge = new UserbotBridge(createBridgeConfig());
      await bridge.start();

      const mock = mockSpawnFactory.getCurrentMock()!;

      mock.emitStdout("not valid json\n");
      mock.emitStdout('{"type":"message"}\n'); // missing data field
      mock.emitStdout("\n"); // empty line

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(bridge.isRunning()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Auto-restart behavior
  // -------------------------------------------------------------------------
  describe("auto-restart", () => {
    it("should auto-restart on process crash", async () => {
      bridge = new UserbotBridge(
        createBridgeConfig({ maxRestartAttempts: 3 }),
      );
      await bridge.start();

      expect(mockSpawnFactory.getTotalSpawnCalls()).toBe(1);

      const mock = mockSpawnFactory.getCurrentMock()!;
      const closeFn = mock.process.on.mock.calls.find(
        (call) => call[0] === "close",
      )?.[1] as ((code: number | null, signal: string | null) => void) | undefined;

      expect(closeFn).toBeDefined();

      // Trigger crash
      closeFn!(1, null);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSpawnFactory.getTotalSpawnCalls()).toBe(2);
      expect(bridge.isRunning()).toBe(true);
    });
  });
});
