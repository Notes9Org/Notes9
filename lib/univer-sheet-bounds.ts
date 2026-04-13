/**
 * Univer treats `rowCount` / `columnCount` as the worksheet grid bounds.
 * If they match the last used row/column exactly, users cannot insert rows/columns past that edge.
 */

export const SHEET_MIN_ROWS = 10_000
export const SHEET_MIN_COLS = 128
export const SHEET_PAD_ROWS = 500
export const SHEET_PAD_COLS = 52
export const SHEET_MAX_ROWS = 1_048_576
export const SHEET_MAX_COLS = 16_384

export function extentFromCellData(cellData: unknown): { maxR: number; maxC: number } {
  let maxR = -1
  let maxC = -1
  if (!cellData || typeof cellData !== "object") return { maxR, maxC }
  const rows = cellData as Record<string, unknown>
  for (const rk of Object.keys(rows)) {
    const r = Number(rk)
    if (!Number.isFinite(r)) continue
    maxR = Math.max(maxR, r)
    const row = rows[rk]
    if (!row || typeof row !== "object") continue
    for (const ck of Object.keys(row as Record<string, unknown>)) {
      const c = Number(ck)
      if (!Number.isFinite(c)) continue
      maxC = Math.max(maxC, c)
    }
  }
  return { maxR, maxC }
}

/** Merge stored snapshot bounds, used cells + padding, and sensible minimums. */
export function resolveSheetRowCount(storedRowCount: unknown, cellData: unknown): number {
  const stored = Number(storedRowCount)
  const { maxR } = extentFromCellData(cellData)
  const n = Math.max(
    Number.isFinite(stored) && stored > 0 ? stored : 0,
    maxR + 1 + SHEET_PAD_ROWS,
    SHEET_MIN_ROWS
  )
  return Math.min(SHEET_MAX_ROWS, Math.max(1, Math.floor(n)))
}

export function resolveSheetColumnCount(storedColCount: unknown, cellData: unknown): number {
  const stored = Number(storedColCount)
  const { maxC } = extentFromCellData(cellData)
  const n = Math.max(
    Number.isFinite(stored) && stored > 0 ? stored : 0,
    maxC + 1 + SHEET_PAD_COLS,
    SHEET_MIN_COLS
  )
  return Math.min(SHEET_MAX_COLS, Math.max(1, Math.floor(n)))
}

/** From XLSX `decode_range` / `e.r` (0-based inclusive last row index). */
export function resolveSheetRowCountFromRangeEnd(endRowInclusive: number): number {
  return Math.min(SHEET_MAX_ROWS, Math.max(endRowInclusive + 1 + SHEET_PAD_ROWS, SHEET_MIN_ROWS))
}

export function resolveSheetColumnCountFromRangeEnd(endColInclusive: number): number {
  return Math.min(SHEET_MAX_COLS, Math.max(endColInclusive + 1 + SHEET_PAD_COLS, SHEET_MIN_COLS))
}
