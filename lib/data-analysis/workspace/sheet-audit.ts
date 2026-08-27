/**
 * A history of what changed in the spreadsheet.
 *
 * The analysis had audit everywhere EXCEPT the sheet. An exclusion records who
 * excluded the row, when, and under which reason; a rail edit lands as a typed
 * mutation on the undo stack and shows on the provenance card. A cell typed
 * over in the grid recorded nothing at all: the snapshot simply became the new
 * snapshot, and the value that used to be there was gone. That is the one edit
 * that can change a published number with no trace, which makes it the one that
 * most needs a trail.
 *
 * WHAT THIS IS NOT: a keystroke log. Entries are cut at session boundaries --
 * an attach, a save, a sheet appended by "add to sheet" -- and each is the diff
 * between the sheet as it stood at the previous boundary and as it stands now.
 * So it answers "what changed between these two points, and what were the old
 * values" and does not answer "in what order were these two cells edited".
 * Ordering needs a per-keystroke store; this is the cheaper half, chosen
 * deliberately, and the boundary labels are what make the gap legible rather
 * than silent.
 *
 * Pure: `at` and `actor` are parameters, never reads of the clock or the
 * session, so a fixture produces the same entry on every run.
 */
import { cellAddress } from "@/lib/data-analysis/workspace/bootstrap"
import type { UniverWorkbookSnapshot } from "@/lib/spreadsheet-workbook"

/**
 * Cap on the cell changes stored in ONE entry.
 *
 * Pasting a column into a 10,000-row sheet is one gesture and ten thousand
 * changes; keeping them all would put a multi-megabyte entry in a log that
 * lives in `localStorage` beside the workbook itself. The count is always
 * exact — only the itemised list is cut — so the entry never understates what
 * happened, it just stops listing it.
 */
export const MAX_CHANGES_PER_ENTRY = 200

/** What kind of boundary cut this entry. */
export type AuditBoundary =
  /** A file was attached, or an analysis reopened: the baseline was replaced. */
  | "attach"
  /** The analysis was saved. */
  | "save"
  /** A report sheet was appended by the app, not typed by the user. */
  | "app-sheet"
  /** The researcher asked for the trail to be cut here. */
  | "manual"

export interface CellChange {
  /** Sheet name as it reads on the tab. */
  sheet: string
  /** A1 address, e.g. "C14". */
  a1: string
  row: number
  col: number
  /** Value before. `null` means the cell was empty. */
  before: string | number | null
  /** Value after. `null` means it was cleared. */
  after: string | number | null
}

export interface SheetChange {
  kind: "sheet-added" | "sheet-removed" | "sheet-renamed"
  sheet: string
  /** Previous name, for a rename. */
  from?: string
}

export interface SheetAuditEntry {
  id: string
  /** ISO timestamp, supplied by the caller. */
  at: string
  /** Who was at the keyboard. */
  actor: string
  boundary: AuditBoundary
  /** What the boundary was, in the researcher's terms, e.g. `Saved r3`. */
  label: string
  /** Exact number of changed cells, whether or not they are all listed. */
  changeCount: number
  /** Up to `MAX_CHANGES_PER_ENTRY` of them. */
  changes: CellChange[]
  /** True when `changes` is shorter than `changeCount`. */
  truncated: boolean
  /** Sheets added, removed or renamed between the two snapshots. */
  sheetChanges: SheetChange[]
}

type CellRecord = Record<string, unknown>
type SheetRecord = Record<string, unknown>

/**
 * The value a Univer cell carries.
 *
 * `v` is the raw value. A cell that exists purely to hold styling has no `v`,
 * and must read as empty rather than as a change to `undefined` — otherwise
 * bolding a column reports as having rewritten every value in it.
 */
function cellValue(cell: unknown): string | number | null {
  if (cell == null || typeof cell !== "object") return null
  const v = (cell as CellRecord).v
  if (v == null || v === "") return null
  return typeof v === "number" ? v : String(v)
}

function sheetsOf(snapshot: UniverWorkbookSnapshot | null): Map<string, SheetRecord> {
  const out = new Map<string, SheetRecord>()
  if (!snapshot) return out
  const order = snapshot.sheetOrder as string[] | undefined
  const sheets = snapshot.sheets as Record<string, SheetRecord> | undefined
  if (!sheets) return out
  // Keyed by sheet ID, which is what survives a rename — a rename must read as
  // a rename, not as one sheet vanishing and another appearing with every cell
  // in it freshly written.
  for (const id of order ?? Object.keys(sheets)) {
    const sheet = sheets[id]
    if (sheet) out.set(id, sheet)
  }
  return out
}

const sheetName = (sheet: SheetRecord): string =>
  typeof sheet.name === "string" && sheet.name ? sheet.name : "Sheet"

function cellsOf(sheet: SheetRecord): Map<string, { row: number; col: number; value: string | number | null }> {
  const out = new Map<string, { row: number; col: number; value: string | number | null }>()
  const data = sheet.cellData as Record<string, Record<string, unknown>> | undefined
  if (!data || typeof data !== "object") return out
  for (const rowKey of Object.keys(data)) {
    const row = Number(rowKey)
    if (!Number.isFinite(row)) continue
    const cols = data[rowKey] ?? {}
    for (const colKey of Object.keys(cols)) {
      const col = Number(colKey)
      if (!Number.isFinite(col)) continue
      const value = cellValue(cols[colKey])
      // An empty cell is indistinguishable from an absent one, so it is not
      // stored: otherwise clearing a cell and then deleting it read as two
      // different states of the same nothing.
      if (value === null) continue
      out.set(`${row}:${col}`, { row, col, value })
    }
  }
  return out
}

