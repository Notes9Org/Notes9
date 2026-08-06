"use client"

import { useState } from "react"
import {
  CheckCircle,
  WarningCircle,
  CaretDown,
  Copy,
  Check,
  Info,
  ArrowCounterClockwise,
} from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import { draftFigureLegend, EFFECT_LABEL } from "@/lib/data-analysis/provenance"
import { Collapse, ComputeBar, Reveal, ValueSwap } from "./motion"

/**
 * The results panel (§10.4).
 *
 * "The statistic, the assumptions checked, the effect size, and the exact
 * wording that will appear in the legend, not a wall of output."
 *
 * So the card is four things and a disclosure. The full pairwise table is real
 * and reachable, but it is not what a bench scientist reads first: they read
 * whether it worked, whether the assumptions held, how big the effect is, and
 * what they can paste into the paper.
 *
 * Every number rendered here comes from `result`, which came from the engine.
 * Nothing on this card is computed in the component, that would put a statistic
 * back on the client and break Law 2 at the last possible moment.
 */

function formatP(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "-"
  return p < 0.0001 ? "< 0.0001" : p.toFixed(4)
}

function AssumptionChip({
  name,
  passed,
  verdict,
  alternative,
}: {
  name: string
  passed: boolean
  verdict: string
  alternative: string | null
}) {
  return (
    <span
      className={cn(
        "group/chip relative inline-flex items-center gap-1.5 text-[12.5px] transition-colors",
        passed ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"
      )}
      title={alternative ? `${verdict} Consider ${alternative}.` : verdict}
    >
      {passed ? (
        <CheckCircle className="size-3.5 shrink-0" weight="fill" />
      ) : (
        <WarningCircle className="size-3.5 shrink-0" weight="fill" />
      )}
      {name}
    </span>
  )
}

