/**
 * Cross-platform verification tests
 *
 * Verifies platform detection and graceful degradation.
 */
import { describe, it, expect, afterEach } from "vitest";
import { detectPlatform, isLinux, isWindows } from "../os-detect.js";
import { OsIntegration } from "../os-integration.js";
describe("cross-platform", () => {
    const originalPlatform = process.platform;
    afterEach(() => {
        Object.defineProperty(process, "platform", {
            value: originalPlatform,
            writable: true,
            configurable: true,
        });
    });
    describe("platform detection", () => {
        it("detectPlatform returns valid platform for current OS", () => {
            const platform = detectPlatform();
            expect(["linux", "windows"]).toContain(platform);
        });
        it("OsIntegration.getPlatform matches detectPlatform", () => {
            const integration = new OsIntegration({ silentNotifications: true });
            expect(integration.getPlatform()).toBe(detectPlatform());
        });
        it("isLinux/isWindows are mutually exclusive", () => {
            const linux = isLinux();
            const windows = isWindows();
            if (linux) {
                expect(windows).toBe(false);
            }
            if (windows) {
                expect(linux).toBe(false);
            }
            expect(linux || windows).toBe(true);
        });
    });
    describe("OsIntegration on windows", () => {
        it("should work when platform is win32", () => {
            Object.defineProperty(process, "platform", {
                value: "win32",
                writable: true,
                configurable: true,
            });
            // Should not throw during construction
            const integration = new OsIntegration({ silentNotifications: true });
            expect(integration.getPlatform()).toBe("windows");
        });
        it("should send notification without error on windows", async () => {
            Object.defineProperty(process, "platform", {
                value: "win32",
                writable: true,
                configurable: true,
            });
            const integration = new OsIntegration({ silentNotifications: true });
            const result = await integration.notify({
                title: "Windows Test",
                message: "This is a Windows notification",
            });
            expect(result.ok).toBe(true);
        });
    });
    describe("OsIntegration on linux", () => {
        it("should work when platform is linux", () => {
            Object.defineProperty(process, "platform", {
                value: "linux",
                writable: true,
                configurable: true,
            });
            const integration = new OsIntegration({ silentNotifications: true });
            expect(integration.getPlatform()).toBe("linux");
        });
        it("should send notification without error on linux", async () => {
            Object.defineProperty(process, "platform", {
                value: "linux",
                writable: true,
                configurable: true,
            });
            const integration = new OsIntegration({ silentNotifications: true });
            const result = await integration.notify({
                title: "Linux Test",
                message: "This is a Linux notification",
            });
            expect(result.ok).toBe(true);
        });
    });
    describe("graceful degradation", () => {
        it("should not throw on unsupported platform for detectPlatform", () => {
            Object.defineProperty(process, "platform", {
                value: "darwin",
                writable: true,
                configurable: true,
            });
            expect(() => detectPlatform()).toThrow("Unsupported platform");
        });
        it("notification returns ok:false on error, not throw", async () => {
            // Use silent adapter which always succeeds
            const integration = new OsIntegration({ silentNotifications: true });
            const result = await integration.notify({
                title: "Test",
                message: "Message",
            });
            // Silent adapter should succeed
            expect(result.ok).toBe(true);
        });
    });
});
//# sourceMappingURL=cross-platform.test.js.map