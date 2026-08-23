"use client"

import { useMemo, useState, type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CaretDown } from "@phosphor-icons/react/ssr"
import { cn } from "@/lib/utils"
import {
  describe,
  shapiroWilk,
  dagostinoPearson,
  grubbs,
  oneSampleT,
  unpairedT,
  pairedT,
  oneWayAnova,
  welchAnova,
  tukeyHSD,
  multipleComparisons,
  mannWhitney,
  wilcoxonSignedRank,
  kruskalWallis,
  dunnTest,
  pearson,
  spearman,
  sigStars,
  type TestResult,
  type Tail,
  type CorrectionMethod,
} from "@/lib/data-analysis/statistics"

export type Table = { columns: string[]; rows: Record<string, number | string>[] }

type TestId =
  | "oneSampleT" | "unpairedT" | "welchT" | "pairedT" | "anova" | "welchAnova"
  | "kruskal" | "mannWhitney" | "wilcoxon" | "pearson" | "spearman"

const TESTS: { id: TestId; label: string; group: string; arity: "one" | "two" | "many" }[] = [
  { id: "oneSampleT", label: "One-sample t-test", group: "Parametric", arity: "one" },
  { id: "unpairedT", label: "Unpaired t-test (Student)", group: "Parametric", arity: "two" },
  { id: "welchT", label: "Unpaired t-test (Welch)", group: "Parametric", arity: "two" },
  { id: "pairedT", label: "Paired t-test", group: "Parametric", arity: "two" },
  { id: "anova", label: "One-way ANOVA + post-hoc", group: "Parametric", arity: "many" },
  { id: "welchAnova", label: "Welch's ANOVA", group: "Parametric", arity: "many" },
  { id: "mannWhitney", label: "Mann–Whitney U", group: "Non-parametric", arity: "two" },
  { id: "wilcoxon", label: "Wilcoxon signed-rank", group: "Non-parametric", arity: "two" },
  { id: "kruskal", label: "Kruskal–Wallis + Dunn", group: "Non-parametric", arity: "many" },
  { id: "pearson", label: "Pearson correlation", group: "Correlation", arity: "two" },
  { id: "spearman", label: "Spearman correlation", group: "Correlation", arity: "two" },
]

const POSTHOC: { id: CorrectionMethod; label: string }[] = [
  { id: "holm-sidak", label: "Holm–Šídák" },
  { id: "holm", label: "Holm" },
  { id: "bonferroni", label: "Bonferroni" },
  { id: "sidak", label: "Šídák" },
  { id: "none", label: "Uncorrected" },
]

const num = (v: number, d = 3) => (isFinite(v) ? v.toFixed(d) : "-")

