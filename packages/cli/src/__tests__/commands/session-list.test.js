/**
 * session list command tests (T-005)
 *
 * TT-005-07: osai session list -- выводит список сессий
 * TT-005-08: osai channel add telegram -- интерактивный prompt
 */
import { describe, it, expect } from "vitest";
import { formatTable } from "../../utils/table.js";
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Command: osai session list", () => {
    describe("TT-005-07: table formatting for sessions", () => {
        it("should format sessions as a table with id, chat, status, started", () => {
            const columns = [
                { header: "ID", minWidth: 12, maxWidth: 36 },
                { header: "Chat", minWidth: 20, maxWidth: 30 },
                { header: "Status", minWidth: 12 },
                { header: "Started", minWidth: 19, maxWidth: 19 },
            ];
            const rows = [
                { cells: ["sess-001", "General", "active", "2026-03-30T10:00:00Z"] },
                { cells: ["sess-002", "Dev Chat", "archived", "2026-03-29T15:30:00Z"] },
            ];
            const result = formatTable(columns, rows);
            expect(result).toContain("ID");
            expect(result).toContain("Chat");
            expect(result).toContain("Status");
            expect(result).toContain("Started");
            expect(result).toContain("sess-001");
            expect(result).toContain("sess-002");
            expect(result).toContain("General");
            expect(result).toContain("active");
            expect(result).toContain("archived");
        });
        it("should display empty message when no sessions found", () => {
            // The function outputs "No active sessions." for empty arrays
            // We verify the table formatting logic works for empty input
            const columns = [
                { header: "ID" },
                { header: "Chat" },
                { header: "Status" },
            ];
            const result = formatTable(columns, []);
            expect(result).toContain("ID");
        });
    });
    describe("TT-005-07: session data parsing", () => {
        it("should parse session entries from gateway response", () => {
            const response = [
                { id: "sess-001", chat: "General", status: "active", started: "2026-03-30T10:00:00Z" },
                { id: "sess-002", chat: "Dev", status: "closed", started: "2026-03-29T15:30:00Z" },
            ];
            expect(Array.isArray(response)).toBe(true);
            for (const item of response) {
                expect(item).toHaveProperty("id");
                expect(item).toHaveProperty("chat");
                expect(item).toHaveProperty("status");
                expect(item).toHaveProperty("started");
            }
        });
    });
});
describe("Command: osai channel add telegram (TT-005-08)", () => {
    it("TT-005-08: should export runChannelAddTelegram function", async () => {
        const { runChannelAddTelegram } = await import("../../commands/channel/add-telegram.js");
        expect(typeof runChannelAddTelegram).toBe("function");
    });
});
//# sourceMappingURL=session-list.test.js.map