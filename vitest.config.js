import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        globals: true,
        include: ["packages/*/src/**/*.test.ts"],
        coverage: {
            provider: "v8",
            include: ["packages/*/src/**/*.ts"],
            exclude: ["packages/*/src/**/*.test.ts", "packages/*/src/**/index.ts"],
            thresholds: {
                lines: 80,
                branches: 80,
                functions: 80,
            },
        },
        testTimeout: 10000,
    },
});
//# sourceMappingURL=vitest.config.js.map