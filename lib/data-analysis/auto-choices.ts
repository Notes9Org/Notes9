/**
 * What Notes9 decided for you, and why.
 *
 * A researcher attaching a file gets a chart with axes already chosen, a test
 * already selected, columns already assigned roles, and rows already excluded
 * from the header block — none of which they asked for, and all of which change
 * the number at the end. The reasoning behind every one of those decisions was
 * already being computed and then dropped on the floor:
 *
 *   - `inferRoles` returns a `rationale` per column ("47 repeating labels,
 *     which is the shape of a grouping column"), and `specFromTable` strips it
 *     with `roles.map(({ rationale: _r, ...role }) => role)`;
 *   - `inferDesign` returns one too, stripped on the very next line;
 *   - `detectHeader` returns a `rationale` that only ever surfaced inside a
 *     failure message;
 *   - `suggestAxes` returns `evidence` that reached one dismissible offer chip.
 *
 * So this is not new inference. It is the inference that already runs, gathered
 * into one record a person can read — which is the difference between a tool
 * that made a choice and a tool that can be checked.
 *
 * Pure, and free of React, so the claims are testable without rendering
 * anything.
 */
import type { AnalysisSpec, TestKind } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { inferDesign, inferRoles, legalTests, type TestCapability } from "@/lib/data-analysis/semantic/infer"

/** How a decision came about. */
export type ChoiceOrigin =
  /** Notes9 worked it out from the data. */
  | "inferred"
  /** The researcher said so. */
  | "user"
  /** The experiment record in the project said so. */
  | "record"

export interface AutoChoice {
  id: string
  /** The decision, e.g. "X axis". */
  what: string
  /** What was decided, e.g. "Concentration (pg/mL)". */
  choice: string
  /** Why, in the researcher's terms. Never a bare assertion. */
  why: string
  origin: ChoiceOrigin
  /** Where the value lives in the sheet, when it has a location. */
  where?: string
}

/** Plain names for the tests the spec engine can name. */
const TEST_LABEL: Partial<Record<TestKind, string>> = {
  none: "No test",
  descriptives: "Descriptive statistics",
  normality: "Normality check",
  "t-one-sample": "One-sample t-test",
  "t-unpaired": "Unpaired t-test (Student)",
  "t-welch": "Unpaired t-test (Welch)",
  "t-paired": "Paired t-test",
  "mann-whitney": "Mann–Whitney U",
  "wilcoxon-signed-rank": "Wilcoxon signed-rank",
  "kruskal-wallis": "Kruskal–Wallis",
  friedman: "Friedman",
  "anova-one-way": "One-way ANOVA",
  "anova-two-way": "Two-way ANOVA",
  "anova-rm": "Repeated-measures ANOVA",
  "mixed-effects": "Mixed-effects model",
  "correlation-pearson": "Pearson correlation",
  "correlation-spearman": "Spearman correlation",
  "linear-regression": "Linear regression",
  "nonlinear-regression": "Non-linear regression",
  "kaplan-meier": "Kaplan–Meier survival",
  "chi-square": "Chi-square",
  "fisher-exact": "Fisher's exact test",
}

export function testLabel(test: TestKind): string {
  return TEST_LABEL[test] ?? test
}

/**
 * Why a test is the design's own answer.
 *
 * `TestCapability.reason` is populated only when a test is ILLEGAL — it is the
 * "why not". There is no "why yes" anywhere in the engine, so it is composed
 * here from the two facts that actually drove the choice: the design the file
 * reads as, and the number of groups being compared. That keeps the sentence
 * true to the mechanism rather than a restatement of the test's own name.
 */
export function whyThisTest(
  test: TestKind,
  design: { kind?: string; factors?: unknown[]; paired?: boolean } | null,
  groupCount: number
): string {
  const groups =
    groupCount <= 1
      ? "a single group"
      : groupCount === 2
        ? "two groups"
        : `${groupCount} groups`
  const paired = design?.paired ? ", measured on the same subjects" : ""
  switch (test) {
    case "none":
      return "Nothing in the data points at a particular test, so none was chosen. Pick one yourself, or set the column roles so the design is clear."
    case "descriptives":
      return "There is a numeric measurement but no comparison to make, so the data is summarised rather than tested."
    case "correlation-pearson":
    case "correlation-spearman":
    case "linear-regression":
      return "Two numeric measurements with no grouping between them — the question the shape supports is whether they move together."
    case "nonlinear-regression":
      return "A concentration against a signal, which is a curve to be fitted rather than groups to be compared."
    case "kaplan-meier":
      return "A time column and an event column, which is the shape of a survival analysis."
    case "chi-square":
    case "fisher-exact":
      return "The measurement is counts falling into categories rather than a numeric value per subject."
    default:
      return `The data reads as ${groups}${paired} of one numeric measurement, and this is the test that design supports.`
  }
}

