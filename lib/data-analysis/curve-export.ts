/**
 * Taking a standard curve out of the app.
 *
 * The curve panel could fit a 4PL, back-calculate every unknown against it and
 * show both on screen, and there it stopped: no copy, no CSV, no workbook, no
 * "add to sheet" — the four the Statistics panel has had all along. A researcher
 * whose whole reason for running the curve is the concentration column at the
 * end of it had to retype it.
 *
 * One grid feeds all four routes, so the numbers in a pasted table, a CSV, an
 * .xlsx and a sheet tab cannot disagree. It is built as an array-of-arrays
 * rather than per-format strings for the same reason `results-sheet.ts` is:
 * `XLSX.utils.aoa_to_sheet` and a CSV writer both take one, and a second
 * serializer is a second place for a column to go missing.
 *
 * Values are written at full precision, NOT at the 3-decimal display rounding.
 * An export is the input to someone else's arithmetic; rounding here would bake
 * a display decision into their data, and a concentration is exactly the number
 * they are going to divide by something.
 */
import type { CurveFit, FitModel } from "@/lib/data-analysis/curve-fitting"

export type CurveExportRow = (string | number)[]

/** A standard, after any blank subtraction and replicate averaging. */
export interface CurveStandard {
  conc: number
  mean: number
  n: number
}

/** An unknown, after back-calculation through the fit. */
export interface CurveUnknown {
  label: string
  signal: number
  dil: number
  conc: number
  inRange: boolean
}

export interface CurveExportInput {
  model: FitModel
  /** Human name of the model, e.g. "4PL logistic". */
  modelLabel: string
  fit: CurveFit | null
  /** Column (or plate axis) the standards' x values came from. */
  concLabel: string
  /** Column the signal came from. */
  signalLabel: string
  /** The subtracted blank, or null when blank subtraction is off. */
  blank: number | null
  /** Whether standards came from sheet columns or the plate layout. */
  source: "columns" | "plate"
  standards: CurveStandard[]
  unknowns: CurveUnknown[]
  /** True when a dilution column was applied to the unknowns. */
  dilutionApplied: boolean
}

/** `-` rather than `NaN`/`Infinity`, which no spreadsheet reads back as a gap. */
function cell(v: number): string | number {
  return Number.isFinite(v) ? v : "-"
}

/**
 * Why a back-calculated value is or is not usable.
 *
 * Carried as its own column rather than left to the reader, because an
 * extrapolated concentration looks exactly like an interpolated one once it is
 * a number in a spreadsheet — and that is precisely the value nobody should
 * quote without knowing.
 */
function unknownStatus(u: CurveUnknown): string {
  if (!Number.isFinite(u.conc)) return "no fit"
  return u.inRange ? "in range" : "extrapolated"
}

/**
 * The whole curve as one grid: fit, standards, unknowns, in that order.
 *
 * The order is deliberate and matches the panel top-to-bottom, so someone
 * reading the export beside the screen is reading the same document. Blank rows
 * separate the three blocks; `aoa_to_sheet` renders those as genuinely empty
 * rows and a CSV writer as empty lines, which is what a section break looks
 * like in both.
 */
export function curveExportGrid(input: CurveExportInput): CurveExportRow[] {
  const { fit, standards, unknowns } = input
  const rows: CurveExportRow[] = []

  rows.push(["Standard curve"])
  rows.push(["Model", input.modelLabel])
  rows.push(["Concentration", input.concLabel || "(none)"])
  rows.push(["Signal", input.signalLabel || "(none)"])
  rows.push(["Standards from", input.source === "plate" ? "Plate layout" : "Sheet columns"])
  rows.push(["Blank subtracted", input.blank == null ? "no" : cell(input.blank)])

  if (fit) {
    rows.push(["Standards used (n)", fit.n])
    rows.push(["R²", cell(fit.r2)])
    rows.push(["Adjusted R²", cell(fit.adjR2)])
    rows.push(["RMSE", cell(fit.rmse)])
    rows.push(["Sy.x", cell(fit.syx)])
    rows.push(["AICc", cell(fit.aicc)])
    rows.push(["Degrees of freedom", fit.dof])
    if (fit.ec50 != null) {
      const ci = fit.ec50CI
      rows.push(["EC₅₀", cell(fit.ec50), ci ? cell(ci[0]) : "", ci ? cell(ci[1]) : ""])
    }
    rows.push([])
    rows.push(["Parameter", "Estimate", "Std. error", "95% CI lower", "95% CI upper"])
    fit.paramNames.forEach((name, i) => {
      const ci = fit.paramCI[i]
      rows.push([
        name,
        cell(fit.params[i]),
        cell(fit.paramSE[i]),
        ci ? cell(ci[0]) : "-",
        ci ? cell(ci[1]) : "-",
      ])
    })
  } else {
    // Said out loud rather than left as an absent section: an export with no
    // fit block is otherwise indistinguishable from one where the writer forgot.
    rows.push(["Fit", "not fitted — at least 2 standards are needed"])
  }

  if (standards.length > 0) {
    rows.push([])
    rows.push(["Standards"])
    rows.push([input.concLabel || "Concentration", "Mean signal", "Replicates"])
    for (const s of standards) rows.push([cell(s.conc), cell(s.mean), s.n])
  }

  if (unknowns.length > 0) {
    rows.push([])
    rows.push(["Back-calculated unknowns"])
    const header: CurveExportRow = ["Sample", "Signal"]
    if (input.dilutionApplied) header.push("Dilution")
    header.push("Concentration", "Status")
    rows.push(header)
    for (const u of unknowns) {
      const row: CurveExportRow = [u.label, cell(u.signal)]
      if (input.dilutionApplied) row.push(cell(u.dil))
      row.push(cell(u.conc), unknownStatus(u))
      rows.push(row)
    }
  }

  return rows
}

/**
 * Serialize a grid with one delimiter.
 *
 * CSV quoting is applied for the comma variant only. Tab-separated text goes to
 * the clipboard, where a quoted field would paste into Excel as a literal quote
 * — the delimiter cannot occur in these values anyway, since every one of them
 * is a number, a fixed label, or a sample name the user typed into a cell.
 */
function serialize(rows: CurveExportRow[], delimiter: "," | "\t"): string {
  return rows
    .map((row) =>
      row
        .map((v) => {
          const text = typeof v === "number" ? String(v) : v
          if (delimiter === "\t") return text
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
        })
        .join(delimiter)
    )
    .join("\n")
}

export function curveExportCsv(input: CurveExportInput): string {
  return serialize(curveExportGrid(input), ",")
}

/** Tab-separated, for the clipboard: pastes straight into a spreadsheet. */
export function curveExportTsv(input: CurveExportInput): string {
  return serialize(curveExportGrid(input), "\t")
}

/** Column widths for the .xlsx writer, so the label column isn't clipped. */
export function curveExportColumnWidths(rows: CurveExportRow[]): { wch: number }[] {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((v, i) => {
      const len = (typeof v === "number" ? String(v) : v).length
      widths[i] = Math.max(widths[i] ?? 10, Math.min(len + 2, 42))
    })
  }
  return widths.map((wch) => ({ wch }))
}

/** `elisa-plate-3-standard-curve.csv` from an analysis title. */
export function curveExportFileName(title: string, extension: "csv" | "xlsx"): string {
  const base = (title || "analysis")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${base || "analysis"}-standard-curve.${extension}`
}

/** The sheet tab name used by "Add to sheet". */
export const CURVE_SHEET_NAME = "Standard curve"
