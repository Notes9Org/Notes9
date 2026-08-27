"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
import { CaretDown, Copy, DownloadSimple, Table as TableIcon } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { PlotlyChart } from "@/components/data-analysis/plotly-chart"
import { fitCurve, curvePoints, confidenceBand, type FitModel, type WeightMode } from "@/lib/data-analysis/curve-fitting"
import {
  curveExportCsv,
  curveExportColumnWidths,
  curveExportFileName,
  curveExportGrid,
  curveExportTsv,
  type CurveExportInput,
} from "@/lib/data-analysis/curve-export"
import type { Table } from "@/components/data-analysis/stats-panel"

const MODELS: { id: FitModel; label: string; hint: string }[] = [
  { id: "4pl", label: "4PL logistic", hint: "ELISA / dose-response" },
  { id: "5pl", label: "5PL logistic", hint: "asymmetric sigmoid" },
  { id: "3pl", label: "3PL (Hill = 1)", hint: "fixed-slope sigmoid" },
  { id: "boltzmann", label: "Boltzmann sigmoid", hint: "V50, slope" },
  { id: "michaelisMenten", label: "Michaelis–Menten", hint: "Vmax, Km" },
  { id: "oneSiteBinding", label: "One-site binding", hint: "Bmax, Kd" },
  { id: "twoSiteBinding", label: "Two-site binding", hint: "two Bmax / Kd" },
  { id: "expDecay", label: "Exponential decay", hint: "one-phase" },
  { id: "expDecay2", label: "Two-phase decay", hint: "fast + slow" },
  { id: "expGrowth", label: "Exponential growth", hint: "Y₀·e^{kx}" },
  { id: "gaussian", label: "Gaussian", hint: "peak fit" },
  { id: "poly2", label: "Quadratic", hint: "2nd-order polynomial" },
  { id: "poly3", label: "Cubic", hint: "3rd-order polynomial" },
  { id: "linear", label: "Linear", hint: "y = m·x + b" },
  { id: "semilog", label: "Semi-log", hint: "y = m·log₁₀(x) + b" },
]

const WEIGHTS: { id: WeightMode; label: string }[] = [
  { id: "none", label: "None" },
  { id: "1/Y", label: "1/Y" },
  { id: "1/Y^2", label: "1/Y²" },
]

const num = (v: number, d = 3) => (isFinite(v) ? v.toFixed(d) : "-")

/**
 * The 95% interval beside the EC₅₀, when the fit produced one.
 *
 * A bare EC₅₀ reads as a measurement when it is an estimate, and for a sigmoid
 * the interval is the informative half — it is asymmetric in concentration
 * (`curve-fitting` back-transforms the log₁₀EC₅₀ interval rather than reporting
 * `v ± t·SE`), so it cannot be inferred from the point estimate.
 */
export const ec50Interval = (fit: { ec50CI?: [number, number] }) =>
  fit.ec50CI && fit.ec50CI.every(isFinite)
    ? ` (95% CI ${num(fit.ec50CI[0], 3)}–${num(fit.ec50CI[1], 3)})`
    : ""

type Row = Record<string, number | string>

/**
 * Full ELISA quantitation:
 *   standards (known conc → signal) → optional blank subtraction → 4PL/5PL fit
 *   → back-calculate every unknown sample (signal → conc × dilution).
 * Rows with a numeric concentration are standards; rows with a blank
 * concentration cell but a signal are unknowns. Replicates at the same
 * concentration are averaged in the standards table (all points feed the fit).
 */
/**
 * The fit, offered to the main chart.
 *
 * The curve used to live only on its own canvas, which meant the sheet's one
 * dose-response was drawn twice, in two tabs, by two renderers, and a
 * researcher comparing them had no way to tell whether a difference was real.
 * The panel now hands the fit out so the Chart tab can draw it over the very
 * points it is fitted to; `concCol`/`signalCol` are exposed so the caller can
 * check the chart is actually plotting those columns before overlaying a curve
 * that would otherwise be a line through unrelated data.
 */
export interface CurveFitLayer {
  concCol: string
  signalCol: string
  /** A fit exists and has something to draw. */
  ready: boolean
  /** The fit wants a log x axis (the panel's own toggle). */
  logX: boolean
  /** Plotly traces: confidence band (when on), the fit line, the unknowns. */
  traces: Record<string, unknown>[]
  /** One-line fit quality, for the chart's own caption. */
  summary: string
}