/**
 * What changed between two snapshots.
 *
 * Compares by sheet ID and then cell by cell, in row-major order so the list a
 * researcher reads runs down the sheet the way their eye does. A cell present
 * in one side and absent in the other is a change to or from empty, which is
 * exactly what deleting a value is.
 */
export function diffSnapshots(
  before: UniverWorkbookSnapshot | null,
  after: UniverWorkbookSnapshot | null
): { changes: CellChange[]; changeCount: number; sheetChanges: SheetChange[] } {
  const beforeSheets = sheetsOf(before)
  const afterSheets = sheetsOf(after)
  const sheetChanges: SheetChange[] = []
  const changes: CellChange[] = []
  let changeCount = 0

  for (const [id, sheet] of afterSheets) {
    if (!beforeSheets.has(id)) sheetChanges.push({ kind: "sheet-added", sheet: sheetName(sheet) })
  }
  for (const [id, sheet] of beforeSheets) {
    if (!afterSheets.has(id)) sheetChanges.push({ kind: "sheet-removed", sheet: sheetName(sheet) })
  }

  for (const [id, afterSheet] of afterSheets) {
    const beforeSheet = beforeSheets.get(id)
    if (!beforeSheet) continue
    const name = sheetName(afterSheet)
    if (sheetName(beforeSheet) !== name) {
      sheetChanges.push({ kind: "sheet-renamed", sheet: name, from: sheetName(beforeSheet) })
    }

    const beforeCells = cellsOf(beforeSheet)
    const afterCells = cellsOf(afterSheet)
    const keys = new Set([...beforeCells.keys(), ...afterCells.keys()])
    const ordered = [...keys].sort((a, b) => {
      const [ar, ac] = a.split(":").map(Number)
      const [br, bc] = b.split(":").map(Number)
      return ar - br || ac - bc
    })

    for (const key of ordered) {
      const was = beforeCells.get(key)?.value ?? null
      const now = afterCells.get(key)?.value ?? null
      if (was === now) continue
      changeCount++
      if (changes.length >= MAX_CHANGES_PER_ENTRY) continue
      const [row, col] = key.split(":").map(Number)
      changes.push({ sheet: name, a1: cellAddress(col, row), row, col, before: was, after: now })
    }
  }

  return { changes, changeCount, sheetChanges }
}

export interface AuditEntryInput {
  before: UniverWorkbookSnapshot | null
  after: UniverWorkbookSnapshot | null
  boundary: AuditBoundary
  label: string
  actor: string
  /** ISO timestamp; a parameter so this stays pure. */
  at: string
  /** Unique within the log; a parameter for the same reason. */
  id: string
}

/**
 * Cut one entry, or nothing.
 *
 * Returns `null` when the two snapshots are identical, so a save that changed
 * no cells does not put an empty row in the history. A boundary is only worth
 * recording if something crossed it.
 */
export function auditEntry(input: AuditEntryInput): SheetAuditEntry | null {
  const { changes, changeCount, sheetChanges } = diffSnapshots(input.before, input.after)
  if (changeCount === 0 && sheetChanges.length === 0) return null
  return {
    id: input.id,
    at: input.at,
    actor: input.actor,
    boundary: input.boundary,
    label: input.label,
    changeCount,
    changes,
    truncated: changes.length < changeCount,
    sheetChanges,
  }
}

/**
 * Cap on entries kept.
 *
 * The log rides along in the session blob in `localStorage`, which has a hard
 * quota the workbook is already the bulk of. Oldest go first.
 */
export const MAX_AUDIT_ENTRIES = 50

export function appendAuditEntry(log: SheetAuditEntry[], entry: SheetAuditEntry | null): SheetAuditEntry[] {
  if (!entry) return log
  const next = [...log, entry]
  return next.length > MAX_AUDIT_ENTRIES ? next.slice(next.length - MAX_AUDIT_ENTRIES) : next
}

/** One change as a line of prose, for the panel and the CSV alike. */
export function describeChange(change: CellChange): string {
  const was = change.before === null ? "(empty)" : String(change.before)
  const now = change.after === null ? "(empty)" : String(change.after)
  return `${change.sheet}!${change.a1}: ${was} → ${now}`
}

/** The whole trail as CSV, so an audit can leave with the data. */
export function auditLogToCsv(log: SheetAuditEntry[]): string {
  const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rows: string[] = ["When,Who,Boundary,What,Sheet,Cell,Before,After"]
  for (const entry of log) {
    for (const sheetChange of entry.sheetChanges) {
      const what =
        sheetChange.kind === "sheet-renamed"
          ? `sheet renamed from ${sheetChange.from}`
          : sheetChange.kind === "sheet-added"
            ? "sheet added"
            : "sheet removed"
      rows.push(
        [entry.at, entry.actor, entry.boundary, entry.label, sheetChange.sheet, "", what, ""]
          .map((v) => quote(String(v)))
          .join(",")
      )
    }
    for (const change of entry.changes) {
      rows.push(
        [
          entry.at,
          entry.actor,
          entry.boundary,
          entry.label,
          change.sheet,
          change.a1,
          change.before === null ? "" : change.before,
          change.after === null ? "" : change.after,
        ]
          .map((v) => quote(String(v)))
          .join(",")
      )
    }
    if (entry.truncated) {
      rows.push(
        [
          entry.at,
          entry.actor,
          entry.boundary,
          entry.label,
          "",
          "",
          `${entry.changeCount - entry.changes.length} further changes not itemised`,
          "",
        ]
          .map((v) => quote(String(v)))
          .join(",")
      )
    }
  }
  return rows.join("\n")
}
