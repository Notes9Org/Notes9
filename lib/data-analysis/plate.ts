/**
 * Microplate model for the data-analysis workbench.
 *
 * Supports 96-well (8×12) and 384-well (16×24) plates. A plate holds a numeric
 * value per well plus an optional role (blank / standard / sample / control)
 * and an annotation (e.g. concentration for standards, dilution for titres).
 * We can parse a plate-shaped block out of the spreadsheet (row labels A–H/P,
 * column labels 1–12/24) and derive standard-curve inputs from it.
 */

export type PlateFormat = 96 | 384

export type WellRole = "empty" | "blank" | "standard" | "sample" | "control"

export type Well = {
  row: number // 0-based
  col: number // 0-based
  id: string // e.g. "A1"
  value: number | null
  role: WellRole
  /** Concentration (standards) or dilution factor (titres) or free label. */
  annotation: number | null
}

export type Plate = {
  format: PlateFormat
  rows: number
  cols: number
  wells: Well[][]
}

export function plateDims(format: PlateFormat): { rows: number; cols: number } {
  return format === 384 ? { rows: 16, cols: 24 } : { rows: 8, cols: 12 }
}

export const rowLabel = (r: number) => {
  // A–Z then AA.. (16 rows max here, so single letters A–P suffice)
  return String.fromCharCode(65 + r)
}

export function wellId(r: number, c: number): string {
  return `${rowLabel(r)}${c + 1}`
}

export function emptyPlate(format: PlateFormat): Plate {
  const { rows, cols } = plateDims(format)
  const wells: Well[][] = []
  for (let r = 0; r < rows; r++) {
    const row: Well[] = []
    for (let c = 0; c < cols; c++) {
      row.push({ row: r, col: c, id: wellId(r, c), value: null, role: "empty", annotation: null })
    }
    wells.push(row)
  }
  return { format, rows, cols, wells }
}

/**
 * Parse a plate from a table of rows. Two accepted shapes:
 *  1. A grid whose first column is row labels (A, B, …) and header is 1..N.
 *  2. A plain numeric grid (rows × cols) matching the plate dimensions.
 * Values that don't fit are left null. Auto-detects 96 vs 384 by shape.
 */
export function parsePlateFromRows(
  columns: string[],
  rows: Record<string, number | string>[],
): Plate | null {
  if (!rows.length) return null

  // Detect row-label column (values like "A","B",…)
  const firstCol = columns[0]
  const looksLabeled =
    firstCol != null &&
    rows.slice(0, 4).every((r) => /^[A-P]$/i.test(String(r[firstCol] ?? "").trim()))

  const dataCols = looksLabeled ? columns.slice(1) : columns
  const nCols = dataCols.length
  const nRows = rows.length

  // Choose the closest plate format that fits
  let format: PlateFormat
  if (nRows > 8 || nCols > 12) format = 384
  else format = 96
  const dims = plateDims(format)

  const plate = emptyPlate(format)
  for (let r = 0; r < Math.min(nRows, dims.rows); r++) {
    for (let c = 0; c < Math.min(nCols, dims.cols); c++) {
      const raw = rows[r][dataCols[c]]
      const v = typeof raw === "number" ? raw : isFinite(Number(raw)) && raw !== "" ? Number(raw) : null
      plate.wells[r][c].value = v
      plate.wells[r][c].role = v == null ? "empty" : "sample"
    }
  }
  return plate
}

/**
 * Build a plate as a live 1:1 mirror of a rectangular block of the spreadsheet.
 * Well (r, c) maps to the raw sheet cell at (originRow + r, originCol + c), so
 * the plate is literally the sheet's layout: row 1 → plate row A, column A →
 * plate column 1. Values are read straight from the grid (source of truth stays
 * the sheet); roles/annotations are layered on top by the caller.
 */
