import { profileTable, type ColumnProfile } from "@/lib/data-analysis/semantic/infer"
import { skewness } from "@/lib/data-analysis/statistics"
import type { AnalysisSpec, RowFilter } from "@/lib/data-analysis/spec/analysis-spec"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"
import type { Table } from "@/lib/data-analysis/engine/resolver"

/**
 * P5, the offer side of the pipeline bar.
 *
 * `profileTable` is a TypeScript PRE-FLIGHT scan of the raw sheet — it lives in
 * `semantic/infer.ts`, not in the Pyodide engine — and until now it had no
 * caller outside the AI path, where it exists only to brief the model on shape.
 * This turns the same scan into offers a researcher can see and take.
 *
 * Two rules the whole file exists to keep:
 *
 *   - The scan TRIGGERS an offer; it does not get to speak. A count read
 *     straight off the raw sheet ("missing 2 of 6 values", "13 levels") is a
 *     restatement of what the researcher uploaded, so it goes in the label. A
 *     DERIVED statistic — a skew, a mean, a p-value — never does, at any
 *     precision. The engine is the one thing that reports those, and it reports
 *     them on post-filter, post-transform, post-exclusion rows; a second number
 *     on screen, measured over a different set of rows and quietly disagreeing,
 *     is worse than no number at all. The offer still has to be auditable, so
 *     it names the column and what is wrong with it, which is checkable against
 *     the descriptives once the analysis runs.
 *   - An accepted offer is an ORDINARY `SpecMutation`. There is no second code
 *     path: the researcher and the assistant propose from the same menu and
 *     land in the same dispatcher with origin "user", which is what stops the
 *     hand-edit side of Law 3 drifting away from the AI side.
 *
 * Nothing here decides anything. An offer is a proposal with its evidence
 * attached; accepting it is the researcher's edit, recorded as theirs.
 */

/* ── Thresholds ────────────────────────────────────────────────────────────*/

/**
 * |skew| ≥ 1 is the conventional "highly skewed" cut, and it is the point at
 * which a log rescue is worth raising rather than noise. Below it the offer
 * would fire on almost every assay column and stop meaning anything.
 */
const SKEW_THRESHOLD = 1

/** A level with fewer rows than this cannot carry a group comparison (§ two per group). */
const MIN_LEVEL_ROWS = 3

/** Above this a categorical column has stopped being something to group by. */
const HIGH_CARDINALITY = 12

/** Numeric-named columns below this are a coincidence, not a wide-format sheet. */
const MIN_WIDE_COLUMNS = 3

/**
 * The bar is a strip, not a panel. More than this and the offers stop reading
 * as suggestions and start reading as a to-do list the researcher is failing.
 *
 * ponytail: a flat cap, applied after ordering, so the pipeline-order-first
 * ranking decides what survives. Give it a "more" disclosure if researchers ask
 * for the ones that fell off.
 */
const MAX_OFFERS = 5

/** Level names that mean "this is the untreated arm". */
const CONTROL_LEVEL = /^(vehicle|control|ctrl|untreated|unstimulated|mock|dmso|baseline|blank|none|0)$/i

/* ── Profiling ─────────────────────────────────────────────────────────────*/

export interface PreparedColumn extends ColumnProfile {
  /** Fisher–Pearson skewness; null when the column is not numeric or n < 3. */
  skew: number | null
  /** Rows per level. Categorical and identifier columns only; empty otherwise. */
  levelCounts: Map<string, number>
}

/**
 * Every scan of the table happens here, exactly once.
 *
 * The caller memoises this on the table alone — NOT on the spec, which is
 * rebuilt whenever any style knob moves. Skew is an O(n) pass per numeric
 * column and level counting is another over the rows; hanging either off a
 * value that changes when a colour changes would put a full table scan on the
 * render path of a colour picker.
 */
