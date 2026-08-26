/**
 * What to plot, and what to call it, read off the inferred semantic roles.
 *
 * T0.4 closed three gaps that all lived here:
 *
 *  - The axis suggestion ignored inference. It took `table.columns[0]` for x
 *    and the first two numeric columns for y while `inferRoles` sat unused a
 *    few lines away, so a sheet whose first column is "Well" offered to plot
 *    well ids against absorbance.
 *  - Detected units never reached the figure. `ColumnProfile.unit` parses
 *    "Concentration (pg/mL)" into a unit and `ColumnRole.unit` carries it, but
 *    `figure.x.unit` came only from a rail text box nobody had typed in.
 *  - The axis defaults were hardcoded ELISA strings and nothing reset them per
 *    dataset, so a bacterial growth sheet rendered titled "ELISA standard
 *    curve" with a y axis labelled "OD450". Those strings are gone; the labels
 *    below are what a dataset says about itself.
 *
 * Pure, and out of the workspace component, because "which column is the
 * independent variable" is the claim worth a test — not the JSX around it.
 */

import type { Table } from "@/lib/data-analysis/engine/resolver"
import type { ColumnRole, VariableRole } from "@/lib/data-analysis/spec/analysis-spec"

/**
 * Independent-variable preference, strongest first.
 *
 * Time beats dose beats group for the x axis because that is the order in which
 * a bench sheet means "this is what I varied": a timecourse is a timecourse
 * even when it also has treatment groups, and those become series rather than
 * the axis.
 */
const X_ROLE_ORDER: VariableRole[] = ["time", "treatment", "group", "covariate", "subject"]

export interface AxisSuggestion {
  x: string
  y: string[]
  /** The axis titles and units the chosen columns imply. */
  xLabel: string
  xUnit: string
  yLabel: string
  yUnit: string
  /** Plain-language reason, shown to the researcher before they accept. */
  evidence: string
  /** False when no role earned the choice and this fell back to sheet order. */
  fromRoles: boolean
}

/** The unit a role carries for a column, as the rail's empty-string convention. */
export function unitForColumn(roles: ColumnRole[], column: string): string {
  return roles.find((r) => r.column === column)?.unit ?? ""
}

/**
 * The axis title a column implies.
 *
 * The unit is stripped, because the spec holds label and unit apart and the
 * renderer puts them back together — leaving "Concentration (pg/mL)" as the
 * label would draw the unit twice.
 */
export function labelForColumn(column: string): string {
  return column.replace(/\s*[([][^)\]]*[)\]]\s*$/, "").trim() || column
}

function describe(role: VariableRole): string {
  switch (role) {
    case "time":
      return "a time variable"
    case "treatment":
      return "the treatment or dose"
    case "group":
      return "the grouping variable"
    case "covariate":
      return "a covariate"
    case "subject":
      return "the subject identifier"
    default:
      return `the ${role}`
  }
}

/**
 * @param table       the sheet as the engine sees it
 * @param roles       inferred (or corrected) roles for its columns
 * @param numericCols the columns that hold numbers, in sheet order
 */
export function suggestAxes(
  table: { columns: string[] } | Table,
  roles: ColumnRole[],
  numericCols: string[],
): AxisSuggestion | null {
  const columns = table.columns
  if (columns.length === 0) return null

  const roleOf = new Map(roles.map((r) => [r.column, r.role]))
  const present = (c: string) => columns.includes(c)

  // x: the highest-preference role actually present on this sheet.
  let x: string | null = null
  let xRole: VariableRole | null = null
  for (const want of X_ROLE_ORDER) {
    const found = roles.find((r) => r.role === want && present(r.column))
    if (found) {
      x = found.column
      xRole = want
      break
    }
  }

  // y: every response column, capped at two so the offer stays a sentence.
  let y = roles.filter((r) => r.role === "response" && present(r.column) && r.column !== x).map((r) => r.column).slice(0, 2)

  const fromRoles = x !== null && y.length > 0
  if (!fromRoles) {
    // Nothing was inferred with any confidence — a sheet of "Col1, Col2, Col3",
    // or one where every numeric column reads as a response and none as the
    // thing that was varied. Fall back to the conventional guess rather than
    // offering nothing, and say so in the evidence, because a guess presented
    // as an inference is worse than a guess.
    x = x ?? columns[0]
    // Re-filtered AFTER the fallback picked x: the exclusion above ran while x
    // was still null, so on a sheet of all-response columns the leftmost one
    // ended up on BOTH axes.
    y = y.filter((c) => c !== x)
    if (y.length === 0) y = numericCols.filter((c) => c !== x).slice(0, 2)
  }
  if (!x || y.length === 0) return null

  const evidence = fromRoles
    ? `"${x}" was inferred as ${describe(xRole as VariableRole)} and ${y.map((c) => `"${c}"`).join(" and ")} as the measured response${y.length === 1 ? "" : "s"}. Correct any of these in Column roles.`
    : `"${x}" is the sheet's leftmost column and ${y.length === 1 ? "is" : "are"} the first ${y.length} numeric column${y.length === 1 ? "" : "s"} after it — the conventional axis guess, not an inference.`

  return {
    x,
    y,
    xLabel: labelForColumn(x),
    xUnit: unitForColumn(roles, x),
    yLabel: labelForColumn(y[0]),
    yUnit: unitForColumn(roles, y[0]),
    evidence,
    fromRoles,
  }
}
