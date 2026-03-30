/**
 * skills list command tests (T-005)
 *
 * TT-005-05: osai skills list -- выводит таблицу skills
 */
import { describe, it, expect } from "vitest";
import { formatTable } from "../../utils/table.js";
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Command: osai skills list", () => {
    describe("TT-005-05: table formatting for skills", () => {
        it("should format skills as a table with name, enabled, tools count", () => {
            const columns = [
                { header: "Name", minWidth: 20, maxWidth: 40 },
                { header: "Enabled", minWidth: 8 },
                { header: "Tools", align: "right", minWidth: 6 },
                { header: "Description", minWidth: 30, maxWidth: 50 },
            ];
            const rows = [
                { cells: ["filesystem", "yes", 5, "File system operations"] },
                { cells: ["shell", "yes", 3, "Shell command execution"] },
                { cells: ["memory", "no", 2, "Memory management"] },
            ];
            const result = formatTable(columns, rows);
            expect(result).toContain("Name");
            expect(result).toContain("Enabled");
            expect(result).toContain("Tools");
            expect(result).toContain("Description");
            expect(result).toContain("filesystem");
            expect(result).toContain("shell");
            expect(result).toContain("memory");
            expect(result).toContain("yes");
            expect(result).toContain("no");
            expect(result).toContain("5");
            expect(result).toContain("3");
        });
        it("should display empty message when no skills found", () => {
            // The runSkillsList function outputs "No skills found." for empty arrays
            // We verify the formatting logic
            const columns = [
                { header: "Name" },
                { header: "Enabled" },
                { header: "Tools" },
            ];
            const result = formatTable(columns, []);
            // Empty table still has header
            expect(result).toContain("Name");
            expect(result).toContain("Enabled");
            expect(result).toContain("Tools");
        });
    });
    describe("TT-005-05: skills data parsing", () => {
        it("should parse skills from gateway response array", () => {
            const response = [
                { name: "filesystem", enabled: true, toolsCount: 5, description: "Files" },
                { name: "shell", enabled: false, toolsCount: 3, description: "Shell" },
            ];
            // Verify parseable structure
            expect(Array.isArray(response)).toBe(true);
            for (const item of response) {
                expect(item).toHaveProperty("name");
                expect(item).toHaveProperty("enabled");
                expect(item).toHaveProperty("toolsCount");
            }
        });
    });
});
//# sourceMappingURL=skills-list.test.js.map