/**
 * Table formatter tests
 */
import { describe, it, expect } from "vitest";
import { formatTable, formatKeyValueTable } from "../../utils/table.js";
describe("formatTable", () => {
    it("should render empty table when no rows", () => {
        const result = formatTable([{ header: "Name" }, { header: "Value" }], []);
        expect(result).toContain("Name");
        expect(result).toContain("Value");
        expect(result).toContain("---");
    });
    it("should render a single row", () => {
        const result = formatTable([{ header: "Name" }, { header: "Age" }], [{ cells: ["Alice", "30"] }]);
        expect(result).toContain("Alice");
        expect(result).toContain("30");
    });
    it("should render multiple rows", () => {
        const result = formatTable([{ header: "Name" }, { header: "Age" }], [
            { cells: ["Alice", "30"] },
            { cells: ["Bob", "25"] },
        ]);
        expect(result).toContain("Alice");
        expect(result).toContain("Bob");
        expect(result).toContain("30");
        expect(result).toContain("25");
    });
    it("should respect minWidth", () => {
        const result = formatTable([{ header: "ID", minWidth: 10 }], [{ cells: ["1"] }]);
        const lines = result.split("\n");
        // Header should be padded to 10 chars
        expect(lines[0].length).toBeGreaterThanOrEqual(10);
    });
    it("should truncate cells exceeding maxWidth", () => {
        const result = formatTable([{ header: "Name", maxWidth: 8 }], [{ cells: ["VeryLongName"] }]);
        // Should contain truncation marker
        expect(result).toContain("\u2026");
    });
    it("should handle null/undefined cells", () => {
        const result = formatTable([{ header: "A" }, { header: "B" }], [{ cells: [null, undefined] }]);
        expect(result).toContain("A");
        expect(result).toContain("B");
    });
    it("should right-align columns", () => {
        const result = formatTable([
            { header: "Name" },
            { header: "Score", align: "right" },
        ], [{ cells: ["Alice", "100"] }]);
        expect(result).toContain("Alice");
        expect(result).toContain("100");
    });
    it("should end with newline", () => {
        const result = formatTable([{ header: "A" }], [{ cells: ["1"] }]);
        expect(result.endsWith("\n")).toBe(true);
    });
    it("should return empty string for no columns", () => {
        const result = formatTable([], []);
        expect(result).toBe("");
    });
});
describe("formatKeyValueTable", () => {
    it("should format key-value pairs as a two-column table", () => {
        const result = formatKeyValueTable([
            ["key1", "value1"],
            ["key2", "value2"],
        ]);
        expect(result).toContain("Key");
        expect(result).toContain("Value");
        expect(result).toContain("key1");
        expect(result).toContain("value1");
        expect(result).toContain("key2");
        expect(result).toContain("value2");
    });
    it("should handle null values", () => {
        const result = formatKeyValueTable([["key1", null]]);
        expect(result).toContain("key1");
    });
    it("should handle number values", () => {
        const result = formatKeyValueTable([["count", 42]]);
        expect(result).toContain("42");
    });
});
//# sourceMappingURL=table.test.js.map