export function profilePreparation(table: Table): PreparedColumn[] {
  return profileTable(table).map((profile) => {
    const raw = table.rows.map((r) => r.values[profile.column])

    let skew: number | null = null
    if (profile.type === "numeric") {
      const numbers = raw
        .map((v) => (typeof v === "number" ? v : Number(v)))
        .filter((n) => Number.isFinite(n))
      const s = skewness(numbers)
      skew = Number.isFinite(s) ? s : null
    }

    const levelCounts = new Map<string, number>()
    if (profile.type === "categorical" || profile.type === "identifier") {
      for (const v of raw) {
        if (v === null || v === undefined || v === "") continue
        const key = String(v)
        levelCounts.set(key, (levelCounts.get(key) ?? 0) + 1)
      }
    }

    return { ...profile, skew, levelCounts }
  })
}

/* ── Offers ────────────────────────────────────────────────────────────────*/

export interface PrepOffer {
  /** Stable across recomputes: it is the spec position the offer would occupy. */
  id: string
  /** The offer, naming the column and what is wrong with it. Shown on the chip. */
  label: string
  /** Why it is worth doing, for the chip's title/tooltip. */
  detail: string
  /** The ordinary mutation an acceptance dispatches. */
  mutation: SpecMutation
}

function hasTransformOn(spec: AnalysisSpec, kind: string, column: string): boolean {
  return spec.transforms.some(
    (t) => t.kind === kind && "column" in t && t.column === column
  )
}

/**
 * The operations the measurements warrant, best-placed-in-the-pipeline first.
 *
 * Pure and cheap: it reads the already-computed profiles and the spec, and
 * never touches `table.rows`. That is what lets it re-run on every spec change
 * while the scanning above runs only when the sheet does.
 */
