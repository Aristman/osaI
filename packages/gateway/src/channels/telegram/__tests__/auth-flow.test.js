// ---------------------------------------------------------------------------
// AuthFlow Tests (T-005)
//
// Test cases from roadmap T-005:
//   - Interactive auth sequence: phone -> code -> session save
//   - Session persistence in ~/.osai/channels/telegram/session/
//   - Credentials writing to osai.json
//   - Re-auth: session reuse (skip code entry)
//   - Error cases: invalid phone, wrong code, bridge failures
//   - Mock UserbotBridge for isolation
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { AuthFlow, AuthFlowError, } from "../auth-flow.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create a test logger that writes to /dev/null. */
function testLogger() {
    return pino({ level: "silent" }).child({ component: "auth-flow-test" });
}
/** Create a temporary directory for session storage in tests. */
function createTempSessionDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "osai-test-session-"));
    return dir;
}
/** Create a temporary config file for tests. */
function createTempConfigFile(config = {}) {
    const defaultConfig = {
        channels: {
            telegram: {
                bot: { enabled: false, token: "", allowedUsers: [] },
                userbot: { enabled: false, apiId: 0, apiHash: "", phone: "" },
                mirrors: [],
            },
        },
    };
    const merged = { ...defaultConfig, ...config };
    const filePath = path.join(os.tmpdir(), `osai-test-config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
    return filePath;
}
/** Create a default AuthFlowConfig for testing with vi.fn() spies for prompts. */
function createAuthFlowConfig(overrides = {}) {
    const sessionDir = createTempSessionDir();
    const phonePromptFn = vi.fn(async () => "+79991234567");
    const codePromptFn = vi.fn(async () => "12345");
    const passwordPromptFn = vi.fn(async () => "test-password");
    return {
        bridge: {},
        sessionDir,
        configFilePath: createTempConfigFile(),
        logger: testLogger(),
        apiId: 12345,
        apiHash: "test-api-hash",
        phonePrompt: phonePromptFn,
        codePrompt: codePromptFn,
        passwordPrompt: passwordPromptFn,
        ...overrides,
    };
}
/** Clean up temp files and directories. */
function cleanup(sessionDir, configFilePath) {
    try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    catch {
        // ignore
    }
    try {
        fs.unlinkSync(configFilePath);
    }
    catch {
        // ignore
    }
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AuthFlow", () => {
    let sessionDir;
    let configFilePath;
    beforeEach(() => {
        vi.restoreAllMocks();
    });
    afterEach(() => {
        if (sessionDir && configFilePath) {
            cleanup(sessionDir, configFilePath);
        }
    });
    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------
    describe("construction", () => {
        it("should create AuthFlow with valid configuration", () => {
            const authConfig = createAuthFlowConfig();
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            expect(authFlow).toBeDefined();
        });
        it("should expose configuration", () => {
            const authConfig = createAuthFlowConfig();
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            const config = authFlow.getConfig();
            expect(config.sessionDir).toBe(authConfig.sessionDir);
            expect(config.apiId).toBe(12345);
            expect(config.apiHash).toBe("test-api-hash");
            expect(config.maxCodeRetries).toBe(3);
        });
    });
    // -----------------------------------------------------------------------
    // Full auth sequence: phone -> code -> session
    // -----------------------------------------------------------------------
    describe("full auth sequence", () => {
        it("should complete auth: phone -> code -> save credentials", async () => {
            const authConfig = createAuthFlowConfig({
                sendAuthRequest: vi.fn(async (params) => {
                    if (params.action === "send_phone") {
                        return { success: true, status: "code_required" };
                    }
                    if (params.action === "send_code") {
                        return {
                            success: true,
                            status: "authorized",
                            userId: 99999,
                            firstName: "Test",
                            lastName: "User",
                        };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)}`);
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            const result = await authFlow.authenticate();
            expect(result.success).toBe(true);
            expect(result.userId).toBe(99999);
            expect(result.firstName).toBe("Test");
            expect(result.lastName).toBe("User");
            expect(result.reusedSession).toBe(false);
            expect(result.phone).toBe("+79991234567");
            // Phone and code prompts should have been called
            expect(authConfig.phonePrompt).toHaveBeenCalledTimes(1);
            expect(authConfig.codePrompt).toHaveBeenCalledTimes(1);
            // Password prompt should NOT have been called (2FA not needed)
            expect(authConfig.passwordPrompt).not.toHaveBeenCalled();
        });
        it("should save credentials to osai.json", async () => {
            const authConfig = createAuthFlowConfig({
                sendAuthRequest: vi.fn(async (params) => {
                    if (params.action === "send_phone") {
                        return { success: true, status: "code_required" };
                    }
                    if (params.action === "send_code") {
                        return {
                            success: true,
                            status: "authorized",
                            userId: 99999,
                            firstName: "Test",
                            lastName: "User",
                        };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)}`);
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await authFlow.authenticate();
            // Config file should be updated
            const configContent = fs.readFileSync(configFilePath, "utf-8");
            const config = JSON.parse(configContent);
            expect(config.channels).toBeDefined();
            expect(config.channels.telegram).toBeDefined();
            expect(config.channels.telegram.userbot).toBeDefined();
            expect(config.channels.telegram.userbot.enabled).toBe(true);
            expect(config.channels.telegram.userbot.apiId).toBe(12345);
            expect(config.channels.telegram.userbot.apiHash).toBe("test-api-hash");
            expect(config.channels.telegram.userbot.phone).toBe("+79991234567");
        });
    });
    // -----------------------------------------------------------------------
    // 2FA password prompt
    // -----------------------------------------------------------------------
    describe("2FA password flow", () => {
        it("should prompt for 2FA password when required", async () => {
            const authConfig = createAuthFlowConfig({
                sendAuthRequest: vi.fn(async (params) => {
                    if (params.action === "send_phone") {
                        return { success: true, status: "code_required" };
                    }
                    if (params.action === "send_code") {
                        return { success: true, status: "password_required" };
                    }
                    if (params.action === "send_password") {
                        return {
                            success: true,
                            status: "authorized",
                            userId: 88888,
                            firstName: "TwoFA",
                            lastName: "User",
                        };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)}`);
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            const result = await authFlow.authenticate();
            expect(result.success).toBe(true);
            expect(result.userId).toBe(88888);
            expect(authConfig.passwordPrompt).toHaveBeenCalledTimes(1);
            expect(authConfig.passwordPrompt).toHaveBeenCalledWith("Enter 2FA password: ", { password: true });
        });
        it("should throw AuthFlowError on wrong 2FA password", async () => {
            const authConfig = createAuthFlowConfig({
                sendAuthRequest: vi.fn(async (params) => {
                    if (params.action === "send_phone") {
                        return { success: true, status: "code_required" };
                    }
                    if (params.action === "send_code") {
                        return { success: true, status: "password_required" };
                    }
                    if (params.action === "send_password") {
                        return { success: false, status: "error", message: "Wrong password" };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)}`);
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await expect(authFlow.authenticate()).rejects.toThrow(AuthFlowError);
            await expect(authFlow.authenticate()).rejects.toThrow("2FA authentication failed");
        });
    });
    // -----------------------------------------------------------------------
    // Session reuse (re-auth)
    // -----------------------------------------------------------------------
    describe("session reuse", () => {
        it("should reuse existing session without prompting for phone/code", async () => {
            const tempSessionDir = createTempSessionDir();
            // Pre-create a session file
            const sessionFilePath = path.join(tempSessionDir, "session.session");
            fs.writeFileSync(sessionFilePath, "existing-session-data", "utf-8");
            const tempConfigFile = createTempConfigFile({
                channels: {
                    telegram: {
                        userbot: { enabled: false, apiId: 12345, apiHash: "test", phone: "+79991234567" },
                    },
                },
            });
            const authConfig = createAuthFlowConfig({
                sessionDir: tempSessionDir,
                configFilePath: tempConfigFile,
                sendAuthRequest: vi.fn(async (params) => {
                    expect(params.action).toBe("check_session");
                    return {
                        success: true,
                        status: "authorized",
                        userId: 77777,
                        firstName: "Existing",
                        lastName: "Session",
                    };
                }),
            });
            sessionDir = tempSessionDir;
            configFilePath = tempConfigFile;
            const authFlow = new AuthFlow(authConfig);
            const result = await authFlow.authenticate();
            expect(result.success).toBe(true);
            expect(result.reusedSession).toBe(true);
            expect(result.userId).toBe(77777);
            // Phone and code prompts should NOT have been called
            expect(authConfig.phonePrompt).not.toHaveBeenCalled();
            expect(authConfig.codePrompt).not.toHaveBeenCalled();
        });
        it("should fall back to full auth when session is invalid", async () => {
            const tempSessionDir = createTempSessionDir();
            const sessionFilePath = path.join(tempSessionDir, "session.session");
            fs.writeFileSync(sessionFilePath, "expired-session-data", "utf-8");
            const tempConfigFile = createTempConfigFile();
            let callCount = 0;
            const authConfig = createAuthFlowConfig({
                sessionDir: tempSessionDir,
                configFilePath: tempConfigFile,
                sendAuthRequest: vi.fn(async (params) => {
                    callCount += 1;
                    if (callCount === 1) {
                        // First call: check_session
                        expect(params.action).toBe("check_session");
                        return { success: false, status: "session_invalid" };
                    }
                    if (params.action === "send_phone") {
                        return { success: true, status: "code_required" };
                    }
                    if (params.action === "send_code") {
                        return {
                            success: true,
                            status: "authorized",
                            userId: 66666,
                            firstName: "New",
                            lastName: "Auth",
                        };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)} at call ${callCount}`);
                }),
            });
            sessionDir = tempSessionDir;
            configFilePath = tempConfigFile;
            const authFlow = new AuthFlow(authConfig);
            const result = await authFlow.authenticate();
            expect(result.success).toBe(true);
            expect(result.reusedSession).toBe(false);
            // Should have prompted for phone and code
            expect(authConfig.phonePrompt).toHaveBeenCalledTimes(1);
            expect(authConfig.codePrompt).toHaveBeenCalledTimes(1);
        });
    });
    // -----------------------------------------------------------------------
    // Error cases
    // -----------------------------------------------------------------------
    describe("error cases", () => {
        it("should throw AuthFlowError when bridge fails to start", async () => {
            const authConfig = createAuthFlowConfig({
                startBridge: vi.fn(async () => {
                    throw new Error("Python not found");
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await expect(authFlow.authenticate()).rejects.toThrow(AuthFlowError);
            await expect(authFlow.authenticate()).rejects.toThrow("Python not found");
        });
        it("should throw AuthFlowError on invalid phone format (no +)", async () => {
            const authConfig = createAuthFlowConfig({
                phonePrompt: vi.fn(async () => "not-a-phone"),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await expect(authFlow.authenticate()).rejects.toThrow(AuthFlowError);
            await expect(authFlow.authenticate()).rejects.toThrow("Invalid phone number");
        });
        it("should throw AuthFlowError on empty phone", async () => {
            const authConfig = createAuthFlowConfig({
                phonePrompt: vi.fn(async () => ""),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await expect(authFlow.authenticate()).rejects.toThrow(AuthFlowError);
        });
        it("should throw AuthFlowError on phone too short", async () => {
            const authConfig = createAuthFlowConfig({
                phonePrompt: vi.fn(async () => "+1234"),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await expect(authFlow.authenticate()).rejects.toThrow(AuthFlowError);
            await expect(authFlow.authenticate()).rejects.toThrow("too short");
        });
        it("should throw AuthFlowError when phone is rejected by Telegram", async () => {
            const authConfig = createAuthFlowConfig({
                sendAuthRequest: vi.fn(async (params) => {
                    if (params.action === "send_phone") {
                        return { success: false, status: "error", message: "Phone number banned" };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)}`);
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await expect(authFlow.authenticate()).rejects.toThrow(AuthFlowError);
            await expect(authFlow.authenticate()).rejects.toThrow("Phone number banned");
        });
        it("should throw AuthFlowError on wrong code (single attempt, maxRetries=1)", async () => {
            const authConfig = createAuthFlowConfig({
                maxCodeRetries: 1,
                sendAuthRequest: vi.fn(async (params) => {
                    if (params.action === "send_phone") {
                        return { success: true, status: "code_required" };
                    }
                    if (params.action === "send_code") {
                        return { success: false, status: "error", message: "Invalid code" };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)}`);
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await expect(authFlow.authenticate()).rejects.toThrow(AuthFlowError);
            await expect(authFlow.authenticate()).rejects.toThrow("Maximum code verification attempts exceeded");
        });
        it("should retry code entry up to maxRetries times", async () => {
            let codeCallCount = 0;
            const authConfig = createAuthFlowConfig({
                maxCodeRetries: 3,
                sendAuthRequest: vi.fn(async (params) => {
                    if (params.action === "send_phone") {
                        return { success: true, status: "code_required" };
                    }
                    if (params.action === "send_code") {
                        codeCallCount += 1;
                        if (codeCallCount === 1) {
                            // First attempt: wrong code
                            return { success: false, status: "error", message: "Invalid code" };
                        }
                        // Second attempt: success
                        return {
                            success: true,
                            status: "authorized",
                            userId: 55555,
                            firstName: "Retry",
                            lastName: "User",
                        };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)}`);
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            const result = await authFlow.authenticate();
            expect(result.success).toBe(true);
            expect(result.userId).toBe(55555);
            // codePrompt called twice: first attempt (wrong) + retry (success)
            expect(authConfig.codePrompt).toHaveBeenCalledTimes(2);
        });
        it("should throw after max retries exceeded", async () => {
            const authConfig = createAuthFlowConfig({
                maxCodeRetries: 2,
                sendAuthRequest: vi.fn(async (params) => {
                    if (params.action === "send_phone") {
                        return { success: true, status: "code_required" };
                    }
                    if (params.action === "send_code") {
                        return { success: false, status: "error", message: "Invalid code" };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)}`);
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await expect(authFlow.authenticate()).rejects.toThrow(AuthFlowError);
            await expect(authFlow.authenticate()).rejects.toThrow("Maximum code verification attempts exceeded");
        });
    });
    // -----------------------------------------------------------------------
    // AuthFlowResult
    // -----------------------------------------------------------------------
    describe("AuthFlowResult", () => {
        it("should return correct result structure on success", async () => {
            const authConfig = createAuthFlowConfig({
                sendAuthRequest: vi.fn(async (params) => {
                    if (params.action === "send_phone") {
                        return { success: true, status: "code_required" };
                    }
                    if (params.action === "send_code") {
                        return {
                            success: true,
                            status: "authorized",
                            userId: 11111,
                            firstName: "Result",
                            lastName: "Test",
                            username: "result_test",
                        };
                    }
                    throw new Error(`Unexpected action: ${String(params.action)}`);
                }),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            const result = await authFlow.authenticate();
            expect(result.success).toBe(true);
            expect(result.userId).toBe(11111);
            expect(result.firstName).toBe("Result");
            expect(result.lastName).toBe("Test");
            expect(result.username).toBe("result_test");
            expect(result.phone).toBe("+79991234567");
            expect(result.reusedSession).toBe(false);
            expect(result.sessionDir).toBe(authConfig.sessionDir);
        });
    });
    // -----------------------------------------------------------------------
    // AuthFlowError
    // -----------------------------------------------------------------------
    describe("AuthFlowError", () => {
        it("should create error with message", () => {
            const err = new AuthFlowError("Auth failed");
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(AuthFlowError);
            expect(err.name).toBe("AuthFlowError");
            expect(err.message).toBe("Auth failed");
        });
        it("should create error with cause", () => {
            const cause = new Error("Connection refused");
            const err = new AuthFlowError("Bridge connection failed", cause);
            expect(err.message).toBe("Bridge connection failed");
            expect(err.cause).toBe(cause);
        });
    });
    // -----------------------------------------------------------------------
    // Bridge lifecycle
    // -----------------------------------------------------------------------
    describe("bridge lifecycle", () => {
        it("should start bridge before auth and stop after", async () => {
            const tempSessionDir = createTempSessionDir();
            const sessionFilePath = path.join(tempSessionDir, "session.session");
            fs.writeFileSync(sessionFilePath, "existing-session", "utf-8");
            const tempConfigFile = createTempConfigFile({
                channels: {
                    telegram: {
                        userbot: { enabled: false, apiId: 12345, apiHash: "test", phone: "+79991234567" },
                    },
                },
            });
            const startSpy = vi.fn(async () => { });
            const stopSpy = vi.fn(async () => { });
            const authConfig = createAuthFlowConfig({
                sessionDir: tempSessionDir,
                configFilePath: tempConfigFile,
                startBridge: startSpy,
                stopBridge: stopSpy,
                sendAuthRequest: vi.fn(async (params) => {
                    expect(params.action).toBe("check_session");
                    return {
                        success: true,
                        status: "authorized",
                        userId: 33333,
                        firstName: "Lifecycle",
                        lastName: "Test",
                    };
                }),
            });
            sessionDir = tempSessionDir;
            configFilePath = tempConfigFile;
            const authFlow = new AuthFlow(authConfig);
            await authFlow.authenticate();
            expect(startSpy).toHaveBeenCalledTimes(1);
            expect(stopSpy).toHaveBeenCalledTimes(1);
        });
        it("should stop bridge even if auth fails", async () => {
            const startSpy = vi.fn(async () => { });
            const stopSpy = vi.fn(async () => { });
            const authConfig = createAuthFlowConfig({
                startBridge: startSpy,
                stopBridge: stopSpy,
                phonePrompt: vi.fn(async () => "invalid-phone"),
            });
            sessionDir = authConfig.sessionDir;
            configFilePath = authConfig.configFilePath;
            const authFlow = new AuthFlow(authConfig);
            await expect(authFlow.authenticate()).rejects.toThrow();
            expect(startSpy).toHaveBeenCalledTimes(1);
            expect(stopSpy).toHaveBeenCalledTimes(1);
        });
    });
});
//# sourceMappingURL=auth-flow.test.js.map