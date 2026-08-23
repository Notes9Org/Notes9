/**
 * One cell of the results sheet. Structurally identical to the `Cell` in
 * `render/results-sheet.ts`, which does not export it and which is not mine to
 * edit; `buildResultsSheet`'s return type checks against this at every call site.
 */
type Cell = string | number | null

/**
 * The statistics table as CSV and as Markdown.
 *
 * The requirement is CSV, XLSX and Markdown; only XLSX existed. Both emitters
 * here take the SAME `Cell[][]` that `render/results-sheet.ts` builds for the
 * spreadsheet, so all three formats are the one table rendered three ways.
 * Nothing in this file may compute, round or reorder a value — a number that
 * differs between the .xlsx and the .csv of one analysis is a provenance bug,
 * and the only way to guarantee it cannot happen is for these functions to have
 * no arithmetic in them at all.
 *
 * The sheet is not a rectangle: `buildResultsSheet` emits section headings and
 * blank spacer rows as short rows, and its sub-tables have different widths. So
 * neither emitter may assume row 0 is a header of the full width.
 */

const needsQuote = /[",\r\n]/

/** RFC 4180: quote when the field contains a comma, quote or newline; "" escapes ". */
function csvField(c: Cell): string {
  if (c === null) return ""
  const s = String(c)
  return needsQuote.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * RFC 4180 CSV. Rows are padded to the widest row so every line has the same
 * field count — a ragged CSV is not a CSV, and Excel and pandas disagree about
 * how to repair one.
 */
export function resultsSheetToCsv(rows: Cell[][]): string {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0)
  return rows
    .map((r) => {
      const line = Array.from({ length: width }, (_, i) => csvField(r[i] ?? null))
      // Trailing empties carry no information but do keep the field count honest.
      return line.join(",")
    })
    .join("\r\n")
}

/** `|` and backslash are the only characters that can break a GFM table cell. */
function mdField(c: Cell): string {
  if (c === null) return ""
  return String(c).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
}

/**
 * GitHub-flavoured Markdown.
 *
 * A single GFM table cannot express the sheet's structure — it is a stack of
 * small tables under headings, with blank rows between them. Rendering it as
 * one giant table would put a section title in the first column of a data row
 * and pad every short row with empty cells, which reads as missing data rather
 * than as a heading. So blank rows end the current table, a lone-cell row
 * becomes a `###` heading, and the row after a heading is that table's header.
 */
export function resultsSheetToMarkdown(rows: Cell[][], options: { title?: string } = {}): string {
  const out: string[] = []
  if (options.title) out.push(`# ${options.title}`, "")

  let header: Cell[] | null = null
  const isBlank = (r: Cell[]) => r.every((c) => c === null || String(c).trim() === "")

  for (const row of rows) {
    if (isBlank(row)) {
      // A gap in the sheet is a break between tables, so the next non-blank row
      // is a heading or a fresh header — never a body row of the previous one.
      if (header) out.push("")
      header = null
      continue
    }
    const cells = row.filter((c) => c !== null && String(c).trim() !== "")
    if (!header && cells.length === 1) {
      out.push(`### ${mdField(cells[0])}`, "")
      continue
    }
    if (!header) {
      header = row
      out.push(`| ${row.map(mdField).join(" | ")} |`)
      out.push(`| ${row.map(() => "---").join(" | ")} |`)
      continue
    }
    // Pad or clip to the header's width: GFM ignores extra cells and renders
    // missing ones as empty, but being explicit keeps the source readable.
    const line = Array.from({ length: header.length }, (_, i) => mdField(row[i] ?? null))
    out.push(`| ${line.join(" | ")} |`)
  }

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`
}
