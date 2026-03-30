/**
 * @osai/cli -- Table Formatter (utility)
 *
 * Simple table formatter for CLI output.
 * Renders columns with auto-calculated widths and padding.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TableColumn {
  /** Column header text */
  header: string;
  /** Minimum column width (default: header length) */
  minWidth?: number;
  /** Maximum column width (0 = no limit, default: 0) */
  maxWidth?: number;
  /** Alignment: "left" (default) or "right" */
  align?: "left" | "right";
}

export interface TableRow {
  /** Keyed cells: key matches column index or column header (lowercase) */
  cells: (string | number | undefined | null)[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Format a table as a string suitable for terminal output.
 *
 * @param columns - Column definitions
 * @param rows - Row data
 * @returns Formatted table string (with trailing newline)
 */
export function formatTable(columns: TableColumn[], rows: TableRow[]): string {
  if (columns.length === 0) {
    return "";
  }

  // Calculate column widths
  const widths = columns.map((col, idx) => {
    let w = String(col.header).length;
    for (const row of rows) {
      const cellVal = row.cells[idx];
      const cellStr = cellVal !== undefined && cellVal !== null ? String(cellVal) : "";
      w = Math.max(w, cellStr.length);
    }
    if (col.minWidth !== undefined) {
      w = Math.max(w, col.minWidth);
    }
    if (col.maxWidth !== undefined && col.maxWidth > 0) {
      w = Math.min(w, col.maxWidth);
    }
    return w;
  });

  const lines: string[] = [];

  // Header
  const headerParts = columns.map((col, idx) => {
    const raw = col.header;
    const padded = padCell(raw, widths[idx]!, col.align ?? "left");
    return truncate(padded, widths[idx]!);
  });
  lines.push(headerParts.join("  "));

  // Separator
  lines.push(widths.map((w) => "-".repeat(w)).join("  "));

  // Rows
  for (const row of rows) {
    const rowParts = columns.map((col, idx) => {
      const cellVal = row.cells[idx];
      const cellStr = cellVal !== undefined && cellVal !== null ? String(cellVal) : "";
      const padded = padCell(cellStr, widths[idx]!, col.align ?? "left");
      return truncate(padded, widths[idx]!);
    });
    lines.push(rowParts.join("  "));
  }

  return lines.join("\n") + "\n";
}

/**
 * Format key-value pairs as a two-column table.
 *
 * @param pairs - Array of [key, value] tuples
 * @returns Formatted table string
 */
export function formatKeyValueTable(
  pairs: [string, string | number | undefined | null][],
): string {
  return formatTable(
    [{ header: "Key", minWidth: 20 }, { header: "Value" }],
    pairs.map(([key, value]) => ({
      cells: [key, value !== undefined && value !== null ? String(value) : ""],
    })),
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function padCell(value: string, width: number, align: "left" | "right"): string {
  if (align === "right") {
    return value.padStart(width);
  }
  return value.padEnd(width);
}

function truncate(value: string, maxWidth: number): string {
  if (value.length <= maxWidth) {
    return value;
  }
  return value.slice(0, maxWidth - 1) + "\u2026";
}
