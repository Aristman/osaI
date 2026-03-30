/**
 * Tests for notifier factory
 */
import { describe, it, expect } from "vitest";
import { createNotifier } from "../../notifications/factory.js";
describe("createNotifier", () => {
    it("should return a silent adapter when silent: true", async () => {
        const adapter = createNotifier({ silent: true });
        // Silent adapter should succeed immediately
        const result = await new Promise((resolve) => {
            adapter.notify({ title: "T", message: "M" }, (err, _response) => {
                if (err) {
                    resolve({ ok: false, error: err.message });
                }
                else {
                    resolve({ ok: true });
                }
            });
        });
        expect(result).toEqual({ ok: true });
    });
    it("should return a real adapter when silent is not set", () => {
        const adapter = createNotifier();
        // The adapter should have a notify method
        expect(typeof adapter.notify).toBe("function");
    });
});
//# sourceMappingURL=factory.test.js.map