export interface AutoChoicesInput {
  spec: AnalysisSpec | null
  table: Table
  /** How the sheet was read, for the region line. */
  planRationale: string | null
  /** A1 range of the data block, when known. */
  dataRange: string | null
  /** The axis columns currently in force. */
  xKey: string
  yKeys: string[]
  /** `suggestAxes`' own sentence, when it produced one. */
  axisEvidence: string | null
  /** Cell ranges per axis column, resolved by the caller against the plan. */
  rangeFor?: (column: string) => string | undefined
}

/**
 * Everything that was decided for this sheet, in the order it was decided.
 *
 * Region first, because every later choice is about the cells it named; then
 * the column roles, which drive the design; then the design; then the axes and
 * the test that fall out of it. Reading top to bottom is reading the pipeline.
 */
export function describeAutoChoices(input: AutoChoicesInput): AutoChoice[] {
  const { spec, table, planRationale, dataRange, xKey, yKeys, axisEvidence, rangeFor } = input
  const out: AutoChoice[] = []

  if (planRationale) {
    out.push({
      id: "region",
      what: "Data region",
      choice: dataRange
        ? `${dataRange} · ${table.columns.length} column${table.columns.length === 1 ? "" : "s"} · ${table.rows.length} row${table.rows.length === 1 ? "" : "s"}`
        : `${table.columns.length} columns · ${table.rows.length} rows`,
      why: planRationale,
      origin: "inferred",
      where: dataRange ?? undefined,
    })
  }

  if (!spec) return out

  // Re-run the role inference to recover the per-column rationale the spec
  // strips. Pure and cheap; the alternative is widening `AnalysisSpec` to carry
  // prose it has no other use for.
  const inferred = inferRoles(table, spec.roles)
  for (const role of inferred) {
    if (role.role === "ignore") continue
    out.push({
      id: `role:${role.column}`,
      what: roleLabel(role.role),
      choice: role.column,
      why: role.rationale,
      origin: role.source === "user" ? "user" : role.rationale.includes("experiment record") ? "record" : "inferred",
      where: rangeFor?.(role.column),
    })
  }

  const design = inferDesign(table, spec.roles, spec.design)
  if (design.rationale) {
    out.push({
      id: "design",
      what: "Design",
      choice: describeDesign(design),
      why: design.rationale,
      origin: spec.design?.source === "user" ? "user" : "inferred",
    })
  }

  if (xKey) {
    out.push({
      id: "axis-x",
      what: "X axis",
      choice: xKey,
      why: axisEvidence ?? "The column the analysis treats as the thing that was varied.",
      origin: "inferred",
      where: rangeFor?.(xKey),
    })
  }
  for (const y of yKeys) {
    out.push({
      id: `axis-y:${y}`,
      what: "Y axis",
      choice: y,
      why: axisEvidence ?? "A measured response column.",
      origin: "inferred",
      where: rangeFor?.(y),
    })
  }

  const test = spec.analysis.test
  const capabilities: TestCapability[] = legalTests(spec, table)
  const groupColumn = spec.analysis.groupColumn
  const groupCount = groupColumn
    ? new Set(table.rows.map((r) => String(r.values[groupColumn] ?? ""))).size
    : 0
  out.push({
    id: "test",
    what: "Statistical test",
    choice: testLabel(test),
    why: whyThisTest(test, spec.design as never, groupCount),
    origin: "inferred",
  })

  // Named alternatives, so the choice reads as one of several rather than the
  // only thing the tool knows how to do.
  const alternatives = capabilities
    .filter((c) => c.legal && c.test !== test && c.test !== "descriptives" && c.test !== "normality")
    .map((c) => testLabel(c.test))
  if (alternatives.length > 0) {
    out.push({
      id: "test-alternatives",
      what: "Other tests this data allows",
      choice: alternatives.join(", "),
      why: "Each of these is legal for this design. Choosing between them is a judgement about your experiment, not about the data's shape, so none is picked for you.",
      origin: "inferred",
    })
  }

  return out
}

function roleLabel(role: string): string {
  switch (role) {
    case "response":
      return "Measured response"
    case "group":
      return "Grouping column"
    case "treatment":
      return "Treatment"
    case "time":
      return "Time"
    case "subject":
      return "Subject"
    case "covariate":
      return "Covariate"
    default:
      return role
  }
}

function describeDesign(design: { kind?: string; paired?: boolean; factors?: unknown[] }): string {
  const parts: string[] = []
  if (design.kind) parts.push(String(design.kind).replace(/-/g, " "))
  if (design.paired) parts.push("paired")
  return parts.length > 0 ? parts.join(" · ") : "not determined"
}