export interface StandardCurveOptions {
  /** Analysis title, used to name exported files. */
  title?: string
  /**
   * The Chart tab is currently drawing this fit over the sheet's own points.
   *
   * When it is, this panel does not draw it a second time: two pictures of one
   * fit, in two tabs, by two renderers, is the confusion the overlay exists to
   * end. The panel keeps what is genuinely its own — the model and weighting
   * controls, the back-calculated samples, the exports — and says where the
   * picture went. When the chart is NOT showing it (a different pair of columns
   * is plotted), the plot stays here, because the alternative is a researcher
   * with a fitted curve and nowhere to see it.
   */
  overlaidOnChart?: boolean
  /** Bring the Chart tab forward, for the pointer shown in place of the plot. */
  onGoToChart?: () => void
  /**
   * Append the curve to the workbook as a sheet. Supplied by the workspace,
   * which owns the workbook — the panel has the numbers but not the sheet.
   * Omitted, the "Add to sheet" control is not rendered rather than rendered
   * dead.
   */
  onAddToSheet?: (rows: (string | number)[][]) => void
}

export function useStandardCurve(
  table: Table,
  numericCols: string[],
  options: StandardCurveOptions = {}
): { canvas: ReactNode; settings: ReactNode; fitLayer: CurveFitLayer } {
  const [concKey, setConcKey] = useState("")
  const [signalKey, setSignalKey] = useState("")
  const [labelKey, setLabelKey] = useState("")
  const [dilKey, setDilKey] = useState("")
  const [model, setModel] = useState<FitModel>("4pl")
  const [logX, setLogX] = useState(true)
  const [weight, setWeight] = useState<WeightMode>("none")
  const [showBand, setShowBand] = useState(false)
  const [blankMode, setBlankMode] = useState<"none" | "auto" | "manual">("none")
  const [blankManual, setBlankManual] = useState("")
  /**
   * Standards come from the sheet's own columns, and only from there.
   *
   * There used to be a second source -- the plate layout -- which auto-won
   * whenever two wells happened to be marked as standards, so the curve could
   * silently be quantifying from a different set of numbers than the columns
   * named right above it. With the Plate tab gone the layout has nowhere to be
   * authored, and a source that cannot be edited is not a source. One place the
   * standards come from, named on screen.
   */
  const source = "columns" as const

  const concCol = numericCols.includes(concKey) ? concKey : numericCols[0] ?? ""
  const signalCol = numericCols.includes(signalKey) ? signalKey : numericCols[1] ?? numericCols[0] ?? ""

  const numOrNull = (v: number | string | undefined) =>
    typeof v === "number" ? v : v != null && v !== "" && isFinite(Number(v)) ? Number(v) : null

  // Blank value (auto = mean of concentration-0 rows, or mean of blank wells on the plate)
  const blank = useMemo(() => {
    if (blankMode === "manual") return Number(blankManual) || 0
    if (blankMode === "auto") {
      const zeros = table.rows.filter((r) => numOrNull(r[concCol]) === 0).map((r) => Number(r[signalCol])).filter(isFinite)
      return zeros.length ? zeros.reduce((a, b) => a + b, 0) / zeros.length : 0
    }
    return 0
  }, [blankMode, blankManual, table.rows, concCol, signalCol])

  // Standards + unknowns, from the plate layout or the sheet columns.
  const { stdX, stdY, standardsTable, unknowns } = useMemo(() => {
    const stdX: number[] = []
    const stdY: number[] = []
    const byConc = new Map<number, number[]>()
    const unknowns: { label: string; signal: number; dil: number }[] = []
    table.rows.forEach((r: Row, i) => {
      const conc = numOrNull(r[concCol])
      const sigRaw = numOrNull(r[signalCol])
      if (sigRaw == null) return
      const sig = sigRaw - blank
      if (conc != null && conc > 0) {
        stdX.push(conc)
        stdY.push(sig)
        const arr = byConc.get(conc) ?? []
        arr.push(sig)
        byConc.set(conc, arr)
      } else if (conc == null) {
        const label = labelKey && r[labelKey] != null && r[labelKey] !== "" ? String(r[labelKey]) : `Row ${i + 1}`
        const dil = dilKey ? numOrNull(r[dilKey]) ?? 1 : 1
        unknowns.push({ label, signal: sig, dil })
      }
    })
    const standardsTable = [...byConc.entries()].sort((a, b) => a[0] - b[0]).map(([conc, vals]) => ({ conc, mean: vals.reduce((s, v) => s + v, 0) / vals.length, n: vals.length }))
    return { stdX, stdY, standardsTable, unknowns }
  }, [table.rows, concCol, signalCol, labelKey, dilKey, blank])

  const fit = useMemo(() => (stdX.length >= 2 ? fitCurve(model, stdX, stdY, weight) : null), [model, stdX, stdY, weight])

  const results = useMemo(() => {
    if (!fit) return []
    return unknowns.map((u) => {
      const raw = fit.interpolate(u.signal)
      const conc = isFinite(raw) ? raw * u.dil : NaN
      const inRange = isFinite(raw) && raw >= Math.min(...stdX) * 0.9 && raw <= Math.max(...stdX) * 1.1
      return { ...u, conc, inRange }
    })
  }, [fit, unknowns, stdX])

  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model

  /**
   * Everything the export routes need, assembled once.
   *
   * Shared by all four so a copied table, a CSV, a workbook and a sheet tab are
   * the same numbers — the failure this is written to avoid is the one where
   * "Copy" and "Export" quietly disagree because each rebuilt the rows.
   */
  const exportInput = useMemo<CurveExportInput>(
    () => ({
      model,
      modelLabel,
      fit,
      concLabel: concCol,
      signalLabel: signalCol,
      // `blankMode === "none"` is a different statement from "the blank was 0":
      // the export says which one it was.
      blank: blankMode === "none" ? null : blank,
      source,
      standards: standardsTable,
      unknowns: results,
      dilutionApplied: dilKey !== "",
    }),
    [model, modelLabel, fit, concCol, signalCol, blankMode, blank, source, standardsTable, results, dilKey]
  )

  const hasExport = standardsTable.length > 0 || results.length > 0

  const copyCurve = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(curveExportTsv(exportInput))
      toast.success("Standard curve copied")
    } catch {
      toast.error("Couldn't copy to the clipboard")
    }
  }, [exportInput])

  const downloadCurveCsv = useCallback(() => {
    const blob = new Blob([curveExportCsv(exportInput)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = curveExportFileName(options.title ?? "", "csv")
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Standard curve exported")
  }, [exportInput, options.title])

  const downloadCurveXlsx = useCallback(() => {
    const rows = curveExportGrid(exportInput)
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws["!cols"] = curveExportColumnWidths(rows)
    XLSX.utils.book_append_sheet(wb, ws, "Standard curve")
    XLSX.writeFile(wb, curveExportFileName(options.title ?? "", "xlsx"))
    toast.success("Standard curve exported")
  }, [exportInput, options.title])

  const addCurveToSheet = useCallback(() => {
    options.onAddToSheet?.(curveExportGrid(exportInput))
  }, [exportInput, options])

  /**
   * The fit, in the main chart's coordinates.
   *
   * Only the line, the band and the unknowns: the standards themselves are the
   * sheet rows the chart is already drawing, and adding a second copy of them
   * would double every marker.
   */
  const fitLayer = useMemo<CurveFitLayer>(() => {
    const traces: Record<string, unknown>[] = []
    if (fit && stdX.length >= 2) {
      const posX = stdX.filter((v) => v > 0)
      const lo = Math.min(...(logX && posX.length ? posX : stdX))
      const hi = Math.max(...stdX)
      if (showBand) {
        const band = confidenceBand(fit, lo, hi)
        traces.push({ type: "scatter", mode: "lines", x: band.x, y: band.lower, line: { width: 0 }, showlegend: false, hoverinfo: "skip" })
        traces.push({ type: "scatter", mode: "lines", x: band.x, y: band.upper, fill: "tonexty", fillcolor: "rgba(213,94,0,0.13)", line: { width: 0 }, name: "95% CI", hoverinfo: "skip" })
      }
      const pts = curvePoints(fit, lo, hi)
      traces.push({ type: "scatter", mode: "lines", x: pts.x, y: pts.y, name: `${modelLabel} fit`, line: { color: "#D55E00", width: 2.5 } })
      const okResults = results.filter((r) => isFinite(r.signal) && isFinite(fit.interpolate(r.signal)))
      if (okResults.length) {
        traces.push({
          type: "scatter", mode: "markers", name: "Unknowns",
          x: okResults.map((r) => fit.interpolate(r.signal)), y: okResults.map((r) => r.signal),
          marker: { color: "#009E73", size: 8, symbol: "diamond" },
        })
      }
    }
    const summary = fit
      ? `${modelLabel} · R² = ${num(fit.r2, 4)}${fit.ec50 != null ? ` · EC₅₀ ${num(fit.ec50, 3)}${ec50Interval(fit)}` : ""}`
      : ""
    return { concCol, signalCol, ready: traces.length > 0, logX, traces, summary }
  }, [fit, stdX, logX, showBand, results, modelLabel, concCol, signalCol])

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  const ink = isDark ? "#e9e2d7" : "#2c2418"
  const grid = isDark ? "#3a2e24" : "#e8ded3"

  const plot = useMemo(() => {
    const data: Record<string, unknown>[] = [
      { type: "scatter", mode: "markers", x: stdX, y: stdY, name: "Standards", marker: { color: "#0072B2", size: 9 } },
    ]
    if (fit && stdX.length) {
      const posX = stdX.filter((v) => v > 0)
      const lo = Math.min(...(logX && posX.length ? posX : stdX))
      const hi = Math.max(...stdX)
      // 95% confidence band (drawn under the fit line).
      if (showBand) {
        const band = confidenceBand(fit, lo, hi)
        data.push({ type: "scatter", mode: "lines", x: band.x, y: band.lower, line: { width: 0 }, showlegend: false, hoverinfo: "skip" })
        data.push({ type: "scatter", mode: "lines", x: band.x, y: band.upper, fill: "tonexty", fillcolor: "rgba(213,94,0,0.13)", line: { width: 0 }, name: "95% CI", hoverinfo: "skip" })
      }
      const pts = curvePoints(fit, lo, hi)
      data.push({ type: "scatter", mode: "lines", x: pts.x, y: pts.y, name: `${MODELS.find((m) => m.id === model)?.label ?? model} fit`, line: { color: "#D55E00", width: 2.5 } })
    }
    // overlay back-calculated unknowns
    const okResults = results.filter((r) => isFinite(r.conc / (r.dil || 1)))
    if (fit && okResults.length) {
      data.push({
        type: "scatter", mode: "markers", name: "Unknowns",
        x: okResults.map((r) => fit.interpolate(r.signal)), y: okResults.map((r) => r.signal),
        marker: { color: "#009E73", size: 8, symbol: "diamond" },
      })
    }
    return data
  }, [stdX, stdY, fit, model, logX, results, showBand])

  const layout = useMemo<Record<string, unknown>>(() => ({
    margin: { t: 20, r: 16, b: 54, l: 64 },
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "system-ui, sans-serif", color: ink, size: 12 },
    xaxis: { title: { text: concCol || "Concentration" }, type: logX ? "log" : "-", showgrid: true, gridcolor: grid, zeroline: false },
    yaxis: { title: { text: `${signalCol || "Signal"}${blankMode !== "none" ? " − blank" : ""}` }, showgrid: true, gridcolor: grid, zeroline: false },
    showlegend: true, legend: { orientation: "h", y: -0.2 },
  }), [ink, grid, concCol, signalCol, logX, blankMode])

  const canvas = (
    <div className="flex flex-col gap-4">
      <section className="flex min-w-0 flex-col rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold">Standard curve</span>
          {fit && <span className="ml-auto text-[11px] text-muted-foreground">{model.toUpperCase()} · R² = {num(fit.r2, 4)}{fit.ec50 != null ? ` · EC₅₀ ${num(fit.ec50, 3)}${ec50Interval(fit)}` : ""}</span>}
        </div>
        {hasExport && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            {options.onAddToSheet && (
              <Button variant="outline" size="sm" onClick={addCurveToSheet}>
                <TableIcon className="mr-1.5 h-4 w-4" /> Add to sheet
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={copyCurve}>
              <Copy className="mr-1.5 h-4 w-4" /> Copy
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCurveXlsx}>
              <DownloadSimple className="mr-1.5 h-4 w-4" /> Export (.xlsx)
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCurveCsv}>
              <DownloadSimple className="mr-1.5 h-4 w-4" /> Export (.csv)
            </Button>
          </div>
        )}
        <div className="p-2">
          <div className={cn("w-full", options.overlaidOnChart && fit ? "" : "h-[420px]")}>
            {options.overlaidOnChart && fit ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  Drawn on the <span className="font-medium text-foreground">Chart</span> tab.
                </span>
                {options.onGoToChart && (
                  <Button variant="outline" size="sm" onClick={options.onGoToChart}>
                    View
                  </Button>
                )}
              </div>
            ) : stdX.length >= 2 ? (
              <PlotlyChart data={plot} layout={layout} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
                Pick a concentration and a signal column to fit.
              </div>
            )}
          </div>
        </div>
      </section>

      {fit && results.length > 0 && (
        <section className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Back-calculated unknowns</h3>
            <span className="text-xs text-muted-foreground">{results.length} samples{dilKey ? " · dilution-adjusted" : ""}</span>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground/70">
                  <th className="py-2 pr-4 font-semibold">Sample</th>
                  <th className="py-2 pr-4 font-semibold">Signal</th>
                  {dilKey && <th className="py-2 pr-4 font-semibold">Dilution</th>}
                  <th className="py-2 pr-4 font-semibold">Concentration</th>
                  <th className="py-2 pr-4 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-medium">{r.label}</td>
                    <td className="py-2 pr-4 font-mono">{num(r.signal)}</td>
                    {dilKey && <td className="py-2 pr-4 font-mono">{num(r.dil, 0)}×</td>}
                    <td className="py-2 pr-4 font-mono font-semibold">{isFinite(r.conc) ? num(r.conc) : "-"}</td>
                    <td className="py-2 pr-4">
                      {!isFinite(r.conc) ? <Tag tone="muted">no fit</Tag> : r.inRange ? <Tag tone="ok">in range</Tag> : <Tag tone="warn">extrapolated</Tag>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {standardsTable.length > 0 && (
        <section className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm">
          <h3 className="mb-3 text-sm font-semibold">Standards {blankMode !== "none" && <span className="text-xs font-normal text-muted-foreground">(blank {num(blank, 3)} subtracted)</span>}</h3>
          <div className="flex flex-wrap gap-2 font-mono text-xs tabular-nums">
            {standardsTable.map((s) => (
              <div key={s.conc} className="rounded-lg border border-border bg-muted/20 px-2.5 py-1.5">
                <span className="text-muted-foreground">{num(s.conc, 2)}</span> → <span className="font-semibold">{num(s.mean)}</span>
                {s.n > 1 && <span className="text-muted-foreground"> (n={s.n})</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )

  const settings = (
    <div className="space-y-3.5">
      {/*
        How the two columns become standards and unknowns, said out loud.

        This was the confusing part of the ELISA setup, and it was confusing
        because the rule was invisible: pick two columns, and rows silently sort
        themselves into "standard" or "unknown" depending on whether the
        concentration cell happens to be filled. Researchers could not tell why
        eleven of their rows had become unknowns. The rule is one sentence, and
        the counts underneath say what it did to THIS sheet -- so a wrong column
        shows up immediately as "0 standards" instead of as an empty chart.
      */}
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <p className="mb-2.5 text-[11.5px] text-muted-foreground">
          Concentration filled → <span className="font-medium text-foreground">standard</span> · empty →{" "}
          <span className="font-medium text-foreground">unknown</span>
        </p>
        <div className="space-y-2.5">
          <Labeled label="Concentration column">
            <Sel cols={numericCols} value={concCol} onChange={setConcKey} />
          </Labeled>
          <Labeled label="Signal column (OD / RLU / MFI)">
            <Sel cols={numericCols} value={signalCol} onChange={setSignalKey} />
          </Labeled>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 font-medium",
              stdX.length >= 2
                ? "border-border bg-background text-foreground"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            )}
          >
            {stdX.length} standard{stdX.length === 1 ? "" : "s"}
            {stdX.length < 2 && " — need at least 2"}
          </span>
          <span className="rounded-md border border-border bg-background px-1.5 py-0.5 font-medium">
            {unknowns.length} unknown{unknowns.length === 1 ? "" : "s"}
          </span>
          {concCol === signalCol && concCol !== "" && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">
              Same column on both — pick two
            </span>
          )}
        </div>
      </div>

      <Labeled label="Sample label column (optional)">
        <Sel cols={["", ...table.columns]} value={labelKey} onChange={setLabelKey} placeholder="- none -" />
      </Labeled>
      <Labeled label="Dilution factor column (optional)">
        <Sel cols={["", ...numericCols]} value={dilKey} onChange={setDilKey} placeholder="- none -" />
      </Labeled>

      <Labeled label="Blank subtraction">
        <div className="inline-flex w-full rounded-lg border border-border bg-background p-0.5 text-xs">
          {(["none", "auto", "manual"] as const).map((m) => (
            <button key={m} onClick={() => setBlankMode(m)} className={cn("flex-1 rounded-md px-2 py-1 capitalize transition-colors", blankMode === m ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground")}>{m}</button>
          ))}
        </div>
        {blankMode === "auto" && <p className="mt-1.5 text-[11px] text-muted-foreground">Mean signal of rows where concentration = 0 ({num(blank, 3)}).</p>}
        {blankMode === "manual" && <input value={blankManual} onChange={(e) => setBlankManual(e.target.value)} placeholder="blank value" className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-mono" />}
      </Labeled>

      <Labeled label="Fit model">
        <div className="grid grid-cols-1 gap-1.5">
          {MODELS.map((m) => (
            <button key={m.id} onClick={() => setModel(m.id)}
              className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors", model === m.id ? "border-[var(--n9-accent,#965034)]/40 bg-[var(--n9-accent,#965034)]/10" : "border-border hover:bg-muted/40")}>
              <span className="font-medium">{m.label}</span><span className="text-[10px] text-muted-foreground">{m.hint}</span>
            </button>
          ))}
        </div>
      </Labeled>
      <Labeled label="Weighting">
        <div className="inline-flex w-full rounded-lg border border-border bg-background p-0.5 text-xs">
          {WEIGHTS.map((w) => (
            <button key={w.id} onClick={() => setWeight(w.id)}
              className={cn("flex-1 rounded-md px-2 py-1 transition-colors", weight === w.id ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground")}>
              {w.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Relative weighting stabilizes fits when signal variance scales with Y.</p>
      </Labeled>
      <label className="flex cursor-pointer items-center justify-between text-sm text-foreground">
        <span>Log₁₀ X axis</span>
        <Switch checked={logX} onCheckedChange={setLogX} className="data-[state=checked]:bg-[var(--n9-accent,#965034)]" />
      </label>
      <label className="flex cursor-pointer items-center justify-between text-sm text-foreground">
        <span>95% confidence band</span>
        <Switch checked={showBand} onCheckedChange={setShowBand} className="data-[state=checked]:bg-[var(--n9-accent,#965034)]" />
      </label>

      {fit && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
          <div className="mb-1.5 font-semibold uppercase tracking-wide text-muted-foreground/70">Fit parameters (± SE)</div>
          <div className="space-y-1 font-mono tabular-nums">
            {fit.paramNames.map((pn, i) => (
              <div key={pn} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{pn}</span>
                <span className="font-semibold">{num(fit.params[i], 4)}<span className="ml-1 font-normal text-muted-foreground">± {num(fit.paramSE[i], 3)}</span></span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">R² / adj. R²</span><span className="font-semibold">{num(fit.r2, 4)} / {num(fit.adjR2, 4)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sy.x / AICc</span><span className="font-semibold">{num(fit.syx, 3)} / {num(fit.aicc, 1)}</span></div>
          </div>
        </div>
      )}
    </div>
  )

  return { canvas, settings, fitLayer }
}

function Tag({ tone, children }: { tone: "ok" | "warn" | "muted"; children: ReactNode }) {
  const cls = tone === "ok" ? "bg-[var(--n9-accent,#965034)]/12 text-[var(--n9-accent,#965034)]" : tone === "warn" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"
  return <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", cls)}>{children}</span>
}
function Sel({ cols, value, onChange, placeholder }: { cols: string[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-8 text-sm outline-none transition-colors hover:border-border focus:border-[var(--n9-accent,#965034)]/50 focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/20"
      >
        {cols.map((c) => (<option key={c} value={c}>{c === "" ? placeholder ?? "- none -" : c}</option>))}
      </select>
      <CaretDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (<div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>{children}</div>)
}