export function plateFromGrid(
  grid: (string | number)[][],
  format: PlateFormat,
  originRow = 0,
  originCol = 0,
): Plate {
  const dims = plateDims(format)
  const plate = emptyPlate(format)
  for (let r = 0; r < dims.rows; r++) {
    for (let c = 0; c < dims.cols; c++) {
      const raw = grid[originRow + r]?.[originCol + c]
      const v = typeof raw === "number" ? raw : raw != null && raw !== "" && isFinite(Number(raw)) ? Number(raw) : null
      plate.wells[r][c].value = v
      plate.wells[r][c].role = v == null ? "empty" : "sample"
    }
  }
  return plate
}

/** All wells flattened, optionally filtered by role. */
export function flatWells(plate: Plate, role?: WellRole): Well[] {
  const out: Well[] = []
  for (const row of plate.wells) for (const w of row) if (!role || w.role === role) out.push(w)
  return out
}

/** Min / max of non-null well values (for heatmap scaling). */
export function plateValueRange(plate: Plate): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const row of plate.wells) {
    for (const w of row) {
      if (w.value != null && isFinite(w.value)) {
        min = Math.min(min, w.value)
        max = Math.max(max, w.value)
      }
    }
  }
  if (!isFinite(min)) return [0, 1]
  return [min, max]
}

/**
 * Build standard-curve inputs (concentration → mean signal) from wells marked
 * `standard` with an annotation (the concentration). Replicates at the same
 * concentration are averaged.
 */
export function standardsFromPlate(plate: Plate): { x: number[]; y: number[] } {
  const byConc = new Map<number, number[]>()
  for (const w of flatWells(plate, "standard")) {
    if (w.annotation == null || w.value == null) continue
    const arr = byConc.get(w.annotation) ?? []
    arr.push(w.value)
    byConc.set(w.annotation, arr)
  }
  const x: number[] = []
  const y: number[] = []
  for (const [conc, vals] of [...byConc.entries()].sort((a, b) => a[0] - b[0])) {
    x.push(conc)
    y.push(vals.reduce((a, b) => a + b, 0) / vals.length)
  }
  return { x, y }
}

export type StandardTemplate = {
  orientation: "col" | "row"
  points: number
  replicates: number
  topConc: number
  fold: number
  blankLane: boolean // reserve the lane after the standards as blanks
}

/**
 * Generate role + concentration overrides for a common standard-curve layout:
 * a serial dilution laid down columns (or across rows) in `replicates` adjacent
 * lanes, concentration halving (or /fold) each step from `topConc`. Wells the
 * template doesn't touch keep their parsed role (samples). Optionally reserves
 * the next lane as blanks.
 */
export function standardTemplateOverrides(
  plate: Plate,
  tpl: StandardTemplate,
): { roles: Record<string, WellRole>; anns: Record<string, number> } {
  const roles: Record<string, WellRole> = {}
  const anns: Record<string, number> = {}
  const points = Math.min(tpl.points, tpl.orientation === "col" ? plate.rows : plate.cols)
  const reps = Math.max(1, tpl.replicates)
  for (let rep = 0; rep < reps; rep++) {
    for (let p = 0; p < points; p++) {
      const conc = tpl.topConc / Math.pow(tpl.fold, p)
      const r = tpl.orientation === "col" ? p : rep
      const c = tpl.orientation === "col" ? rep : p
      if (r >= plate.rows || c >= plate.cols) continue
      const id = wellId(r, c)
      roles[id] = "standard"
      anns[id] = conc
    }
  }
  if (tpl.blankLane) {
    const lane = reps
    const n = tpl.orientation === "col" ? points : points
    for (let p = 0; p < n; p++) {
      const r = tpl.orientation === "col" ? p : lane
      const c = tpl.orientation === "col" ? lane : p
      if (r >= plate.rows || c >= plate.cols) continue
      roles[wellId(r, c)] = "blank"
    }
  }
  return { roles, anns }
}

/** Sample wells and their (mean) signal, for back-interpolation. */
export function samplesFromPlate(plate: Plate): { id: string; value: number }[] {
  return flatWells(plate, "sample")
    .filter((w) => w.value != null)
    .map((w) => ({ id: w.id, value: w.value as number }))
}
