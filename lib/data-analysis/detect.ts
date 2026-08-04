/**
 * Lightweight classifier for the active sheet, decides which specialized
 * analysis tabs are relevant so the workspace can surface Standard curve / Plate
 * only when the data actually looks like a dose-response/ELISA or a microplate.
 * Runs on every edit, so it stays cheap (single pass, no allocations per cell).
 */

export type DataKind = {
  /** Plate-shaped (8×12 / 16×24 numeric block, or A–H/A–P row labels). */
  plate: boolean
  plateFormat: 96 | 384 | null
  /** Concentration→signal / serial-dilution → standard curve. */
  standardCurve: boolean
  /** Short human labels for the "Detected:" chip. */
  labels: string[]
}

const CONC_RE = /(conc|dilution|dilut|standard\b|\bstd\b|dose|ng\/?ml|pg\/?ml|µg|ug\/?ml|nmol|µm|nm\b|ng\b|pg\b)/i
const SIGNAL_RE = /(od\b|od[0-9]|abs\b|absorb|rlu|lumin|signal|\bmfi\b|fluor|\bc[qt]\b|reading|intensity)/i

function isNum(v: unknown): boolean {
  return typeof v === "number" || (v != null && v !== "" && isFinite(Number(v)))
}

export function detectDataKind(
  columns: string[],
  rows: Record<string, number | string>[],
  grid: (string | number)[][],
): DataKind {
  const labels: string[] = []

  /* ── Plate ─────────────────────────────────────────────────────────────── */
  // Row-label column (A, B, C … in the first cells of the first rows).
  const firstColLetters = grid
    .slice(0, 16)
    .map((r) => String(r?.[0] ?? "").trim())
    .filter((s) => /^[A-P]$/i.test(s)).length

  // Largest rectangular-ish numeric block.
  let numericRows = 0
  let maxNumericCols = 0
  for (const row of grid) {
    let cnt = 0
    for (const cell of row ?? []) if (isNum(cell)) cnt++
    if (cnt >= 8) {
      numericRows++
      maxNumericCols = Math.max(maxNumericCols, cnt)
    }
  }

  let plate = false
  let plateFormat: 96 | 384 | null = null
  if (firstColLetters >= 6 || (numericRows >= 6 && maxNumericCols >= 10)) {
    plate = true
    plateFormat = numericRows > 8 || maxNumericCols > 12 ? 384 : 96
    labels.push(`${plateFormat}-well plate`)
  }

  /* ── Standard curve / dose-response ────────────────────────────────────── */
  const numericCols = columns.filter((c) => rows.some((r) => typeof r[c] === "number"))
  const hasConc = columns.some((c) => CONC_RE.test(c))
  const hasSignal = columns.some((c) => SIGNAL_RE.test(c))

  // Serial dilution: a numeric column whose sorted-descending consecutive ratios
  // are near-constant (2-, 3-, 10-fold …), the signature of a standard series.
  const serialColumns = numericCols.filter((c) => {
    const vals = rows
      .map((r) => Number(r[c]))
      .filter((v) => isFinite(v) && v > 0)
      .sort((a, b) => b - a)
    if (vals.length < 4) return false
    const ratios: number[] = []
    for (let i = 0; i < vals.length - 1; i++) ratios.push(vals[i] / vals[i + 1])
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    if (mean < 1.5) return false
    const cv = Math.sqrt(ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / ratios.length) / mean
    return cv < 0.18
  })
  const serial = serialColumns.length > 0

  /**
   * A serial dilution and an exponential growth curve look identical to the
   * ratio test: both have near-constant ratios between sorted values. The
   * difference is what the column MEANS, a dilution series is a
   * concentration, so it is never itself the signal. Requiring that the serial
   * column is not signal-named stops an OD600 growth curve being read as a
   * standard series, which is what put a Standard curve tab on every sheet.
   */
  const serialIsConcentration = serial && !serialColumns.every((c) => SIGNAL_RE.test(c))
  const standardCurve = (hasConc && (hasSignal || numericCols.length >= 2)) || serialIsConcentration
  if (standardCurve) labels.push(hasSignal && hasConc ? "ELISA / standard curve" : "dose-response")

  return { plate, plateFormat, standardCurve, labels }
}
