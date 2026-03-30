/**
 * Global test setup -- runs before every test file.
 *
 * Sets environment variables for test isolation,
 * configures default timeouts, and registers cleanup hooks.
 */
import { beforeAll, afterAll, afterEach } from "vitest";
import { cleanupTempDirs } from "./helpers/mock-fs.js";
beforeAll(() => {
    // Ensure test environment variables are set
    process.env.NODE_ENV = "test";
    process.env.OSAI_DATA_DIR = "";
    process.env.OSAI_CONFIG_PATH = "";
    process.env.OSAI_LOG_LEVEL = "silent";
    process.env.OSAI_DISABLE_DAEMON = "true";
});
afterEach(() => {
    // Cleanup temp directories after each test suite
    cleanupTempDirs();
});
afterAll(() => {
    // Final cleanup on test run completion
    cleanupTempDirs();
});
//# sourceMappingURL=setup.js.map