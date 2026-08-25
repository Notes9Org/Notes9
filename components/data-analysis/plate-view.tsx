"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import {
  plateFromGrid,
  plateValueRange,
  standardsFromPlate,
  samplesFromPlate,
  standardTemplateOverrides,
  flatWells,
  rowLabel,
  type Plate,
  type PlateFormat,
  type WellRole,
} from "@/lib/data-analysis/plate"
import { fitCurve } from "@/lib/data-analysis/curve-fitting"

const ROLE_COLORS: Record<WellRole, string> = {
  empty: "transparent",
  blank: "#94a3b8",
  standard: "#0072B2",
  sample: "#009E73",
  control: "#CC79A7",
}

const ROLES: { id: WellRole; label: string }[] = [
  { id: "sample", label: "Sample" },
  { id: "standard", label: "Standard" },
  { id: "blank", label: "Blank" },
  { id: "control", label: "Control" },
  { id: "empty", label: "Clear" },
]

const num = (v: number, d = 3) => (isFinite(v) ? v.toFixed(d) : "-")

function heatColor(t: number): string {
  const stops = [[68, 1, 84], [59, 82, 139], [33, 144, 141], [93, 200, 99], [253, 231, 37]]
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = stops[i]
  const b = stops[Math.min(stops.length - 1, i + 1)]
  const c = a.map((v, k) => Math.round(v + f * (b[k] - v)))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

/* ── Shared plate model ──────────────────────────────────────────────────────
   The plate's layout (format, origin) and annotations (well roles +
   concentrations) live here, ABOVE both the Plate tab and the Standard-curve
   tab, so laying out the plate directly drives the curve. `standards`,
   `samples` and `blank` are derived once and consumed by both. */
export type PlateModel = ReturnType<typeof usePlateModel>

/**
 * The layout a freshly-loaded sheet implies, from the same detection the tab
 * strip already reads.
 *
 * T0.2: `PlateModelInit` existed and had no caller, so every sheet booted at
 * 96-well with `originRow = 0`. Two things were wrong with that. A 384-well
 * plate came up as 96 even though `detectDataKind` had already said 384. And
 * the grid the model is handed is built with `{ header: 1 }`, i.e. it INCLUDES
 * the header row — so on any sheet with column names, well A1 landed on a
 * header string, read as empty, and the whole plate sat one row too high.
 *
 * Pure, and separate from the hook, because "which row does the plate start
 * on" is the part that was silently wrong and is worth a test rather than a
 * spinner the researcher has to notice and correct.
 */
export function plateLayoutFromSheet(
  grid: (string | number)[][],
  detected: { plate?: boolean; plateFormat?: PlateFormat | null },
): { format: PlateFormat; originRow: number; originCol: number } {
  const format: PlateFormat = detected.plateFormat === 384 ? 384 : 96
  // A first row with no numbers in it is a header, not readings. Guard the
  // empty sheet: `every` on an empty row is vacuously true and would push the
  // origin down a row for no reason.
  const first = grid[0] ?? []
  const headerRow = grid.length > 1 && first.length > 0 && first.every((c) => typeof c !== "number")
  const originRow = headerRow ? 1 : 0
  // The same argument one axis over: a plate reader writes "A", "B", "C" down
  // the left, and reading that column as well 1 shifts every reading across.
  const dataRow = grid[originRow] ?? []
  const labelCol = dataRow.length > 1 && typeof dataRow[0] !== "number" && dataRow.slice(1).some((c) => typeof c === "number")
  return { format, originRow, originCol: labelCol ? 1 : 0 }
}

export type PlateModelInit = {
  format?: PlateFormat
  originRow?: number
  originCol?: number
  roleOverrides?: Record<string, WellRole>
  annOverrides?: Record<string, number>
}

export function usePlateModel(grid: (string | number)[][], init?: PlateModelInit) {
  const [format, setFormat] = useState<PlateFormat>(init?.format ?? 96)
  const [originRow, setOriginRow] = useState(init?.originRow ?? 0)
  const [originCol, setOriginCol] = useState(init?.originCol ?? 0)
  const [roleOverrides, setRoleOverrides] = useState<Record<string, WellRole>>(init?.roleOverrides ?? {})
  const [annOverrides, setAnnOverrides] = useState<Record<string, number>>(init?.annOverrides ?? {})

  const basePlate = useMemo(() => plateFromGrid(grid, format, originRow, originCol), [grid, format, originRow, originCol])
  const plate: Plate = useMemo(
    () => ({
      ...basePlate,
      wells: basePlate.wells.map((row) =>
        row.map((w) => ({ ...w, role: roleOverrides[w.id] ?? w.role, annotation: annOverrides[w.id] ?? w.annotation })),
      ),
    }),
    [basePlate, roleOverrides, annOverrides],
  )
  const standards = useMemo(() => standardsFromPlate(plate), [plate])
  const samples = useMemo(() => samplesFromPlate(plate), [plate])
  const blank = useMemo(() => {
    const bs = flatWells(plate, "blank").map((w) => w.value).filter((v): v is number => v != null && isFinite(v))
    return bs.length ? bs.reduce((a, b) => a + b, 0) / bs.length : 0
  }, [plate])

  const setRole = useCallback((id: string, role: WellRole) => setRoleOverrides((p) => ({ ...p, [id]: role })), [])
  const setAnn = useCallback((id: string, v: number) => setAnnOverrides((p) => ({ ...p, [id]: v })), [])
  const applyOverrides = useCallback((roles: Record<string, WellRole>, anns: Record<string, number>) => {
    setRoleOverrides(roles)
    setAnnOverrides(anns)
  }, [])
  const reset = useCallback(() => {
    setRoleOverrides({})
    setAnnOverrides({})
  }, [])
  const hasAnnotations = Object.keys(roleOverrides).length > 0

  return {
    format, setFormat, originRow, originCol, setOriginRow, setOriginCol,
    roleOverrides, annOverrides, setRole, setAnn, applyOverrides, reset,
    basePlate, plate, standards, samples, blank, hasAnnotations,
  }
}

/* ── Plate tab (view over the shared model) ───────────────────────────────── */
export function usePlate(model: PlateModel): { canvas: ReactNode; settings: ReactNode } {
  const { plate, basePlate, format, setFormat, originRow, originCol, setOriginRow, setOriginCol, standards, samples } = model
  const [brush, setBrush] = useState<WellRole>("standard")
  const [concInput, setConcInput] = useState("")
  const [showHeat, setShowHeat] = useState(true)

  // Template controls (local to the Plate tab)
  const [tplOrient, setTplOrient] = useState<"col" | "row">("col")
  const [tplTop, setTplTop] = useState("1000")
  const [tplFold, setTplFold] = useState("2")
  const [tplPoints, setTplPoints] = useState("8")
  const [tplReps, setTplReps] = useState("2")
  const [tplBlank, setTplBlank] = useState(true)

  const [min, max] = useMemo(() => plateValueRange(plate), [plate])

  const paint = (id: string) => {
    model.setRole(id, brush)
    if (brush === "standard" && concInput !== "" && isFinite(Number(concInput))) model.setAnn(id, Number(concInput))
  }

  const applyTemplate = () => {
    const { roles, anns } = standardTemplateOverrides(basePlate, {
      orientation: tplOrient,
      points: Number(tplPoints) || 8,
      replicates: Number(tplReps) || 1,
      topConc: Number(tplTop) || 1,
      fold: Number(tplFold) || 2,
      blankLane: tplBlank,
    })
    model.applyOverrides(roles, anns)
  }

  const fit = useMemo(() => (standards.x.length >= 2 ? fitCurve("4pl", standards.x, standards.y) : null), [standards])
  const filledCount = useMemo(() => plate.wells.flat().filter((w) => w.value != null).length, [plate])

  const wellSize = format === 384 ? 20 : 34
  const gap = format === 384 ? 2 : 4

  const canvas = (
    <section className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
          {([96, 384] as PlateFormat[]).map((f) => (
            <button key={f} onClick={() => setFormat(f)} className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", format === f ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground")}>{f}-well</button>
          ))}
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          Heatmap
          <Switch checked={showHeat} onCheckedChange={setShowHeat} className="data-[state=checked]:bg-[var(--n9-accent,#965034)]" />
        </label>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">Live mirror of the sheet, each cell maps to a well. Assign a standard-curve template (right); the Standard curve tab quantifies from this layout.</p>

      {filledCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          No numeric cells in this block. Set the plate origin (right) to where your reading starts, or paste an 8×12 grid into the sheet.
        </div>
      ) : (
        <div className="inline-block">
          <div className="flex" style={{ gap, marginLeft: wellSize * 0.7 + gap }}>
            {Array.from({ length: plate.cols }).map((_, c) => (<div key={c} style={{ width: wellSize }} className="text-center text-[10px] font-medium text-muted-foreground">{c + 1}</div>))}
          </div>
          {plate.wells.map((row, r) => (
            <div key={r} className="flex items-center" style={{ gap, marginTop: gap }}>
              <div style={{ width: wellSize * 0.7 }} className="text-[10px] font-medium text-muted-foreground">{rowLabel(r)}</div>
              {row.map((w) => {
                const t = w.value != null && max > min ? (w.value - min) / (max - min) : 0
                const isHeat = showHeat && w.value != null
                const bg = isHeat ? heatColor(t) : "transparent"
                const roleRing = w.role !== "empty" && w.role !== "sample"
                return (
                  <motion.button key={w.id} onClick={() => paint(w.id)} whileHover={{ scale: 1.15 }}
                    title={`${w.id}${w.value != null ? ` · ${num(w.value)}` : ""}${w.role !== "empty" ? ` · ${w.role}` : ""}${w.annotation != null ? ` · ${w.annotation}` : ""}`}
                    style={{ width: wellSize, height: wellSize, background: bg, borderColor: roleRing ? ROLE_COLORS[w.role] : isHeat ? "rgba(255,255,255,0.5)" : "var(--border, #e8ded3)", borderWidth: roleRing ? 2.5 : 1 }}
                    className="rounded-full border transition-colors" />
                )
              })}
            </div>
          ))}
        </div>
      )}

      {showHeat && filledCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono">{num(min, 2)}</span>
          <div className="h-2 w-40 rounded-full" style={{ background: "linear-gradient(90deg, rgb(68,1,84), rgb(59,82,139), rgb(33,144,141), rgb(93,200,99), rgb(253,231,37))" }} />
          <span className="font-mono">{num(max, 2)}</span>
          <span className="ml-3">Legend:</span>
          {ROLES.filter((r) => r.id !== "empty").map((r) => (<span key={r.id} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: ROLE_COLORS[r.id] }} />{r.label}</span>))}
        </div>
      )}

      {fit && (
        <div className="mt-4 rounded-xl border border-border bg-muted/10 p-3">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-semibold">Back-calculated samples</h4>
            <span className="text-xs text-muted-foreground">4PL · R² {num(fit.r2, 4)}{fit.ec50 != null ? ` · EC₅₀ ${num(fit.ec50, 2)}` : ""} · full table in the Standard curve tab</span>
          </div>
          <div className="grid max-h-44 grid-cols-2 gap-x-6 gap-y-0.5 overflow-y-auto font-mono text-xs tabular-nums sm:grid-cols-3 lg:grid-cols-4">
            {samples.slice(0, 96).map((s) => {
              const c = fit.interpolate(s.value)
              return (<div key={s.id} className="flex items-center justify-between"><span className="text-muted-foreground">{s.id}</span><span className={isFinite(c) ? "" : "text-muted-foreground"}>{isFinite(c) ? num(c, 2) : "-"}</span></div>)
            })}
          </div>
        </div>
      )}
    </section>
  )

  const settings = (
    <div className="space-y-4">
      <Group title="Plate origin" subtitle="Top-left cell of the block">
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Start row"><NumIn value={originRow + 1} onChange={(v) => setOriginRow(Math.max(0, v - 1))} /></Labeled>
          <Labeled label="Start column"><NumIn value={originCol + 1} onChange={(v) => setOriginCol(Math.max(0, v - 1))} /></Labeled>
        </div>
      </Group>

      <Group title="Standard-curve template" subtitle="Lay a serial dilution, then apply">
        <div className="space-y-2.5">
          <div className="inline-flex w-full rounded-lg border border-border bg-background p-0.5 text-xs">
            {(["col", "row"] as const).map((o) => (<button key={o} onClick={() => setTplOrient(o)} className={cn("flex-1 rounded-md px-2 py-1 transition-colors", tplOrient === o ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground")}>{o === "col" ? "Down columns" : "Across rows"}</button>))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="Top conc"><TxtIn value={tplTop} onChange={setTplTop} /></Labeled>
            <Labeled label="Fold dilution"><TxtIn value={tplFold} onChange={setTplFold} /></Labeled>
            <Labeled label="# points"><TxtIn value={tplPoints} onChange={setTplPoints} /></Labeled>
            <Labeled label="Replicates"><TxtIn value={tplReps} onChange={setTplReps} /></Labeled>
          </div>
          <label className="flex cursor-pointer items-center justify-between text-xs text-foreground">
            <span>Reserve next lane as blanks</span>
            <Switch checked={tplBlank} onCheckedChange={setTplBlank} className="data-[state=checked]:bg-[var(--n9-accent,#965034)]" />
          </label>
          <button onClick={applyTemplate} className="w-full rounded-lg bg-[var(--n9-accent,#965034)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">Apply template</button>
        </div>
      </Group>

      <Group title="Fine-tune (paint)" subtitle="Pick a role, click wells">
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((role) => (
            <button key={role.id} onClick={() => setBrush(role.id)} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors", brush === role.id ? "border-transparent bg-[var(--n9-accent,#965034)] text-white" : "border-border text-muted-foreground hover:text-foreground")}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_COLORS[role.id] === "transparent" ? "#cbd5e1" : ROLE_COLORS[role.id] }} />{role.label}
            </button>
          ))}
        </div>
        {brush === "standard" && (
          <div className="mt-2.5">
            <Labeled label="Concentration for painted standards"><TxtIn value={concInput} onChange={setConcInput} placeholder="e.g. 100" mono /></Labeled>
          </div>
        )}
        <button onClick={() => model.reset()} className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline">Reset annotations</button>
      </Group>

      <Group title="Standards" subtitle={`${standards.x.length} concentration levels`}>
        {standards.x.length >= 2 ? (
          <div className="flex flex-wrap gap-1.5 font-mono text-[11px] tabular-nums">
            {standards.x.map((c, i) => (<span key={i} className="rounded border border-border bg-muted/20 px-1.5 py-0.5"><span className="text-muted-foreground">{num(c, 1)}</span>→{num(standards.y[i], 2)}</span>))}
          </div>
        ) : (<p className="text-xs text-muted-foreground">Apply a template or paint ≥2 standard concentrations, then open the Standard curve tab to fit and quantify.</p>)}
      </Group>
    </div>
  )

  return { canvas, settings }
}

function Group({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-3"><h3 className="text-sm font-semibold">{title}</h3>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div>
      {children}
    </section>
  )
}
function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (<div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>{children}</div>)
}
function NumIn({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input type="number" min={1} value={value} onChange={(e) => onChange(Number(e.target.value) || 1)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-mono" />
}
function TxtIn({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn("h-9 w-full rounded-md border border-input bg-background px-2 text-sm", mono !== false && "font-mono")} />
}
