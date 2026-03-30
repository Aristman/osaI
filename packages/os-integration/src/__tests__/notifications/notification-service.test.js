/**
 * Tests for NotificationService
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService } from "../../notifications/notification-service.js";
function getCallOpts(adapter) {
    return vi.mocked(adapter.notify).mock.calls[0][0];
}
describe("NotificationService", () => {
    let adapter;
    let service;
    beforeEach(() => {
        adapter = {
            notify: vi.fn(),
        };
        service = new NotificationService(adapter);
    });
    const successMock = (_opts, callback) => {
        callback(null, "success");
        return undefined;
    };
    describe("notify", () => {
        it("should call adapter with correct options and resolve on success", async () => {
            vi.mocked(adapter.notify).mockImplementation(successMock);
            const result = await service.notify({
                title: "Test Title",
                message: "Test Message",
            });
            expect(result).toEqual({ ok: true });
            expect(adapter.notify).toHaveBeenCalledTimes(1);
            const callOpts = getCallOpts(adapter);
            expect(callOpts.title).toBe("Test Title");
            expect(callOpts.message).toBe("Test Message");
            expect(callOpts.appID).toBe("osaI");
        });
        it("should pass icon option to adapter", async () => {
            vi.mocked(adapter.notify).mockImplementation(successMock);
            await service.notify({
                title: "Test",
                message: "Msg",
                icon: "/path/to/icon.png",
            });
            const callOpts = getCallOpts(adapter);
            expect(callOpts.icon).toBe("/path/to/icon.png");
        });
        it("should return ok: false on adapter error (graceful degradation)", async () => {
            vi.mocked(adapter.notify).mockImplementation((_opts, callback) => {
                callback(new Error("libnotify not available"), undefined);
                return undefined;
            });
            const result = await service.notify({
                title: "Test",
                message: "Msg",
            });
            expect(result).toEqual({ ok: false, error: "libnotify not available" });
        });
        it("should return ok: false when adapter throws (graceful degradation)", async () => {
            vi.mocked(adapter.notify).mockImplementation(() => {
                throw new Error("Adapter crash");
            });
            const result = await service.notify({
                title: "Test",
                message: "Msg",
            });
            expect(result).toEqual({ ok: false, error: "Adapter crash" });
        });
        it("should use custom appUserModelId when configured", async () => {
            service = new NotificationService(adapter, {
                appUserModelId: "com.custom.app",
            });
            vi.mocked(adapter.notify).mockImplementation(successMock);
            await service.notify({ title: "T", message: "M" });
            const callOpts = getCallOpts(adapter);
            expect(callOpts.appID).toBe("com.custom.app");
        });
        it("should allow overriding appUserModelId per notification", async () => {
            vi.mocked(adapter.notify).mockImplementation(successMock);
            await service.notify({
                title: "T",
                message: "M",
                appUserModelId: "per.notification.app",
            });
            const callOpts = getCallOpts(adapter);
            expect(callOpts.appID).toBe("per.notification.app");
        });
        it("should pass sound option", async () => {
            vi.mocked(adapter.notify).mockImplementation(successMock);
            await service.notify({
                title: "T",
                message: "M",
                sound: "default",
            });
            const callOpts = getCallOpts(adapter);
            expect(callOpts.sound).toBe("default");
        });
        it("should handle non-Error objects in catch", async () => {
            vi.mocked(adapter.notify).mockImplementation(() => {
                throw "string error";
            });
            const result = await service.notify({
                title: "T",
                message: "M",
            });
            expect(result).toEqual({ ok: false, error: "string error" });
        });
    });
});
//# sourceMappingURL=notification-service.test.js.map