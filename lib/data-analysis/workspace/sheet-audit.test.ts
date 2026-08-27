import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { buildSpreadsheetWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import {
  MAX_AUDIT_ENTRIES,
  MAX_CHANGES_PER_ENTRY,
  appendAuditEntry,
  auditEntry,
  auditLogToCsv,
  describeChange,
  diffSnapshots,
  type SheetAuditEntry,
} from "@/lib/data-analysis/workspace/sheet-audit"

const snap = (aoa: (string | number)[][], sheetName = "Sheet1") => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName)
  return buildSpreadsheetWorkbookSnapshot("plate.xlsx", wb)
}

/** Edit one cell of an existing snapshot in place, the way Univer would. */
function editCell(
  snapshot: ReturnType<typeof snap>,
  row: number,
  col: number,
  value: string | number | null
) {
  const clone = JSON.parse(JSON.stringify(snapshot))
  const sheetId = (clone.sheetOrder as string[])[0]
  const sheet = (clone.sheets as Record<string, Record<string, unknown>>)[sheetId]
  const cellData = sheet.cellData as Record<string, Record<string, Record<string, unknown>>>
  cellData[row] = cellData[row] ?? {}
  if (value === null) delete cellData[row][col]
  else cellData[row][col] = { ...(cellData[row][col] ?? {}), v: value }
  return clone
}

const base = snap([
  ["Sample", "OD450"],
  ["S1", 0.42],
  ["S2", 0.61],
])

describe("diffSnapshots", () => {
  it("finds nothing between a snapshot and itself", () => {
    const d = diffSnapshots(base, base)
    expect(d.changeCount).toBe(0)
    expect(d.sheetChanges).toEqual([])
  })

  it("reports an overwritten value with its old value and its cell", () => {
    const after = editCell(base, 1, 1, 0.99)
    const d = diffSnapshots(base, after)
    expect(d.changeCount).toBe(1)
    expect(d.changes[0]).toMatchObject({ sheet: "Sheet1", a1: "B2", before: 0.42, after: 0.99 })
  })

  it("reads a cleared cell as a change to empty, not as no change", () => {
    const d = diffSnapshots(base, editCell(base, 1, 1, null))
    expect(d.changes[0]).toMatchObject({ a1: "B2", before: 0.42, after: null })
  })

  it("reads a filled-in blank as a change from empty", () => {
    const withGap = editCell(base, 2, 1, null)
    const d = diffSnapshots(withGap, base)
    expect(d.changes[0]).toMatchObject({ a1: "B3", before: null, after: 0.61 })
  })

  it("lists changes in row-major order, the way the sheet reads", () => {
    let after = editCell(base, 2, 1, 1.0)
    after = editCell(after, 1, 0, "S9")
    expect(diffSnapshots(base, after).changes.map((c) => c.a1)).toEqual(["A2", "B3"])
  })

  it("does not report a style-only cell as a rewritten value", () => {
    const after = JSON.parse(JSON.stringify(base))
    const sheetId = (after.sheetOrder as string[])[0]
    const cellData = (after.sheets as Record<string, Record<string, unknown>>)[sheetId]
      .cellData as Record<string, Record<string, Record<string, unknown>>>
    cellData[1][1] = { ...cellData[1][1], s: "bold-style-id" }
    expect(diffSnapshots(base, after).changeCount).toBe(0)
  })

  it("names an added sheet", () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Sample", "OD450"], ["S1", 0.42], ["S2", 0.61]]), "Sheet1")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Result"]]), "Statistics")
    const after = buildSpreadsheetWorkbookSnapshot("plate.xlsx", wb)
    const kinds = diffSnapshots(base, after).sheetChanges
    expect(kinds.some((s) => s.kind === "sheet-added" && s.sheet === "Statistics")).toBe(true)
  })

  it("reads a rename as a rename, not as a sheet swap rewriting every cell", () => {
    const after = JSON.parse(JSON.stringify(base))
    const sheetId = (after.sheetOrder as string[])[0]
    ;(after.sheets as Record<string, Record<string, unknown>>)[sheetId].name = "Plate 3"
    const d = diffSnapshots(base, after)
    expect(d.changeCount).toBe(0)
    expect(d.sheetChanges).toEqual([{ kind: "sheet-renamed", sheet: "Plate 3", from: "Sheet1" }])
  })

  it("counts every change but itemises at most the cap", () => {
    const rows: (string | number)[][] = [["A"]]
    for (let i = 0; i < MAX_CHANGES_PER_ENTRY + 25; i++) rows.push([i])
    const before = snap(rows)
    let after = before
    for (let i = 1; i <= MAX_CHANGES_PER_ENTRY + 25; i++) after = editCell(after, i, 0, `x${i}`)
    const d = diffSnapshots(before, after)
    expect(d.changeCount).toBe(MAX_CHANGES_PER_ENTRY + 25)
    expect(d.changes).toHaveLength(MAX_CHANGES_PER_ENTRY)
  })

  it("treats a missing snapshot as nothing rather than throwing", () => {
    expect(diffSnapshots(null, base).sheetChanges[0]?.kind).toBe("sheet-added")
    expect(() => diffSnapshots(null, null)).not.toThrow()
  })
})