export function prepOffers(spec: AnalysisSpec, prepared: PreparedColumn[]): PrepOffer[] {
  const offers: PrepOffer[] = []
  const columns = new Set(prepared.map((p) => p.column))
  const roleOf = new Map(spec.roles.map((r) => [r.column, r.role]))

  /* 1. Wide → long. Runs first because it changes the column set every later
        offer is phrased against, so proposing it alongside a log10 on a column
        that is about to be folded away would be proposing two futures at once. */
  const wide = prepared.filter((p) => p.type === "numeric" && /^\s*\d+\s*$/.test(p.column))
  const foldedAlready = spec.transforms.some((t) => t.kind === "pivotLonger")
  // ponytail: numeric headers only — the plate-reader fingerprint, and the one
  // wide shape that is unambiguous. A sheet whose wide columns are named
  // "Day 1".."Day 7" needs a shared-prefix rule; add it when one turns up.
  if (!foldedAlready && wide.length >= MIN_WIDE_COLUMNS && !columns.has("column") && !columns.has("value")) {
    const names = wide.map((p) => p.column)
    offers.push({
      id: "pivotLonger",
      label: `${names.length} columns named by number ("${names[0]}"…"${names[names.length - 1]}") — fold into one`,
      detail: `A plate export writes one column per plate column. Nothing below the resolver can read that shape until it is folded into ${names.length * spec.dataset.rowCount} rows of "column" and "value".`,
      mutation: {
        kind: "data.addTransform",
        transform: { kind: "pivotLonger", columns: names, namesTo: "column", valuesTo: "value" },
      },
    })
  }

  /* 2. Normalise to the on-plate control. Before the log, because "% of
        vehicle" is what the log is usually taken of. */
  const response =
    spec.analysis.responseColumns[0] ??
    prepared.find((p) => p.type === "numeric" && roleOf.get(p.column) === "response")?.column ??
    null
  if (response && !hasTransformOn(spec, "normaliseToControl", response)) {
    for (const p of prepared) {
      if (p.type !== "categorical") continue
      if (p.cardinality < 2 || p.cardinality > HIGH_CARDINALITY) continue
      const control = [...p.levelCounts.keys()].find((level) => CONTROL_LEVEL.test(level.trim()))
      if (!control) continue
      offers.push({
        id: `normaliseToControl:${p.column}:${control}`,
        label: `"${p.column}" has a "${control}" level in ${p.levelCounts.get(control)} rows — express "${response}" as % of it`,
        detail: `Normalising to the control on the same plate is what removes plate-to-plate drift; a raw signal carries it.`,
        mutation: {
          kind: "data.addTransform",
          transform: {
            kind: "normaliseToControl",
            column: response,
            groupColumn: p.column,
            controlLevel: control,
            per: [],
            as: "percent",
          },
        },
      })
      break
    }
  }

  /* 3. Log the skewed columns. */
  const skewed = prepared
    .filter(
      (p) =>
        p.skew !== null &&
        Math.abs(p.skew) >= SKEW_THRESHOLD &&
        p.numeric?.allPositive === true &&
        !hasTransformOn(spec, "log10", p.column) &&
        !hasTransformOn(spec, "ln", p.column)
    )
    .sort((a, b) => Math.abs(b.skew!) - Math.abs(a.skew!))
    .slice(0, 2)
  for (const p of skewed) {
    // The tail direction, not the skew value. The pre-flight number is measured
    // over the RAW sheet, so it can never agree with the engine's descriptive
    // skew, which is measured over the rows that survive the pipeline — and
    // this offer is precisely a proposal to change that pipeline, so quoting a
    // pre-transform figure beside "take log10" would be quoting the quantity
    // the researcher is about to make obsolete. Direction and "past the cut"
    // are what motivate the offer; the value is the engine's to report.
    const tail = p.skew! > 0 ? "right" : "left"
    offers.push({
      id: `log10:${p.column}`,
      label: `"${p.column}" is strongly ${tail}-tailed — take log10`,
      detail: `A pre-flight scan of the raw sheet puts "${p.column}" past the conventional |skew| ≥ ${SKEW_THRESHOLD} cut, where a test assuming a symmetric distribution stops being the right test. The skew itself is reported by the engine, in the descriptives, over the rows the analysis actually uses. Every value is positive, so log10 is defined across the column.`,
      mutation: { kind: "data.addTransform", transform: { kind: "log10", column: p.column } },
    })
  }

  /* 4. Gaps. One offer, not one per column: the strategy is a single setting. */
  if (spec.analysis.missingValues === "listwise") {
    const gappy = prepared
      .filter((p) => p.type === "numeric" && p.missing > 0)
      .sort((a, b) => b.missing - a.missing)[0]
    if (gappy) {
      const total = gappy.missing + gappy.count
      offers.push({
        id: "missingValues",
        label: `"${gappy.column}" is missing ${gappy.missing} of ${total} values — impute the median instead of dropping the rows`,
        detail: `Listwise deletion drops the whole row, so ${gappy.missing} gaps in one column cost every other measurement on those rows too.`,
        mutation: { kind: "analysis.setMissingValues", value: "median-impute" },
      })
    }
  }

  /* 5. Rare levels. */
  for (const p of prepared) {
    if (p.type !== "categorical" || p.cardinality <= HIGH_CARDINALITY) continue
    if (spec.filters.some((f) => f.column === p.column)) continue
    const kept = [...p.levelCounts.entries()]
      .filter(([, n]) => n >= MIN_LEVEL_ROWS)
      .map(([level]) => level)
    const dropped = p.cardinality - kept.length
    if (kept.length === 0 || dropped === 0) continue
    // ponytail: keep-the-replicated, not merge-into-"Other". The spec's row
    // filters can express the first and nothing in the Transform union can
    // express the second; a new member would be a schema change, not a control.
    const filters: RowFilter[] = [
      ...spec.filters,
      { column: p.column, op: "in", value: kept },
    ]
    offers.push({
      id: `rareLevels:${p.column}`,
      label: `"${p.column}" has ${p.cardinality} levels, ${dropped} with fewer than ${MIN_LEVEL_ROWS} rows — keep the ${kept.length} that are replicated`,
      detail: `A level with one or two rows has no spread to compare, so it contributes a group the test cannot describe.`,
      mutation: { kind: "data.setFilters", filters },
    })
    break
  }

  return offers.slice(0, MAX_OFFERS)
}