export function useStatsPanel(table: Table, numericCols: string[]): { canvas: ReactNode; settings: ReactNode } {
  const colVals = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const c of numericCols) m[c] = table.rows.map((r) => Number(r[c])).filter((v) => isFinite(v))
    return m
  }, [table.rows, numericCols])

  const descriptives = useMemo(() => numericCols.map((c) => ({ key: c, d: describe(colVals[c] ?? []) })), [numericCols, colVals])

  const [testId, setTestId] = useState<TestId>("welchT")
  const [colA, setColA] = useState("")
  const [colB, setColB] = useState("")
  const [groupCols, setGroupCols] = useState<string[]>([])
  const [mu0, setMu0] = useState("0")
  const [tail, setTail] = useState<Tail>("two")
  const [postHoc, setPostHoc] = useState<CorrectionMethod>("holm-sidak")
  const [normalityMethod, setNormalityMethod] = useState<"shapiro" | "dagostino">("shapiro")

  const arity = TESTS.find((t) => t.id === testId)?.arity ?? "two"
  const hasTail = testId === "oneSampleT" || testId === "unpairedT" || testId === "welchT" || testId === "pairedT"

  const effA = numericCols.includes(colA) ? colA : numericCols[0] ?? ""
  const effB = numericCols.includes(colB) ? colB : numericCols[1] ?? numericCols[0] ?? ""
  const effGroups = groupCols.filter((c) => numericCols.includes(c))
  const groupSel = effGroups.length ? effGroups : numericCols.slice(0, Math.min(3, numericCols.length))

  const result: TestResult | null = useMemo(() => {
    const a = colVals[effA] ?? []
    const b = colVals[effB] ?? []
    const groups = groupSel.map((c) => ({ name: c, values: colVals[c] ?? [] }))
    switch (testId) {
      case "oneSampleT": return oneSampleT(a, Number(mu0) || 0, tail)
      case "unpairedT": return unpairedT(a, b, false, tail)
      case "welchT": return unpairedT(a, b, true, tail)
      case "pairedT": return pairedT(a, b, tail)
      case "anova": return oneWayAnova(groups)
      case "welchAnova": return welchAnova(groups)
      case "kruskal": return kruskalWallis(groups)
      case "mannWhitney": return mannWhitney(a, b)
      case "wilcoxon": return wilcoxonSignedRank(a, b)
      case "pearson": return pearson(a, b)
      case "spearman": return spearman(a, b)
    }
  }, [testId, effA, effB, groupSel, mu0, tail, colVals])

  const tukey = useMemo(() => {
    if (testId !== "anova") return []
    return tukeyHSD(groupSel.map((c) => ({ name: c, values: colVals[c] ?? [] })))
  }, [testId, groupSel, colVals])

  // Post-hoc multiple comparisons: parametric (after ANOVA) or Dunn (after KW).
  const postHocPairs = useMemo(() => {
    const groups = groupSel.map((c) => ({ name: c, values: colVals[c] ?? [] }))
    if (testId === "anova" || testId === "welchAnova") return multipleComparisons(groups, { method: postHoc })
    if (testId === "kruskal") return dunnTest(groups, postHoc === "none" ? "none" : postHoc)
    return []
  }, [testId, groupSel, postHoc, colVals])

  const normality = useMemo(
    () => numericCols.map((c) => ({ key: c, r: normalityMethod === "shapiro" ? shapiroWilk(colVals[c] ?? []) : dagostinoPearson(colVals[c] ?? []) })),
    [numericCols, colVals, normalityMethod],
  )

  const outliers = useMemo(
    () => numericCols.map((c) => ({ key: c, r: grubbs(colVals[c] ?? []) })).filter((o) => o.r?.outlier != null),
    [numericCols, colVals],
  )

  const canvas = (
    <div className="flex flex-col gap-4">
      <Card title="Descriptive statistics" subtitle={`${numericCols.length} numeric columns`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground/70">
                {["Column", "n", "Mean", "SD", "SEM", "Median", "IQR", "CV %", "Geo mean", "Skew", "Kurt", "95% CI"].map((h) => (
                  <th key={h} className="whitespace-nowrap py-2 pr-4 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {descriptives.map(({ key, d }) => (
                <tr key={key} className="border-t border-border/60">
                  <td className="py-2 pr-4 font-medium">{key}</td>
                  <td className="py-2 pr-4">{d.n}</td>
                  <td className="py-2 pr-4 font-mono">{num(d.mean)}</td>
                  <td className="py-2 pr-4 font-mono">{num(d.sd)}</td>
                  <td className="py-2 pr-4 font-mono">{num(d.sem)}</td>
                  <td className="py-2 pr-4 font-mono">{num(d.median)}</td>
                  <td className="py-2 pr-4 font-mono">{num(d.iqr)}</td>
                  <td className="py-2 pr-4 font-mono">{num(d.cv, 1)}</td>
                  <td className="py-2 pr-4 font-mono">{num(d.geoMean)}</td>
                  <td className="py-2 pr-4 font-mono">{num(d.skewness, 2)}</td>
                  <td className="py-2 pr-4 font-mono">{num(d.kurtosis, 2)}</td>
                  <td className="py-2 pr-4 font-mono text-muted-foreground">{num(d.ci95[0], 2)} – {num(d.ci95[1], 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AnimatePresence mode="wait">
        <motion.div
          key={testId + effA + effB + groupSel.join()}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <Card title="Test result" subtitle={result?.name ?? "Choose a test"}>
            {result ? (
              <ResultView result={result} tukey={tukey} postHoc={postHocPairs} />
            ) : (
              <p className="text-sm text-muted-foreground">Not enough data for this test with the selected columns.</p>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>

      <Card title={normalityMethod === "shapiro" ? "Normality (Shapiro–Wilk)" : "Normality (D'Agostino–Pearson)"} subtitle="Per numeric column">
        <div className="mb-3 inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
          {([["shapiro", "Shapiro–Wilk"], ["dagostino", "D'Agostino"]] as const).map(([id, lab]) => (
            <button key={id} onClick={() => setNormalityMethod(id)}
              className={cn("rounded-md px-2.5 py-1 transition-colors", normalityMethod === id ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground")}>{lab}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {normality.map(({ key, r }) => (
            <div key={key} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs">
              <span className="font-medium">{key}</span>
              {r ? (<><span className="font-mono text-muted-foreground">{r.stat[0].label}={num(r.stat[0].value)}</span><Pill p={r.p} /></>) : (<span className="text-muted-foreground">n too small</span>)}
            </div>
          ))}
        </div>
      </Card>

      {outliers.length > 0 && (
        <Card title="Outliers (Grubbs' test)" subtitle="Columns with a significant outlier">
          <div className="flex flex-wrap gap-2">
            {outliers.map(({ key, r }) => (
              <div key={key} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs">
                <span className="font-medium">{key}</span>
                <span className="font-mono text-muted-foreground">outlier {num(r!.outlier ?? NaN, 2)}</span>
                <Pill p={r!.p} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )

  const settings = (
    <div className="space-y-3.5">
      <Labeled label="Test">
        <NativeSelect value={testId} onChange={(v) => setTestId(v as TestId)}>
          {["Parametric", "Non-parametric", "Correlation"].map((grp) => (
            <optgroup key={grp} label={grp}>
              {TESTS.filter((t) => t.group === grp).map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
            </optgroup>
          ))}
        </NativeSelect>
      </Labeled>
      {arity !== "many" && (
        <Labeled label={arity === "one" ? "Column" : "Group A"}>
          <ColSelect cols={numericCols} value={effA} onChange={setColA} />
        </Labeled>
      )}
      {arity === "two" && (
        <Labeled label="Group B"><ColSelect cols={numericCols} value={effB} onChange={setColB} /></Labeled>
      )}
      {arity === "one" && (
        <Labeled label="Hypothesized mean (μ₀)">
          <input value={mu0} onChange={(e) => setMu0(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-mono" />
        </Labeled>
      )}
      {hasTail && (
        <Labeled label="Tails">
          <div className="inline-flex w-full rounded-lg border border-border bg-background p-0.5 text-xs">
            {([["two", "Two-tailed"], ["greater", "One (>)"], ["less", "One (<)"]] as const).map(([id, lab]) => (
              <button key={id} onClick={() => setTail(id)}
                className={cn("flex-1 rounded-md px-2 py-1 transition-colors", tail === id ? "bg-[var(--n9-accent,#965034)] text-white" : "text-muted-foreground hover:text-foreground")}>{lab}</button>
            ))}
          </div>
        </Labeled>
      )}
      {(testId === "anova" || testId === "welchAnova" || testId === "kruskal") && (
        <Labeled label="Post-hoc correction">
          <NativeSelect value={postHoc} onChange={(v) => setPostHoc(v as CorrectionMethod)}>
            {POSTHOC.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
          </NativeSelect>
        </Labeled>
      )}
      {arity === "many" && (
        <Labeled label="Groups (columns)">
          <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-1.5">
            {numericCols.map((c) => {
              const on = groupSel.includes(c)
              return (
                <button key={c} onClick={() => setGroupCols(on ? groupSel.filter((k) => k !== c) : [...groupSel, c])}
                  className={cn("rounded px-2 py-0.5 text-xs transition-colors", on ? "bg-[var(--n9-accent,#965034)] text-white" : "bg-muted text-muted-foreground hover:text-foreground")}>{c}</button>
              )
            })}
          </div>
        </Labeled>
      )}
      <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
        Parametric tests assume roughly normal data, check Shapiro–Wilk; if it flags, use the matching non-parametric test.
      </p>
    </div>
  )

  return { canvas, settings }
}

function ResultView({
  result,
  tukey,
  postHoc,
}: {
  result: TestResult
  tukey: ReturnType<typeof tukeyHSD>
  postHoc: ReturnType<typeof multipleComparisons>
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        {result.stat.map((s) => (<Stat key={s.label} label={s.label} value={num(s.value)} />))}
        {result.df && <Stat label="df" value={result.df} />}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">p-value</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-lg font-semibold">{result.p < 0.0001 ? "< 0.0001" : num(result.p, 4)}</span>
            <Pill p={result.p} />
          </div>
        </div>
        {result.effect && (
          <Stat
            label={result.effect.label}
            value={num(result.effect.value)}
            /* An effect size without its interval reads as a measurement when
               it is an estimate, and the interval is what says whether the
               effect is pinned down or merely non-zero. Shown only when the
               test actually produced one — never manufactured here. */
            sub={
              result.effectCI && result.effectCI.every(Number.isFinite)
                ? `95% CI ${num(result.effectCI[0])} to ${num(result.effectCI[1])}`
                : undefined
            }
          />
        )}
      </div>
      {result.note && <p className="text-xs text-muted-foreground">{result.note}</p>}
      {tukey.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Tukey HSD pairwise (exact studentized range)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground/60">
                  <th className="py-1.5 pr-4">Pair</th><th className="py-1.5 pr-4">Δ mean</th><th className="py-1.5 pr-4">95% CI</th><th className="py-1.5 pr-4">adj. p</th><th className="py-1.5 pr-4"></th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {tukey.map((t) => (
                  <tr key={t.a + t.b} className="border-t border-border/50">
                    <td className="py-1.5 pr-4 font-medium">{t.a} vs {t.b}</td>
                    <td className="py-1.5 pr-4 font-mono">{num(t.diff)}</td>
                    <td className="py-1.5 pr-4 font-mono text-muted-foreground">{num(t.ciLow, 2)} – {num(t.ciHigh, 2)}</td>
                    <td className="py-1.5 pr-4 font-mono">{t.p < 0.0001 ? "< 0.0001" : num(t.p, 4)}</td>
                    <td className="py-1.5 pr-4"><Pill p={t.p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {postHoc.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Multiple comparisons (adjusted)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground/60">
                  <th className="py-1.5 pr-4">Pair</th><th className="py-1.5 pr-4">Δ</th><th className="py-1.5 pr-4">raw p</th><th className="py-1.5 pr-4">adj. p</th><th className="py-1.5 pr-4"></th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {postHoc.map((c) => (
                  <tr key={c.a + c.b} className="border-t border-border/50">
                    <td className="py-1.5 pr-4 font-medium">{c.a} vs {c.b}</td>
                    <td className="py-1.5 pr-4 font-mono">{num(c.diff, 2)}</td>
                    <td className="py-1.5 pr-4 font-mono text-muted-foreground">{c.p < 0.0001 ? "< 0.0001" : num(c.p, 4)}</td>
                    <td className="py-1.5 pr-4 font-mono">{c.pAdj < 0.0001 ? "< 0.0001" : num(c.pAdj, 4)}</td>
                    <td className="py-1.5 pr-4"><Pill p={c.pAdj} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Pill({ p }: { p: number }) {
  const sig = p < 0.05
  return <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", sig ? "bg-[var(--n9-accent,#965034)]/12 text-[var(--n9-accent,#965034)]" : "bg-muted text-muted-foreground")}>{sigStars(p)}</span>
}
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (<div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</div><div className="mt-0.5 font-mono text-lg font-semibold">{value}</div>{sub && <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{sub}</div>}</div>)
}
function ColSelect({ cols, value, onChange }: { cols: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <NativeSelect value={value} onChange={onChange}>
      {cols.map((c) => (<option key={c} value={c}>{c}</option>))}
    </NativeSelect>
  )
}
/** A native <select> styled to look modern, with a Phosphor chevron, no shadcn. */
function NativeSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-8 text-sm outline-none transition-colors hover:border-border focus:border-[var(--n9-accent,#965034)]/50 focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/20"
      >
        {children}
      </select>
      <CaretDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
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
