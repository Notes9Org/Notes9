"use client"

import type { Results } from "@/types/analysis"

/**
 * The Analysis section's left rail: the analytical record.
 *
 * Design doc §03 — "the analytical record: prompt, plan, statistics, assumption
 * checks, interpretation". The prompt and plan cards arrive with propose mode
 * (§06); this renders the three that exist today from `results` alone.
 *
 * Everything here is read from the stored Results — nothing is recomputed in
 * the browser, so what you read is what the engine wrote.
 */

/** Journals want "< 0.0001", not "0.00000003". */
function formatP(p: number): string {
  if (!Number.isFinite(p)) return "—"
  if (p < 0.0001) return "< 0.0001"
  return p.toFixed(4)
}

function formatNum(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—"
  return Number(n.toPrecision(digits)).toString()
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "pass" | "fail" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          tone === "pass"
            ? "font-medium tabular-nums text-emerald-600 dark:text-emerald-400"
            : tone === "fail"
              ? "font-medium tabular-nums text-amber-600 dark:text-amber-400"
              : "font-medium tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export function ResultsPanel({ results }: { results: Results | null }) {
  if (!results) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing has been run yet. Set the source up in Data, then run the analysis.
        </p>
      </div>
    )
  }

  const { test, assumptions, meta, fit } = results
  // df is a list: [1] for chi-square, [num, den] for F.
  const df = test.df?.length ? `(${test.df.join(", ")})` : ""

  return (
    <div className="space-y-4">
      <Card title="Result">
        <Row label={`${test.statistic_name}${df}`} value={formatNum(test.statistic, 4)} />
        <Row label="p" value={formatP(test.p_value)} />
        {test.effect_size && (
          <Row label={test.effect_size.name} value={formatNum(test.effect_size.value, 3)} />
        )}
        <div className="pt-1 text-xs text-muted-foreground">{test.name}</div>
      </Card>

      {fit && (
        <Card title="Fit">
          <Row label="Model" value={fit.model} />
          <Row label={`${fit.y} vs ${fit.x}`} value="" />
          <Row label="Slope" value={formatNum(fit.slope, 4)} />
          <Row label="Intercept" value={formatNum(fit.intercept, 4)} />
          <Row label="R²" value={formatNum(fit.r_squared, 4)} />
          <div className="pt-1 text-xs text-muted-foreground">
            Slope 95% CI {formatNum(fit.slope_ci[0], 3)} – {formatNum(fit.slope_ci[1], 3)}
          </div>
        </Card>
      )}

      {assumptions.length > 0 && (
        <Card title="Assumptions">
          {assumptions.map((a) => (
            <Row
              key={a.name}
              label={a.name}
              value={a.passed ? "pass" : `p = ${formatP(a.p_value)}`}
              tone={a.passed ? "pass" : "fail"}
            />
          ))}
        </Card>
      )}

      <Card title="Run">
        <Row label="n" value={String(meta.n_total)} />
        {meta.n_excluded > 0 && <Row label="Excluded" value={String(meta.n_excluded)} />}
        <Row label="α" value={String(meta.alpha)} />
        <div className="pt-1 text-xs text-muted-foreground">
          {Object.entries(meta.software)
            .map(([pkg, version]) => `${pkg} ${version}`)
            .join(" · ")}
        </div>
      </Card>
    </div>
  )
}
