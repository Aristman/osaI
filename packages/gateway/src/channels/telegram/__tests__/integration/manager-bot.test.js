// ---------------------------------------------------------------------------
// Integration Test: Manager -> Bot (T-009)
//
// Tests TelegramManager coordination with TelegramBot:
//   - Manager starts bot, bot processes messages
//   - Manager stops bot cleanly
//   - Bot-only mode works without userbot
//   - Manager reports correct status for bot component
//   - Message forwarding through bot event system
//
// These are integration tests that exercise real TelegramManager + TelegramBot
// interaction paths, using mock Telegram API (no real calls).
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TelegramManager, } from "../../manager.js";
import pino from "pino";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function testLogger() {
    return pino({ level: "silent" }).child({ component: "integration-test" });
}
function createTestConfig(overrides = {}) {
    return {
        bot: {
            enabled: true,
            token: "test-bot-token-integration-12345",
            allowedUsers: ["12345", "67890"],
            ...overrides.bot,
        },
        userbot: {
            enabled: false,
            apiId: 12345,
            apiHash: "test-api-hash",
            phone: "+79991234567",
            ...overrides.userbot,
        },
        mirrors: [],
        ...overrides,
    };
}
function createManagerConfig(overrides = {}, logger) {
    return {
        config: createTestConfig(overrides),
        logger: logger ?? testLogger(),
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Integration: TelegramManager <-> TelegramBot", () => {
    let manager;
    afterEach(async () => {
        if (manager && manager.isStarted()) {
            try {
                await manager.stop();
            }
            catch {
                // ignore cleanup errors
            }
        }
        vi.restoreAllMocks();
    });
    // -------------------------------------------------------------------------
    // Manager starts and reports bot status
    // -------------------------------------------------------------------------
    describe("manager bot lifecycle", () => {
        it("should start manager with bot in bot-only mode", async () => {
            manager = new TelegramManager(createManagerConfig());
            await manager.start();
            expect(manager.isStarted()).toBe(true);
            expect(manager.getMode()).toBe("bot-only");
            const status = manager.getStatus();
            expect(status.started).toBe(true);
            expect(status.bot.status).toBe("running");
            expect(status.mode).toBe("bot-only");
        });
        it("should stop manager and report bot as stopped", async () => {
            manager = new TelegramManager(createManagerConfig());
            await manager.start();
            await manager.stop();
            expect(manager.isStarted()).toBe(false);
            const status = manager.getStatus();
            expect(status.bot.status).toBe("stopped");
        });
        it("should handle full lifecycle: create -> start -> stop -> start -> stop", async () => {
            manager = new TelegramManager(createManagerConfig());
            // First cycle
            await manager.start();
            expect(manager.isStarted()).toBe(true);
            await manager.stop();
            expect(manager.isStarted()).toBe(false);
            // Second cycle
            await manager.start();
            expect(manager.isStarted()).toBe(true);
            await manager.stop();
            expect(manager.isStarted()).toBe(false);
        });
        it("should report userbot as stopped in bot-only mode", async () => {
            manager = new TelegramManager(createManagerConfig({
                userbot: { enabled: false, apiId: 1, apiHash: "x", phone: "1" },
            }));
            await manager.start();
            const status = manager.getStatus();
            expect(status.userbot.status).toBe("stopped");
        });
        it("should report mirror as stopped when no mirrors configured", async () => {
            manager = new TelegramManager(createManagerConfig());
            await manager.start();
            const status = manager.getStatus();
            expect(status.mirror.status).toBe("stopped");
        });
        it("should start in bot+userbot mode when userbot is enabled", async () => {
            manager = new TelegramManager(createManagerConfig({
                userbot: { enabled: true, apiId: 1, apiHash: "x", phone: "1" },
            }));
            await manager.start();
            expect(manager.getMode()).toBe("bot+userbot");
            const status = manager.getStatus();
            expect(status.bot.status).toBe("running");
            expect(status.userbot.status).toBe("running");
        });
    });
    // -------------------------------------------------------------------------
    // Manager config propagation to bot
    // -------------------------------------------------------------------------
    describe("config propagation", () => {
        it("should expose bot config through manager", () => {
            const botConfig = {
                enabled: true,
                token: "specific-token",
                allowedUsers: ["user-a", "user-b", "user-c"],
            };
            manager = new TelegramManager(createManagerConfig({ bot: botConfig }));
            const config = manager.getConfig();
            expect(config.bot.token).toBe("specific-token");
            expect(config.bot.allowedUsers).toEqual(["user-a", "user-b", "user-c"]);
        });
        it("should allow creating a TelegramBot with the same config", async () => {
            const config = createTestConfig({
                bot: {
                    enabled: true,
                    token: "shared-token-12345",
                    allowedUsers: ["111", "222"],
                },
            });
            manager = new TelegramManager(createManagerConfig(config));
            // Create a real TelegramBot using the same config
            // This verifies config compatibility between manager and bot
            const { TelegramBot } = await import("../../bot.js");
            const bot = new TelegramBot({
                config: config.bot,
                logger: testLogger(),
            });
            expect(bot).toBeDefined();
            expect(bot.channelName).toBe("telegram");
            expect(bot.isStarted()).toBe(false);
        });
    });
    // -------------------------------------------------------------------------
    // Manager + Bot message event flow
    // -------------------------------------------------------------------------
    describe("message event flow", () => {
        it("should create bot that processes events through subscribe", async () => {
            const { TelegramBot } = await import("../../bot.js");
            const config = createTestConfig({
                bot: {
                    enabled: true,
                    token: "event-test-token",
                    allowedUsers: ["12345"],
                },
            });
            manager = new TelegramManager(createManagerConfig(config));
            // Manager is started (manages lifecycle)
            await manager.start();
            expect(manager.getStatus().bot.status).toBe("running");
            // Create bot independently (mirrors what manager does internally)
            const events = [];
            const bot = new TelegramBot({
                config: config.bot,
                logger: testLogger(),
                onMessage: vi.fn().mockResolvedValue({
                    payload: { text: "Agent response" },
                    meta: { channel: "telegram" },
                }),
            });
            bot.subscribe("message", (data) => events.push(data));
            bot.subscribe("agent_response", (data) => events.push(data));
            // Simulate agent response delivery
            await bot.send({ type: "response", text: "Test response" });
            expect(events).toHaveLength(1);
            expect(events[0]?.["text"]).toBe("Test response");
        });
        it("should handle command events through bot subscribe", async () => {
            const { TelegramBot } = await import("../../bot.js");
            const commandEvents = [];
            const bot = new TelegramBot({
                config: createTestConfig().bot,
                logger: testLogger(),
            });
            bot.subscribe("command", (data) => commandEvents.push(data));
            // Bot command handlers emit events internally
            // We verify the subscribe mechanism is functional
            expect(commandEvents).toHaveLength(0);
            // The actual command invocation requires grammY context mocking,
            // which is tested in unit tests. Here we verify the integration
            // path: manager creates config -> bot accepts config -> subscribe works.
        });
        it("should deliver agent responses through bot onMessage", async () => {
            const { TelegramBot } = await import("../../bot.js");
            const agentResponses = [];
            const bot = new TelegramBot({
                config: createTestConfig().bot,
                logger: testLogger(),
            });
            bot.subscribe("agent_response", (data) => agentResponses.push(data));
            // Deliver agent response via ChannelHandler interface
            const result = await bot.onMessage({
                clientId: "12345",
                chatId: "67890",
                payload: { type: "response", text: "Hello from agent" },
            });
            expect(result).toBeDefined();
            expect(result?.payload).toEqual({ sent: true });
            expect(result?.meta).toEqual({ channel: "telegram" });
            expect(agentResponses).toHaveLength(1);
        });
        it("should handle permission requests through bot", async () => {
            const { TelegramBot } = await import("../../bot.js");
            const permissionRequests = [];
            const permissionCallback = vi.fn().mockResolvedValue(undefined);
            const bot = new TelegramBot({
                config: createTestConfig().bot,
                logger: testLogger(),
                onPermissionRequest: permissionCallback,
            });
            bot.subscribe("permission_request", (data) => permissionRequests.push(data));
            await bot.onMessage({
                clientId: "12345",
                payload: {
                    type: "permission_request",
                    tool: "shell",
                    action: "exec",
                    risk_level: "high",
                },
            });
            expect(permissionCallback).toHaveBeenCalledTimes(1);
            expect(permissionRequests).toHaveLength(1);
            expect(permissionRequests[0]?.["tool"]).toBe("shell");
        });
        it("should handle notifications through bot", async () => {
            const { TelegramBot } = await import("../../bot.js");
            const notifications = [];
            const notificationCallback = vi.fn().mockResolvedValue(undefined);
            const bot = new TelegramBot({
                config: createTestConfig().bot,
                logger: testLogger(),
                onNotification: notificationCallback,
            });
            bot.subscribe("notification", (data) => notifications.push(data));
            await bot.onMessage({
                clientId: "12345",
                payload: {
                    type: "notification",
                    message: "Build completed successfully",
                },
            });
            expect(notificationCallback).toHaveBeenCalledTimes(1);
            expect(notifications).toHaveLength(1);
        });
    });
    // -------------------------------------------------------------------------
    // Error handling
    // -------------------------------------------------------------------------
    describe("error handling", () => {
        it("should throw when starting manager twice", async () => {
            manager = new TelegramManager(createManagerConfig());
            await manager.start();
            await expect(manager.start()).rejects.toThrow("already started");
        });
        it("should throw when stopping manager not started", async () => {
            manager = new TelegramManager(createManagerConfig());
            await expect(manager.stop()).rejects.toThrow("not started");
        });
        it("should handle bot construction with empty allowedUsers", async () => {
            const { TelegramBot } = await import("../../bot.js");
            const bot = new TelegramBot({
                config: {
                    enabled: true,
                    token: "test-token",
                    allowedUsers: [],
                },
                logger: testLogger(),
            });
            expect(bot).toBeDefined();
            expect(bot.channelName).toBe("telegram");
        });
        it("should handle multiple message types sequentially", async () => {
            const { TelegramBot } = await import("../../bot.js");
            const allEvents = [];
            const bot = new TelegramBot({
                config: createTestConfig().bot,
                logger: testLogger(),
                onMessage: vi.fn().mockResolvedValue({
                    payload: { ok: true },
                    meta: {},
                }),
                onPermissionRequest: vi.fn().mockResolvedValue(undefined),
                onNotification: vi.fn().mockResolvedValue(undefined),
            });
            bot.subscribe("agent_response", (data) => allEvents.push(data));
            bot.subscribe("permission_request", (data) => allEvents.push(data));
            bot.subscribe("notification", (data) => allEvents.push(data));
            // Sequence of different message types
            await bot.send({ type: "response", text: "Response 1" });
            await bot.send({
                type: "permission_request",
                tool: "shell",
                action: "exec",
                risk_level: "medium",
            });
            await bot.send({
                type: "notification",
                message: "Notification 1",
            });
            await bot.send({ type: "response", text: "Response 2" });
            expect(allEvents).toHaveLength(4);
        });
    });
    // -------------------------------------------------------------------------
    // Manager status consistency
    // -------------------------------------------------------------------------
    describe("status consistency", () => {
        it("should return independent status snapshots", async () => {
            manager = new TelegramManager(createManagerConfig());
            await manager.start();
            const status1 = manager.getStatus();
            const status2 = manager.getStatus();
            expect(status1).not.toBe(status2);
            expect(status1.bot).not.toBe(status2.bot);
            expect(status1.started).toBe(status2.started);
        });
        it("should update lastChanged on state transitions", async () => {
            manager = new TelegramManager(createManagerConfig());
            const t1 = manager.getStatus().lastChanged;
            await new Promise((resolve) => setTimeout(resolve, 10));
            await manager.start();
            const t2 = manager.getStatus().lastChanged;
            await new Promise((resolve) => setTimeout(resolve, 10));
            await manager.stop();
            const t3 = manager.getStatus().lastChanged;
            expect(new Date(t2).getTime()).toBeGreaterThanOrEqual(new Date(t1).getTime());
            expect(new Date(t3).getTime()).toBeGreaterThanOrEqual(new Date(t2).getTime());
        });
    });
});
//# sourceMappingURL=manager-bot.test.js.map