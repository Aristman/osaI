// ---------------------------------------------------------------------------
// TelegramManager Tests (T-001)
//
// Test cases from roadmap:
//   - TelegramManager lifecycle (start, stop, status)
//   - Configuration validation
//   - Bot-only mode when userbot disabled
//   - Graceful degradation on component failure
//   - Type exports verification
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from "vitest";
import { TelegramManager, TelegramManagerError, } from "../manager.js";
import pino from "pino";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create a test logger that writes to /dev/null. */
function testLogger() {
    return pino({ level: "silent" }).child({ component: "telegram-manager-test" });
}
/** Create a minimal valid TelegramConfig for testing. */
function createTestConfig(overrides = {}) {
    return {
        bot: {
            enabled: true,
            token: "test-bot-token-12345",
            allowedUsers: ["user1", "user2"],
        },
        userbot: {
            enabled: false,
            apiId: 12345,
            apiHash: "test-api-hash",
            phone: "+79991234567",
        },
        mirrors: [],
        ...overrides,
    };
}
/** Create a TelegramManagerConfig for testing. */
function createManagerConfig(overrides = {}, logger) {
    return {
        config: createTestConfig(overrides),
        logger: logger ?? testLogger(),
    };
}
// ---------------------------------------------------------------------------
// Tests: TelegramManager construction
// ---------------------------------------------------------------------------
describe("TelegramManager", () => {
    // -----------------------------------------------------------------------
    // Construction and configuration validation
    // -----------------------------------------------------------------------
    describe("construction", () => {
        it("should create manager with valid configuration", () => {
            const manager = new TelegramManager(createManagerConfig());
            expect(manager).toBeDefined();
            expect(manager.isStarted()).toBe(false);
            expect(manager.getMode()).toBe("bot-only");
        });
        it("should create manager with custom logger", () => {
            const logger = testLogger();
            const manager = new TelegramManager(createManagerConfig({}, logger));
            expect(manager).toBeDefined();
        });
        it("should default to bot-only mode when userbot is disabled", () => {
            const manager = new TelegramManager(createManagerConfig({ userbot: { enabled: false, apiId: 1, apiHash: "x", phone: "1" } }));
            expect(manager.getMode()).toBe("bot-only");
        });
        it("should use bot+userbot mode when userbot is enabled", () => {
            const manager = new TelegramManager(createManagerConfig({
                userbot: { enabled: true, apiId: 1, apiHash: "x", phone: "1" },
            }));
            expect(manager.getMode()).toBe("bot+userbot");
        });
        it("should expose configuration via getConfig", () => {
            const config = createTestConfig();
            const manager = new TelegramManager(createManagerConfig());
            const retrievedConfig = manager.getConfig();
            expect(retrievedConfig.bot.enabled).toBe(config.bot.enabled);
            expect(retrievedConfig.bot.token).toBe(config.bot.token);
            expect(retrievedConfig.userbot.enabled).toBe(config.userbot.enabled);
        });
    });
    // -----------------------------------------------------------------------
    // Initial status
    // -----------------------------------------------------------------------
    describe("initial status", () => {
        it("should report not started", () => {
            const manager = new TelegramManager(createManagerConfig());
            const status = manager.getStatus();
            expect(status.started).toBe(false);
        });
        it("should report all components as stopped initially", () => {
            const manager = new TelegramManager(createManagerConfig());
            const status = manager.getStatus();
            expect(status.bot.status).toBe("stopped");
            expect(status.userbot.status).toBe("stopped");
            expect(status.mirror.status).toBe("stopped");
        });
        it("should report correct mode in initial status", () => {
            const manager = new TelegramManager(createManagerConfig());
            const status = manager.getStatus();
            expect(status.mode).toBe("bot-only");
        });
        it("should include lastChanged timestamp", () => {
            const manager = new TelegramManager(createManagerConfig());
            const status = manager.getStatus();
            expect(status.lastChanged).toBeDefined();
            expect(new Date(status.lastChanged).getTime()).not.toBeNaN();
        });
    });
    // -----------------------------------------------------------------------
    // Lifecycle: start
    // -----------------------------------------------------------------------
    describe("start", () => {
        it("should start successfully with bot-only mode", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            expect(manager.isStarted()).toBe(true);
        });
        it("should report bot as running after start", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            const status = manager.getStatus();
            expect(status.bot.status).toBe("running");
        });
        it("should report userbot as stopped when disabled", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            const status = manager.getStatus();
            expect(status.userbot.status).toBe("stopped");
        });
        it("should not start bot when bot is disabled", async () => {
            const manager = new TelegramManager(createManagerConfig({ bot: { enabled: false, token: "x", allowedUsers: [] } }));
            await manager.start();
            const status = manager.getStatus();
            expect(status.started).toBe(true);
            expect(status.bot.status).toBe("stopped");
        });
        it("should start userbot when enabled (bot+userbot mode)", async () => {
            const manager = new TelegramManager(createManagerConfig({
                userbot: { enabled: true, apiId: 1, apiHash: "x", phone: "1" },
            }));
            await manager.start();
            const status = manager.getStatus();
            expect(status.mode).toBe("bot+userbot");
            expect(status.bot.status).toBe("running");
            expect(status.userbot.status).toBe("running");
        });
        it("should start mirror engine when mirrors are configured", async () => {
            const mirrors = [
                { chatId: "chat-1", telegramChatId: -1001234567890, direction: "both" },
            ];
            const manager = new TelegramManager(createManagerConfig({ mirrors }));
            await manager.start();
            const status = manager.getStatus();
            expect(status.mirror.status).toBe("running");
        });
        it("should not start mirror when no mirrors configured", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            const status = manager.getStatus();
            expect(status.mirror.status).toBe("stopped");
        });
        it("should throw when start is called twice", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            await expect(manager.start()).rejects.toThrow(TelegramManagerError);
            await expect(manager.start()).rejects.toThrow("already started");
        });
    });
    // -----------------------------------------------------------------------
    // Lifecycle: stop
    // -----------------------------------------------------------------------
    describe("stop", () => {
        it("should stop successfully after start", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            await manager.stop();
            expect(manager.isStarted()).toBe(false);
        });
        it("should report all components as stopped after stop", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            await manager.stop();
            const status = manager.getStatus();
            expect(status.bot.status).toBe("stopped");
            expect(status.userbot.status).toBe("stopped");
            expect(status.mirror.status).toBe("stopped");
        });
        it("should stop all running components in bot+userbot mode with mirrors", async () => {
            const mirrors = [
                { chatId: "c1", telegramChatId: -100111, direction: "both" },
            ];
            const manager = new TelegramManager(createManagerConfig({
                userbot: { enabled: true, apiId: 1, apiHash: "x", phone: "1" },
                mirrors,
            }));
            await manager.start();
            const statusRunning = manager.getStatus();
            expect(statusRunning.bot.status).toBe("running");
            expect(statusRunning.userbot.status).toBe("running");
            expect(statusRunning.mirror.status).toBe("running");
            await manager.stop();
            const statusStopped = manager.getStatus();
            expect(statusStopped.bot.status).toBe("stopped");
            expect(statusStopped.userbot.status).toBe("stopped");
            expect(statusStopped.mirror.status).toBe("stopped");
        });
        it("should throw when stop is called without start", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await expect(manager.stop()).rejects.toThrow(TelegramManagerError);
            await expect(manager.stop()).rejects.toThrow("not started");
        });
        it("should allow start after stop (restart cycle)", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            await manager.stop();
            await manager.start();
            expect(manager.isStarted()).toBe(true);
            const status = manager.getStatus();
            expect(status.bot.status).toBe("running");
        });
    });
    // -----------------------------------------------------------------------
    // Bot-only mode (graceful degradation)
    // -----------------------------------------------------------------------
    describe("bot-only mode", () => {
        it("should work in bot-only mode with userbot disabled", async () => {
            const manager = new TelegramManager(createManagerConfig({
                userbot: { enabled: false, apiId: 1, apiHash: "x", phone: "1" },
            }));
            await manager.start();
            expect(manager.getMode()).toBe("bot-only");
            expect(manager.isStarted()).toBe(true);
            const status = manager.getStatus();
            expect(status.bot.status).toBe("running");
            expect(status.userbot.status).toBe("stopped");
        });
        it("should not attempt to start userbot in bot-only mode", async () => {
            const manager = new TelegramManager(createManagerConfig({
                userbot: { enabled: false, apiId: 1, apiHash: "x", phone: "1" },
            }));
            await manager.start();
            const status = manager.getStatus();
            // userbot should remain stopped, never go through starting
            expect(status.userbot.status).toBe("stopped");
        });
        it("should report mode as bot-only in status", async () => {
            const manager = new TelegramManager(createManagerConfig({
                userbot: { enabled: false, apiId: 1, apiHash: "x", phone: "1" },
            }));
            const status = manager.getStatus();
            expect(status.mode).toBe("bot-only");
        });
    });
    // -----------------------------------------------------------------------
    // Status reporting
    // -----------------------------------------------------------------------
    describe("status", () => {
        it("should return complete status object", async () => {
            const manager = new TelegramManager(createManagerConfig());
            const status = manager.getStatus();
            expect(status).toHaveProperty("started");
            expect(status).toHaveProperty("mode");
            expect(status).toHaveProperty("bot");
            expect(status).toHaveProperty("userbot");
            expect(status).toHaveProperty("mirror");
            expect(status).toHaveProperty("lastChanged");
        });
        it("should reflect started state after start", async () => {
            const manager = new TelegramManager(createManagerConfig());
            expect(manager.getStatus().started).toBe(false);
            await manager.start();
            expect(manager.getStatus().started).toBe(true);
        });
        it("should reflect stopped state after stop", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            await manager.stop();
            expect(manager.getStatus().started).toBe(false);
        });
        it("should update lastChanged timestamp on state changes", async () => {
            const manager = new TelegramManager(createManagerConfig());
            const before = manager.getStatus().lastChanged;
            // Small delay to ensure timestamp differs
            await new Promise((resolve) => setTimeout(resolve, 10));
            await manager.start();
            const after = manager.getStatus().lastChanged;
            expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
        });
        it("should return independent copies of status (no mutation leakage)", async () => {
            const manager = new TelegramManager(createManagerConfig());
            await manager.start();
            const status1 = manager.getStatus();
            const status2 = manager.getStatus();
            // Verify they are independent objects
            expect(status1).not.toBe(status2);
            expect(status1.bot).not.toBe(status2.bot);
        });
    });
    // -----------------------------------------------------------------------
    // Type exports (compile-time check)
    // -----------------------------------------------------------------------
    describe("type exports", () => {
        it("BridgeRequest should accept valid request structure", () => {
            const request = {
                type: "auth",
                id: "req-001",
                params: { phone: "+79991234567" },
            };
            expect(request.type).toBe("auth");
            expect(request.id).toBe("req-001");
            expect(request.params).toEqual({ phone: "+79991234567" });
        });
        it("BridgeRequest should accept all request types", () => {
            const types = [
                "auth",
                "send_message",
                "listen",
                "get_chats",
                "health",
            ];
            for (const type of types) {
                const request = { type, id: `test-${type}`, params: {} };
                expect(request.type).toBe(type);
            }
        });
        it("BridgeResponse should accept valid response structure", () => {
            const response = {
                type: "auth_result",
                id: "req-001",
                data: { success: true },
            };
            expect(response.type).toBe("auth_result");
            expect(response.id).toBe("req-001");
            expect(response.data).toEqual({ success: true });
        });
        it("BridgeResponse should accept all response types", () => {
            const types = [
                "auth_result",
                "message",
                "send_result",
                "error",
                "health",
            ];
            for (const type of types) {
                const response = { type, id: `test-${type}`, data: null };
                expect(response.type).toBe(type);
            }
        });
        it("MirrorDirection should accept valid values", () => {
            const directions = ["both", "osai-to-tg", "tg-to-osai"];
            expect(directions).toHaveLength(3);
        });
        it("ComponentStatus should accept valid values", () => {
            const statuses = [
                "stopped",
                "starting",
                "running",
                "stopping",
                "error",
            ];
            expect(statuses).toHaveLength(5);
        });
        it("TelegramManagerMode should accept valid values", () => {
            const modes = ["bot-only", "bot+userbot"];
            expect(modes).toHaveLength(2);
        });
    });
    // -----------------------------------------------------------------------
    // TelegramManagerError
    // -----------------------------------------------------------------------
    describe("TelegramManagerError", () => {
        it("should create error with message", () => {
            const err = new TelegramManagerError("Test error");
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(TelegramManagerError);
            expect(err.name).toBe("TelegramManagerError");
            expect(err.message).toBe("Test error");
            expect(err.cause).toBeUndefined();
        });
        it("should create error with cause", () => {
            const cause = new Error("Root cause");
            const err = new TelegramManagerError("Wrapped error", cause);
            expect(err.message).toBe("Wrapped error");
            expect(err.cause).toBe(cause);
        });
    });
    // -----------------------------------------------------------------------
    // Accessors
    // -----------------------------------------------------------------------
    describe("accessors", () => {
        it("getMode should return consistent mode", () => {
            const manager = new TelegramManager(createManagerConfig({
                userbot: { enabled: true, apiId: 1, apiHash: "x", phone: "1" },
            }));
            expect(manager.getMode()).toBe("bot+userbot");
            // Call again to verify consistency
            expect(manager.getMode()).toBe("bot+userbot");
        });
        it("isStarted should reflect lifecycle state", async () => {
            const manager = new TelegramManager(createManagerConfig());
            expect(manager.isStarted()).toBe(false);
            await manager.start();
            expect(manager.isStarted()).toBe(true);
            await manager.stop();
            expect(manager.isStarted()).toBe(false);
        });
    });
});
//# sourceMappingURL=manager.test.js.map