export function ResultsCard({
  spec,
  result,
  computing,
  className,
  onShowProvenance,
  onEditCaption,
  flush,
}: {
  spec: AnalysisSpec
  result: EngineResult | null
  computing?: boolean
  className?: string
  onShowProvenance?: () => void
  /** Edit the legend. Null resets it to the wording generated from the result. */
  onEditCaption?: (caption: string | null) => void
  /** Set when a dock already supplies the card surface and title. */
  flush?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState(false)

  const test = result?.test ?? null
  const fit = result?.curveFit ?? null
  // The author's wording wins over the generated one, always.
  const isCustomCaption = typeof spec.figure.caption === "string" && spec.figure.caption.length > 0
  const legend = isCustomCaption
    ? spec.figure.caption!
    : result
      ? draftFigureLegend(spec, result)
      : ""
  // The interval quoted must be the one the spec asked for. Printing "95% CI"
  // beside an analysis declared at alpha = 0.01 would misreport the engine.
  const ciPct = `${+((1 - spec.analysis.alpha) * 100).toFixed(4)}%`

  const copyLegend = async () => {
    if (!legend) return
    try {
      await navigator.clipboard.writeText(legend)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked; the text is selectable either way.
    }
  }

  if (!result) {
    return (
      <div
        className={cn(
          "relative rounded-xl border border-border/60 bg-card/60 p-4 text-[13px] text-muted-foreground",
          className
        )}
      >
        <ComputeBar active={Boolean(computing)} />
        {computing ? "Computing…" : "Choose a test to see the result here."}
      </div>
    )
  }

  return (
    <Reveal
      className={cn(
        "relative",
        flush
          ? "overflow-visible"
          : "overflow-hidden rounded-2xl border border-border/50 bg-card",
        className
      )}
    >
      <ComputeBar active={Boolean(computing)} />

      {/* 1, the verdict, in the engine's own words. */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="text-[15px] leading-[1.6] text-foreground">
            {test?.reportSentence ||
              (fit
                ? `${fit.model} fit converged; see the parameters below.`
                : "No test selected.")}
          </p>
        </div>
        {onShowProvenance && (
          <button
            type="button"
            onClick={onShowProvenance}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Info className="size-3.5" />
            Provenance
          </button>
        )}
      </div>

      {/* 2, headline numbers, animated only by a brief opacity dip. */}
      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 px-5 sm:grid-cols-4">
        {test && (
          <>
            <Stat label="p-value" value={formatP(test.pValue)} emphasis />
            <Stat
              label={test.statistic !== null ? "Statistic" : "-"}
              value={test.statistic !== null ? test.statistic.toFixed(3) : "-"}
              sub={test.df !== null ? `df ${test.df}` : undefined}
            />
            {test.effectSizes[0] && (
              <Stat
                label={
                  EFFECT_LABEL[test.effectSizes[0].name] ??
                  test.effectSizes[0].name.replace(/-/g, " ")
                }
                value={test.effectSizes[0].value.toFixed(3)}
                sub={
                  test.effectSizes[0].ciLow !== null && test.effectSizes[0].ciHigh !== null
                    ? `${ciPct} CI ${test.effectSizes[0].ciLow.toFixed(2)} to ${test.effectSizes[0].ciHigh.toFixed(2)}`
                    : (test.effectSizes[0].term ?? undefined)
                }
              />
            )}
            <Stat
              label="n"
              value={Object.values(test.groupSizes).reduce((a, b) => a + b, 0) || "-"}
              sub={
                Object.keys(test.groupSizes).length > 1
                  ? `${Object.keys(test.groupSizes).length} groups`
                  : undefined
              }
            />
          </>
        )}
        {!test && fit && (
          <>
            <Stat label="EC50" value={fit.ec50 !== null ? fit.ec50.toPrecision(4) : "-"} emphasis />
            <Stat label="R²" value={fit.rSquared.toFixed(4)} />
            <Stat label="Sy.x" value={fit.syx.toPrecision(3)} />
            <Stat label="Model" value={fit.model} />
          </>
        )}
      </div>

      {/* 3, assumptions, surfaced rather than buried (§2 Tier 1.4). */}
      {test && test.assumptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pt-4">
          {test.assumptions.map((a) => (
            <AssumptionChip
              key={a.name}
              name={a.name}
              passed={a.passed}
              verdict={a.verdict}
              alternative={a.alternative}
            />
          ))}
        </div>
      )}

      {/* The model table. A factorial design or a regression does not have "a"
          p-value, and showing only the headline one would let the reader take a
          single term for the whole model. */}
      {test && test.terms.length > 0 && (
        <div className="mt-4 overflow-x-auto px-5">
          <table className="w-full min-w-[26rem] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Term</th>
                {test.terms.some((t) => t.estimate !== null) && (
                  <th className="py-1.5 pr-3 font-medium">Estimate</th>
                )}
                {test.terms.some((t) => t.ciLow !== null) && (
                  <th className="py-1.5 pr-3 font-medium">{ciPct} CI</th>
                )}
                <th className="py-1.5 pr-3 font-medium">Statistic</th>
                <th className="py-1.5 pr-3 font-medium">p</th>
              </tr>
            </thead>
            <tbody>
              {test.terms.map((t) => (
                <tr key={t.term} className="border-b border-border/40 last:border-0">
                  <td className="py-1.5 pr-3 text-foreground/85">{t.term}</td>
                  {test.terms.some((x) => x.estimate !== null) && (
                    <td className="py-1.5 pr-3 tabular-nums">
                      {t.estimate !== null ? t.estimate.toPrecision(4) : "-"}
                    </td>
                  )}
                  {test.terms.some((x) => x.ciLow !== null) && (
                    <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                      {t.ciLow !== null && t.ciHigh !== null
                        ? `${t.ciLow.toPrecision(3)} to ${t.ciHigh.toPrecision(3)}`
                        : "-"}
                    </td>
                  )}
                  <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                    {t.statistic !== null ? t.statistic.toFixed(3) : "-"}
                    {t.df !== null && (
                      <span className="ml-1 text-muted-foreground/70">({t.df})</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 pr-3 tabular-nums",
                      t.pValue !== null && t.pValue < spec.analysis.alpha
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {formatP(t.pValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4, the legend, ready to paste. This is the last mile to the paper,
             so it is fully editable: the generated wording is a starting point,
             not the product's opinion about how the author should write. Once
             edited it is stored on the spec and never regenerated over. */}
      {legend && (
        <div className="mt-4 border-t border-border/40 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted-foreground">
              {isCustomCaption ? "Figure legend (edited)" : "Draft figure legend"}
            </p>
            <div className="flex items-center gap-1">
              {isCustomCaption && onEditCaption && (
                <button
                  type="button"
                  onClick={() => onEditCaption(null)}
                  title="Go back to the wording generated from the result"
                  className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ArrowCounterClockwise className="size-3.5" />
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={copyLegend}
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-600" weight="bold" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          {onEditCaption ? (
            <textarea
              value={legend}
              onChange={(e) => onEditCaption(e.target.value)}
              rows={Math.min(8, Math.max(2, Math.ceil(legend.length / 90)))}
              aria-label="Figure legend"
              spellCheck
              className="mt-2 w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[13.5px] leading-[1.7] text-foreground/85 outline-none transition-colors hover:border-border/60 focus:border-[var(--n9-accent)]/50 focus:bg-background"
            />
          ) : (
            <p className="mt-2 select-text text-[13.5px] leading-[1.7] text-foreground/85">
              {legend}
            </p>
          )}
        </div>
      )}

      {/* The wall of output, on request only. */}
      {test && test.pairwise.length > 0 && (
        <div className="border-t border-border/40">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="flex w-full items-center gap-1.5 px-5 py-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <CaretDown
              className={cn("size-3.5 transition-transform duration-200", showAll && "rotate-180")}
            />
            {showAll ? "Hide" : "Show"} all {test.pairwise.length} comparison
            {test.pairwise.length === 1 ? "" : "s"}
          </button>
          <Collapse open={showAll}>
            <div className="-mx-px overflow-x-auto px-4 pb-3">
              <table className="w-full min-w-[30rem] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Pair</th>
                    <th className="py-1.5 pr-3 font-medium">Δ mean</th>
                    <th className="py-1.5 pr-3 font-medium">{ciPct} CI</th>
                    <th className="py-1.5 pr-3 font-medium">adj. p</th>
                  </tr>
                </thead>
                <tbody>
                  {test.pairwise.map((p) => (
                    <tr
                      key={`${p.groupA}-${p.groupB}`}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="py-1.5 pr-3 text-foreground/85">
                        {p.groupA} vs {p.groupB}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{p.meanDifference.toFixed(3)}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                        {p.ciLow !== null && p.ciHigh !== null
                          ? `${p.ciLow.toFixed(2)} to ${p.ciHigh.toFixed(2)}`
                          : "-"}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 pr-3 tabular-nums",
                          p.significant ? "font-medium text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {formatP(p.pAdjusted)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Collapse>
        </div>
      )}

      {/* A failure is not a caveat. Amber alongside the convergence notes is how
          a run that produced nothing came to look like a run that produced a
          result; the raw exception stays in `error.detail`, out of sight. */}
      {result.error && (
        <div className="border-t border-red-500/20 bg-red-500/[0.06] px-4 py-2.5">
          <p className="text-[12.5px] leading-relaxed text-red-800 dark:text-red-300">
            {result.error.message}
          </p>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="border-t border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5">
          {result.warnings.map((w) => (
            <p key={w} className="text-[12.5px] leading-relaxed text-amber-800 dark:text-amber-300">
              {w}
            </p>
          ))}
        </div>
      )}
    </Reveal>
  )
}

function Stat({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string
  value: string | number
  sub?: string
  emphasis?: boolean
}) {
  return (
    <div>
      {/* Not capitalized: these labels are statistical notation, and a CSS
          transform turns "η²" into "Η²" and "p-value" into "P-Value", both of
          which are the wrong symbol rather than a styling quirk. */}
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-medium tracking-tight text-foreground",
          emphasis ? "text-[22px] leading-none" : "text-[17px] leading-none"
        )}
      >
        <ValueSwap value={value} />
      </p>
      {sub && <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  )
}
