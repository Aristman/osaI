// ---------------------------------------------------------------------------
// UserbotBridge Tests (T-003)
//
// Test cases from roadmap T-003:
//   - Spawn/stop Python process lifecycle
//   - JSON-over-stdio protocol (line-delimited JSON, request/response correlation)
//   - Methods: start, stop, sendMessage, getChats, healthCheck
//   - Health check with timeout
//   - Auto-restart on crash (with limit)
//   - Invalid JSON from Python -- logged, no crash
//   - Message callback for incoming messages from Python
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import pino from "pino";
import { UserbotBridge, UserbotBridgeError, } from "../userbot.js";
// ---------------------------------------------------------------------------
// Mock factory -- hoisted to the top of the file for vi.mock
// ---------------------------------------------------------------------------
/**
 * Create a mock spawn factory.
 *
 * Returns a factory object that can create mock ChildProcess instances on demand.
 * Each call to createMockProcess() returns a fresh mock.
 *
 * The factory is hoisted using vi.hoisted() so it is available inside
 * vi.mock() factory functions which are also hoisted.
 */
const mockSpawnFactory = vi.hoisted(() => {
    // Global spawn call counter across all mock instances
    let totalSpawnCalls = 0;
    function incrementSpawnCalls() {
        totalSpawnCalls += 1;
    }
    function createMockProcess() {
        const spawnCalls = [];
        const listeners = {};
        let stdinData = "";
        // Minimal Writable mock for stdin
        const stdinMock = {
            write: vi.fn((data, _encoding, callback) => {
                stdinData += data;
                if (typeof callback === "function")
                    callback(null);
                else if (_encoding && typeof _encoding === "function")
                    _encoding(null);
            }),
            end: vi.fn(),
            destroy: vi.fn(),
            on: vi.fn(),
            once: vi.fn(),
            emit: vi.fn(),
        };
        // Minimal Readable mock for stdout/stderr
        function createReadableMock(streamKey) {
            return {
                on: vi.fn((_event, fn) => {
                    if (!listeners[streamKey])
                        listeners[streamKey] = [];
                    listeners[streamKey].push(fn);
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
            pid: 12345,
            killed: false,
            kill: vi.fn((signal) => {
                mockProcess.killed = true;
                const closeListeners = listeners["close"];
                if (closeListeners) {
                    for (const fn of closeListeners) {
                        fn(signal === "SIGKILL" ? null : 0, signal ?? "SIGTERM");
                    }
                }
                const exitListeners = listeners["exit"];
                if (exitListeners) {
                    for (const fn of exitListeners) {
                        fn(signal ?? "SIGTERM", signal === "SIGKILL" ? null : 0);
                    }
                }
            }),
            on: vi.fn((_event, fn) => {
                const event = _event;
                if (!listeners[event])
                    listeners[event] = [];
                listeners[event].push(fn);
            }),
            once: vi.fn((_event, fn) => {
                const event = _event;
                if (!listeners[event])
                    listeners[event] = [];
                listeners[event].push(fn);
            }),
            removeAllListeners: vi.fn(),
            ref: vi.fn(),
            unref: vi.fn(),
            connected: true,
            spawnargs: ["python3", "/fake/path/telethon_userbot/main.py"],
            spawnfile: "python3",
        };
        return {
            process: mockProcess,
            emitStdout(data) {
                const stdoutListeners = listeners["stdout-data"];
                if (stdoutListeners) {
                    for (const fn of stdoutListeners) {
                        fn(Buffer.from(data));
                    }
                }
            },
            getStdinData() {
                return stdinData;
            },
            spawnCalls,
        };
    }
    // The currently active mock instance
    let currentMock = null;
    return {
        createMockProcess,
        incrementSpawnCalls,
        getCurrentMock: () => currentMock,
        setCurrentMock: (mock) => {
            currentMock = mock;
        },
        getTotalSpawnCalls: () => totalSpawnCalls,
        resetTotalSpawnCalls: () => {
            totalSpawnCalls = 0;
        },
    };
});
// ---------------------------------------------------------------------------
// Module mock for node:child_process
// ---------------------------------------------------------------------------
vi.mock("node:child_process", () => ({
    spawn: vi.fn((...args) => {
        const fresh = mockSpawnFactory.createMockProcess();
        fresh.spawnCalls.push({ args });
        mockSpawnFactory.setCurrentMock(fresh);
        mockSpawnFactory.incrementSpawnCalls();
        return fresh.process;
    }),
}));
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create a test logger that writes to /dev/null. */
function testLogger() {
    return pino({ level: "silent" }).child({ component: "userbot-bridge-test" });
}
/** Create a minimal valid UserbotBridgeConfig for testing. */
function createBridgeConfig(overrides = {}) {
    return {
        pythonPath: "python3",
        scriptPath: "/fake/path/telethon_userbot/main.py",
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
describe("UserbotBridge", () => {
    let bridge;
    beforeEach(() => {
        mockSpawnFactory.setCurrentMock(null);
        mockSpawnFactory.resetTotalSpawnCalls();
    });
    afterEach(async () => {
        vi.restoreAllMocks();
        if (bridge) {
            try {
                await bridge.stop();
            }
            catch {
                // ignore stop errors in cleanup
            }
        }
        mockSpawnFactory.setCurrentMock(null);
    });
    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------
    describe("construction", () => {
        it("should create bridge with valid configuration", () => {
            bridge = new UserbotBridge(createBridgeConfig());
            expect(bridge).toBeDefined();
            expect(bridge.isRunning()).toBe(false);
        });
        it("should accept custom logger", () => {
            const logger = testLogger();
            bridge = new UserbotBridge(createBridgeConfig({ logger }));
            expect(bridge).toBeDefined();
        });
        it("should expose configuration", () => {
            const config = createBridgeConfig();
            bridge = new UserbotBridge(config);
            const returnedConfig = bridge.getConfig();
            expect(returnedConfig.pythonPath).toBe(config.pythonPath);
            expect(returnedConfig.scriptPath).toBe(config.scriptPath);
            expect(returnedConfig.apiId).toBe(config.apiId);
            expect(returnedConfig.apiHash).toBe(config.apiHash);
            expect(returnedConfig.phone).toBe(config.phone);
            expect(returnedConfig.healthCheckTimeoutMs).toBe(config.healthCheckTimeoutMs);
            expect(returnedConfig.maxRestartAttempts).toBe(config.maxRestartAttempts);
        });
    });
    // -----------------------------------------------------------------------
    // Lifecycle: start / stop
    // -----------------------------------------------------------------------
    describe("lifecycle", () => {
        it("should start and spawn Python process", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            expect(bridge.isRunning()).toBe(true);
            const mock = mockSpawnFactory.getCurrentMock();
            expect(mock).not.toBeNull();
            expect(mock.spawnCalls.length).toBeGreaterThanOrEqual(1);
        });
        it("should pass correct spawn arguments", async () => {
            const config = createBridgeConfig({
                pythonPath: "/usr/bin/python3.11",
                scriptPath: "/opt/osai/telethon_userbot/main.py",
                apiId: 99999,
                apiHash: "secret-hash",
                phone: "+79991112233",
            });
            bridge = new UserbotBridge(config);
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            expect(mock).not.toBeNull();
            // Find the first spawn call with the correct arguments
            const startCall = mock.spawnCalls.find((c) => c.args[0] === "/usr/bin/python3.11");
            expect(startCall).toBeDefined();
            expect(startCall.args[1]).toEqual(["/opt/osai/telethon_userbot/main.py"]);
        });
        it("should stop and kill Python process", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const startMock = mockSpawnFactory.getCurrentMock();
            expect(startMock).not.toBeNull();
            await bridge.stop();
            expect(bridge.isRunning()).toBe(false);
            expect(startMock.process.kill).toHaveBeenCalled();
        });
        it("should throw on start when already started", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            await expect(bridge.start()).rejects.toThrow(UserbotBridgeError);
            await expect(bridge.start()).rejects.toThrow("already running");
        });
        it("should throw on stop when not started", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await expect(bridge.stop()).rejects.toThrow(UserbotBridgeError);
            await expect(bridge.stop()).rejects.toThrow("not running");
        });
        it("should allow start after stop (restart cycle)", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            await bridge.stop();
            await bridge.start();
            expect(bridge.isRunning()).toBe(true);
        });
    });
    // -----------------------------------------------------------------------
    // JSON-over-stdio protocol
    // -----------------------------------------------------------------------
    describe("JSON-over-stdio protocol", () => {
        it("should send BridgeRequest as line-delimited JSON to Python stdin", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            expect(mock).not.toBeNull();
            // Use sendMessage to trigger a request
            const sendPromise = bridge.sendMessage("chat-123", "Hello from osaI");
            // Simulate Python response
            const requestLine = mock.getStdinData();
            expect(requestLine).toContain('"type":"send_message"');
            expect(requestLine).toContain('"params":');
            const parsedRequest = JSON.parse(requestLine.trim());
            expect(parsedRequest.type).toBe("send_message");
            expect(parsedRequest.id).toBeDefined();
            expect(parsedRequest.params).toEqual({
                chatId: "chat-123",
                text: "Hello from osaI",
            });
            // Complete the request with a response
            mock.emitStdout(JSON.stringify({
                type: "send_result",
                id: parsedRequest.id,
                data: { success: true, messageId: 777 },
            }) + "\n");
            const result = await sendPromise;
            expect(result).toEqual({ success: true, messageId: 777 });
        });
        it("should correlate responses by request id", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            expect(mock).not.toBeNull();
            // Send two concurrent requests
            const promise1 = bridge.sendMessage("chat-1", "msg1");
            const promise2 = bridge.getChats();
            // Get the request ids from stdin
            const lines = mock.getStdinData().trim().split("\n");
            expect(lines).toHaveLength(2);
            const req1 = JSON.parse(lines[0]);
            const req2 = JSON.parse(lines[1]);
            // Respond in reverse order
            mock.emitStdout(JSON.stringify({
                type: "send_result",
                id: req2.id,
                data: { chats: [{ id: 1 }] },
            }) + "\n");
            mock.emitStdout(JSON.stringify({
                type: "send_result",
                id: req1.id,
                data: { success: true, messageId: 1 },
            }) + "\n");
            // Each promise should get the correct response
            const result2 = await promise2;
            const result1 = await promise1;
            expect(result2).toEqual({ chats: [{ id: 1 }] });
            expect(result1).toEqual({ success: true, messageId: 1 });
        });
        it("should handle error response type", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            expect(mock).not.toBeNull();
            const sendPromise = bridge.sendMessage("chat-1", "test");
            const requestLine = mock.getStdinData();
            const parsedRequest = JSON.parse(requestLine.trim());
            // Python returns an error response
            mock.emitStdout(JSON.stringify({
                type: "error",
                id: parsedRequest.id,
                data: { message: "Chat not found" },
            }) + "\n");
            await expect(sendPromise).rejects.toThrow(UserbotBridgeError);
            await expect(sendPromise).rejects.toThrow("Chat not found");
        });
    });
    // -----------------------------------------------------------------------
    // Methods: sendMessage, getChats, healthCheck
    // -----------------------------------------------------------------------
    describe("methods", () => {
        it("sendMessage should send correct request and return result", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            const sendPromise = bridge.sendMessage("target-chat", "Hello");
            const req = JSON.parse(mock.getStdinData().trim());
            expect(req.type).toBe("send_message");
            expect(req.params.chatId).toBe("target-chat");
            expect(req.params.text).toBe("Hello");
            mock.emitStdout(JSON.stringify({
                type: "send_result",
                id: req.id,
                data: { success: true, messageId: 42 },
            }) + "\n");
            const result = await sendPromise;
            expect(result).toEqual({ success: true, messageId: 42 });
        });
        it("getChats should send correct request and return chat list", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            const getChatsPromise = bridge.getChats();
            const req = JSON.parse(mock.getStdinData().trim());
            expect(req.type).toBe("get_chats");
            expect(req.params).toEqual({});
            mock.emitStdout(JSON.stringify({
                type: "send_result",
                id: req.id,
                data: {
                    chats: [
                        { id: -1001234567890, title: "Test Group", type: "supergroup" },
                        { id: 123456789, title: "User", type: "user" },
                    ],
                },
            }) + "\n");
            const result = await getChatsPromise;
            expect(result).toEqual({
                chats: [
                    { id: -1001234567890, title: "Test Group", type: "supergroup" },
                    { id: 123456789, title: "User", type: "user" },
                ],
            });
        });
        it("healthCheck should send health request and return status", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            const healthPromise = bridge.healthCheck();
            const req = JSON.parse(mock.getStdinData().trim());
            expect(req.type).toBe("health");
            expect(req.params).toEqual({});
            mock.emitStdout(JSON.stringify({
                type: "health",
                id: req.id,
                data: { status: "ok", uptime: 3600 },
            }) + "\n");
            const result = await healthPromise;
            expect(result).toEqual({ status: "ok", uptime: 3600 });
        });
        it("healthCheck should throw on timeout", async () => {
            bridge = new UserbotBridge(createBridgeConfig({ healthCheckTimeoutMs: 100 }));
            await bridge.start();
            // Start health check but never respond
            const healthPromise = bridge.healthCheck();
            await expect(healthPromise).rejects.toThrow(UserbotBridgeError);
            await expect(healthPromise).rejects.toThrow("Health check timed out");
        });
        it("should throw when calling methods before start", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await expect(bridge.sendMessage("chat-1", "test")).rejects.toThrow(UserbotBridgeError);
            await expect(bridge.sendMessage("chat-1", "test")).rejects.toThrow("not running");
            await expect(bridge.getChats()).rejects.toThrow(UserbotBridgeError);
            await expect(bridge.healthCheck()).rejects.toThrow(UserbotBridgeError);
        });
    });
    // -----------------------------------------------------------------------
    // Message callback (incoming messages from Python)
    // -----------------------------------------------------------------------
    describe("message callback", () => {
        it("should invoke onMessage callback for message type responses", async () => {
            const messages = [];
            bridge = new UserbotBridge(createBridgeConfig({
                onMessage: (msg) => messages.push(msg),
            }));
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            // Simulate incoming message from Python (no matching request)
            mock.emitStdout(JSON.stringify({
                type: "message",
                id: "incoming-001",
                data: {
                    chatId: -1001234567890,
                    senderId: 99999,
                    text: "Hello from Telegram",
                    messageId: 42,
                },
            }) + "\n");
            // Allow event loop to process
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(messages).toHaveLength(1);
            expect(messages[0].type).toBe("message");
            expect(messages[0].data).toEqual({
                chatId: -1001234567890,
                senderId: 99999,
                text: "Hello from Telegram",
                messageId: 42,
            });
        });
        it("should not invoke onMessage for response types (correlated)", async () => {
            const messages = [];
            bridge = new UserbotBridge(createBridgeConfig({
                onMessage: (msg) => messages.push(msg),
            }));
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            // Send a request
            const sendPromise = bridge.sendMessage("chat-1", "test");
            const req = JSON.parse(mock.getStdinData().trim());
            // Response is correlated -- should NOT trigger onMessage
            mock.emitStdout(JSON.stringify({
                type: "send_result",
                id: req.id,
                data: { success: true },
            }) + "\n");
            await sendPromise;
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(messages).toHaveLength(0);
        });
        it("should work without onMessage callback (no error)", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            // Simulate incoming message without callback
            mock.emitStdout(JSON.stringify({
                type: "message",
                id: "incoming-002",
                data: { text: "test" },
            }) + "\n");
            // Should not throw
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
    });
    // -----------------------------------------------------------------------
    // Auto-restart on crash
    // -----------------------------------------------------------------------
    describe("auto-restart", () => {
        it("should auto-restart Python process on crash", async () => {
            bridge = new UserbotBridge(createBridgeConfig({ maxRestartAttempts: 3 }));
            await bridge.start();
            expect(mockSpawnFactory.getTotalSpawnCalls()).toBe(1);
            const mock = mockSpawnFactory.getCurrentMock();
            // Simulate crash -- close event with non-zero exit code
            const closeFn = mock.process.on.mock.calls.find((call) => call[0] === "close")?.[1];
            expect(closeFn).toBeDefined();
            // Trigger crash
            closeFn(1, null);
            // Allow restart to process
            await new Promise((resolve) => setTimeout(resolve, 50));
            // spawn should have been called again (initial + restart)
            expect(mockSpawnFactory.getTotalSpawnCalls()).toBe(2);
            expect(bridge.isRunning()).toBe(true);
        });
        it("should not exceed maxRestartAttempts", async () => {
            bridge = new UserbotBridge(createBridgeConfig({ maxRestartAttempts: 2 }));
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            const closeFn = mock.process.on.mock.calls.find((call) => call[0] === "close")?.[1];
            // Crash multiple times
            for (let i = 0; i < 4; i++) {
                const currentMock = mockSpawnFactory.getCurrentMock();
                const currentCloseFn = currentMock?.process.on.mock.calls.find((call) => call[0] === "close")?.[1];
                if (currentCloseFn)
                    currentCloseFn(1, null);
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            // After exceeding limit, bridge should stop
            expect(bridge.isRunning()).toBe(false);
        });
        it("should reset restart counter after successful operation", async () => {
            bridge = new UserbotBridge(createBridgeConfig({ maxRestartAttempts: 1 }));
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            const closeFn = mock.process.on.mock.calls.find((call) => call[0] === "close")?.[1];
            // First crash triggers restart
            if (closeFn)
                closeFn(1, null);
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(bridge.isRunning()).toBe(true);
            // Complete a health check successfully (resets counter)
            const healthPromise = bridge.healthCheck();
            const currentMock = mockSpawnFactory.getCurrentMock();
            const allStdin = currentMock.getStdinData();
            const lines = allStdin.trim().split("\n");
            const lastLine = lines[lines.length - 1];
            const req = JSON.parse(lastLine);
            currentMock.emitStdout(JSON.stringify({
                type: "health",
                id: req.id,
                data: { status: "ok" },
            }) + "\n");
            await healthPromise;
            // Get the close listener for the new process
            const newProcess = currentMock.process;
            const newCloseFn = newProcess.on.mock.calls.find((call) => call[0] === "close")?.[1];
            // Second crash should still trigger restart (counter was reset)
            if (newCloseFn)
                newCloseFn(1, null);
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(bridge.isRunning()).toBe(true);
        });
    });
    // -----------------------------------------------------------------------
    // Invalid JSON handling
    // -----------------------------------------------------------------------
    describe("invalid JSON handling", () => {
        it("should log invalid JSON from Python without crashing", async () => {
            const logger = pino({ level: "warn" }).child({ component: "userbot-bridge-test" });
            const localWarnSpy = vi.spyOn(logger, "warn");
            bridge = new UserbotBridge(createBridgeConfig({ logger }));
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            // Send invalid JSON
            mock.emitStdout("this is not valid json\n");
            // Allow event loop to process
            await new Promise((resolve) => setTimeout(resolve, 10));
            // Bridge should still be running
            expect(bridge.isRunning()).toBe(true);
            // Should have logged a warning
            expect(localWarnSpy).toHaveBeenCalled();
            const logArg = localWarnSpy.mock.calls[0]?.[0];
            expect(logArg?.rawLine).toBe("this is not valid json");
            localWarnSpy.mockRestore();
        });
        it("should handle partially valid JSON", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            // Send partially valid JSON (missing id field -- will be treated as unknown message)
            mock.emitStdout('{"type":"message"}\n');
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(bridge.isRunning()).toBe(true);
        });
        it("should handle empty lines without crashing", async () => {
            bridge = new UserbotBridge(createBridgeConfig());
            await bridge.start();
            const mock = mockSpawnFactory.getCurrentMock();
            mock.emitStdout("\n\n\n");
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(bridge.isRunning()).toBe(true);
        });
    });
    // -----------------------------------------------------------------------
    // UserbotBridgeError
    // -----------------------------------------------------------------------
    describe("UserbotBridgeError", () => {
        it("should create error with message", () => {
            const err = new UserbotBridgeError("Test error");
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(UserbotBridgeError);
            expect(err.name).toBe("UserbotBridgeError");
            expect(err.message).toBe("Test error");
        });
        it("should create error with cause", () => {
            const cause = new Error("Root cause");
            const err = new UserbotBridgeError("Wrapped error", cause);
            expect(err.message).toBe("Wrapped error");
            expect(err.cause).toBe(cause);
        });
    });
});
//# sourceMappingURL=userbot-bridge.test.js.map