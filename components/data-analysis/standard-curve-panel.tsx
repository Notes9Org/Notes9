"use client"

import { useMemo, useState, type ReactNode } from "react"
import { CaretDown } from "@phosphor-icons/react/ssr"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { PlotlyChart } from "@/components/data-analysis/plotly-chart"
import { fitCurve, curvePoints, confidenceBand, type FitModel, type WeightMode } from "@/lib/data-analysis/curve-fitting"
import type { Table } from "@/components/data-analysis/stats-panel"
import type { PlateModel } from "@/components/data-analysis/plate-view"

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

type Row = Record<string, number | string>

/**
 * Full ELISA quantitation:
 *   standards (known conc → signal) → optional blank subtraction → 4PL/5PL fit
 *   → back-calculate every unknown sample (signal → conc × dilution).
 * Rows with a numeric concentration are standards; rows with a blank
 * concentration cell but a signal are unknowns. Replicates at the same
 * concentration are averaged in the standards table (all points feed the fit).
 */
export function useStandardCurve(table: Table, numericCols: string[], plate: PlateModel): { canvas: ReactNode; settings: ReactNode } {
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
  // Where standards come from: sheet columns, or the shared plate layout.
  // Auto-prefers the plate once ≥2 standards are marked there; the toggle overrides.
  const [sourceOverride, setSourceOverride] = useState<null | "columns" | "plate">(null)
  const plateHasStandards = plate.standards.x.length >= 2
  const source: "columns" | "plate" = sourceOverride ?? (plateHasStandards ? "plate" : "columns")

  const concCol = numericCols.includes(concKey) ? concKey : numericCols[0] ?? ""
  const signalCol = numericCols.includes(signalKey) ? signalKey : numericCols[1] ?? numericCols[0] ?? ""

  const numOrNull = (v: number | string | undefined) =>
    typeof v === "number" ? v : v != null && v !== "" && isFinite(Number(v)) ? Number(v) : null

  // Blank value (auto = mean of concentration-0 rows, or mean of blank wells on the plate)
  const blank = useMemo(() => {
    if (blankMode === "manual") return Number(blankManual) || 0
    if (blankMode === "auto") {
      if (source === "plate") return plate.blank
      const zeros = table.rows.filter((r) => numOrNull(r[concCol]) === 0).map((r) => Number(r[signalCol])).filter(isFinite)
      return zeros.length ? zeros.reduce((a, b) => a + b, 0) / zeros.length : 0
    }
    return 0
  }, [blankMode, blankManual, source, plate.blank, table.rows, concCol, signalCol])

  // Standards + unknowns, from the plate layout or the sheet columns.
  const { stdX, stdY, standardsTable, unknowns } = useMemo(() => {
    if (source === "plate") {
      const stdX = plate.standards.x
      const stdY = plate.standards.y.map((v) => v - blank)
      const standardsTable = stdX.map((c, i) => ({ conc: c, mean: stdY[i], n: 1 }))
      const unknowns = plate.samples.map((s) => ({ label: s.id, signal: s.value - blank, dil: 1 }))
      return { stdX, stdY, standardsTable, unknowns }
    }
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
  }, [source, plate.standards, plate.samples, table.rows, concCol, signalCol, labelKey, dilKey, blank])

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
          {fit && <span className="ml-auto text-[11px] text-muted-foreground">{model.toUpperCase()} · R² = {num(fit.r2, 4)}{fit.ec50 != null ? ` · EC₅₀ ${num(fit.ec50, 3)}` : ""}</span>}
        </div>
        <div className="p-2">
          <div className="h-[420px] w-full">
            {stdX.length >= 2 ? (
              <PlotlyChart data={plot} layout={layout} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
                Pick a concentration column (known standard values) and a signal column. Rows with a concentration become standards; rows with a blank concentration but a signal become unknowns.
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
      <Labeled label="Standards source">
        <div className="inline-flex w-full rounded-lg border border-border bg-background p-0.5 text-xs">
          {(["columns", "plate"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSourceOverride(s)}
              disabled={s === "plate" && !plateHasStandards}
              className={cn(
                "flex-1 rounded-md px-2 py-1 capitalize transition-colors disabled:opacity-40",
                source === s ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "columns" ? "From columns" : "From plate"}
            </button>
          ))}
        </div>
        {source === "plate" ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Using the Plate tab layout, {plate.standards.x.length} standards, {plate.samples.length} sample wells. Mark wells there to change this.
          </p>
        ) : (
          !plateHasStandards && <p className="mt-1.5 text-[11px] text-muted-foreground">Mark ≥2 standards on the Plate tab to source the curve from a plate.</p>
        )}
      </Labeled>

      {source === "columns" && (
        <>
          <Labeled label="Concentration column (standards)"><Sel cols={numericCols} value={concCol} onChange={setConcKey} /></Labeled>
          <Labeled label="Signal column (OD / RLU)"><Sel cols={numericCols} value={signalCol} onChange={setSignalKey} /></Labeled>
          <Labeled label="Sample label column (optional)">
            <Sel cols={["", ...table.columns]} value={labelKey} onChange={setLabelKey} placeholder="- none -" />
          </Labeled>
          <Labeled label="Dilution factor column (optional)">
            <Sel cols={["", ...numericCols]} value={dilKey} onChange={setDilKey} placeholder="- none -" />
          </Labeled>
        </>
      )}

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

  return { canvas, settings }
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
