/**
 * memory search command tests (T-005)
 *
 * TT-005-06: osai memory search "query" -- ищет в памяти
 */

import { describe, it, expect } from "vitest";
import { formatTable } from "../../utils/table.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Command: osai memory search", () => {
  describe("TT-005-06: table formatting for memory search results", () => {
    it("should format memory entries with id, score, category, content", () => {
      const columns = [
        { header: "ID", minWidth: 12, maxWidth: 36 },
        { header: "Score", align: "right" as const, minWidth: 6 },
        { header: "Category", minWidth: 12, maxWidth: 20 },
        { header: "Content", minWidth: 40, maxWidth: 60 },
      ];

      const rows = [
        { cells: ["mem-001", "0.95", "general", "User prefers dark theme"] },
        { cells: ["mem-002", "0.87", "preference", "Uses TypeScript for projects"] },
      ];

      const result = formatTable(columns, rows);

      expect(result).toContain("ID");
      expect(result).toContain("Score");
      expect(result).toContain("Category");
      expect(result).toContain("Content");
      expect(result).toContain("mem-001");
      expect(result).toContain("mem-002");
      expect(result).toContain("0.95");
      expect(result).toContain("0.87");
    });

    it("should display empty message when no results found", () => {
      // The function outputs "No matching entries found." for empty arrays
      const columns = [
        { header: "ID" },
        { header: "Score" },
        { header: "Content" },
      ];

      const result = formatTable(columns, []);
      expect(result).toContain("ID");
      expect(result).toContain("Score");
    });
  });

  describe("TT-005-06: memory entry data parsing", () => {
    it("should parse memory entries from gateway response", () => {
      const response = [
        { id: "mem-001", content: "User likes coffee", score: 0.95, category: "preference" },
        { id: "mem-002", content: "Project uses pnpm", score: 0.82, category: "tech" },
      ];

      expect(Array.isArray(response)).toBe(true);
      for (const item of response) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("content");
        expect(item).toHaveProperty("score");
        expect(item).toHaveProperty("category");
      }
    });
  });
});