describe("auditEntry", () => {
  const common = { boundary: "save" as const, label: "Saved r2", actor: "Vaishnav", at: "2026-08-26T10:00:00.000Z", id: "e1" }

  it("returns nothing when the boundary changed nothing", () => {
    expect(auditEntry({ ...common, before: base, after: base })).toBeNull()
  })

  it("records who, when and under which boundary", () => {
    const entry = auditEntry({ ...common, before: base, after: editCell(base, 1, 1, 0.99) })
    expect(entry).toMatchObject({ actor: "Vaishnav", at: common.at, boundary: "save", label: "Saved r2", changeCount: 1, truncated: false })
  })

  it("flags truncation so the entry never understates what happened", () => {
    const rows: (string | number)[][] = [["A"]]
    for (let i = 0; i < MAX_CHANGES_PER_ENTRY + 5; i++) rows.push([i])
    const before = snap(rows)
    let after = before
    for (let i = 1; i <= MAX_CHANGES_PER_ENTRY + 5; i++) after = editCell(after, i, 0, `x${i}`)
    const entry = auditEntry({ ...common, before, after })
    expect(entry?.truncated).toBe(true)
    expect(entry?.changeCount).toBe(MAX_CHANGES_PER_ENTRY + 5)
  })
})

describe("appendAuditEntry", () => {
  const entry = (id: string): SheetAuditEntry => ({
    id, at: "2026-08-26T10:00:00.000Z", actor: "V", boundary: "save", label: "Saved",
    changeCount: 1, changes: [], truncated: false, sheetChanges: [],
  })

  it("ignores a null entry rather than storing a blank row", () => {
    expect(appendAuditEntry([], null)).toEqual([])
  })

  it("drops the oldest past the cap", () => {
    let log: SheetAuditEntry[] = []
    for (let i = 0; i < MAX_AUDIT_ENTRIES + 3; i++) log = appendAuditEntry(log, entry(`e${i}`))
    expect(log).toHaveLength(MAX_AUDIT_ENTRIES)
    expect(log[0].id).toBe("e3")
  })
})

describe("readable output", () => {
  it("says empty rather than showing a bare arrow", () => {
    expect(describeChange({ sheet: "Sheet1", a1: "B2", row: 1, col: 1, before: null, after: 5 })).toBe("Sheet1!B2: (empty) → 5")
  })

  it("writes a CSV row per change, with the old value kept", () => {
    const entry = auditEntry({
      before: base, after: editCell(base, 1, 1, 0.99),
      boundary: "save", label: "Saved r2", actor: "Vaishnav", at: "2026-08-26T10:00:00.000Z", id: "e1",
    })!
    const csv = auditLogToCsv([entry])
    expect(csv.split("\n")[0]).toBe("When,Who,Boundary,What,Sheet,Cell,Before,After")
    expect(csv).toContain("2026-08-26T10:00:00.000Z,Vaishnav,save,Saved r2,Sheet1,B2,0.42,0.99")
  })

  it("says how many changes it did not itemise", () => {
    const entry: SheetAuditEntry = {
      id: "e1", at: "t", actor: "V", boundary: "save", label: "Saved",
      changeCount: 500, changes: [], truncated: true, sheetChanges: [],
    }
    expect(auditLogToCsv([entry])).toContain("500 further changes not itemised")
  })
})
