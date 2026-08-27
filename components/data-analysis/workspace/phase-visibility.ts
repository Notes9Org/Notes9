/**
 * Which workspace phases are offered, as a function rather than an inline
 * filter.
 *
 * The rule lives here, out of a 5000-line component, so that the thing that
 * once went wrong — a phase quietly dropped from the list in a refactor about
 * something else — is a line in a test rather than a line in a `filter`.
 *
 * The Plate tab is gone, and gone properly rather than switched off. It was
 * previously disabled in code while the standard curve still read its layout to
 * decide which wells were standards, so the curve panel pointed at a tab
 * nothing could reach. Removing the view therefore meant removing the
 * dependency: the curve now takes its standards from the sheet's columns and
 * only from there. A capability went with it — painting well roles onto a plate
 * map — and that is a deliberate trade, not an oversight.
 */

export type PhaseId = "chart" | "stats" | "curve" | "workspace"

export interface PhaseVisibilityInput {
  /** `detectDataKind`'s read of the sheet. */
  detected: { standardCurve?: boolean }
  /** The figure kind the spec currently names, when there is a spec. */
  figureKind?: string | null
  /** The test the spec currently names, when there is a spec. */
  testKind?: string | null
  /** The researcher pinned the standard curve; pinning sticks (Tier 1.3). */
  curvePinned: boolean
}

/**
 * Standard curve is the one phase with a structural precondition: it needs
 * standards (a known concentration against a signal) before it can fit
 * anything, so offering it on a sheet that has none is offering a dead end.
 * Three independent signals earn it:
 *
 *   structure - a concentration-like column beside a signal column, or a
 *               numeric column whose ratios form a serial dilution;
 *   intent    - the chart or the test already asks for a fit, so the panel that
 *               performs it should be reachable;
 *   memory    - pinned, and pinning sticks.
 *
 * Everything else is offered outright. Hiding a view you have used because the
 * next sheet looks different is worse than one tab too many.
 */
export function isPhaseVisible(phase: PhaseId, input: PhaseVisibilityInput): boolean {
  if (phase !== "curve") return true
  return (
    input.detected.standardCurve === true ||
    input.figureKind === "dose-response" ||
    input.testKind === "nonlinear-regression" ||
    input.curvePinned
  )
}

export function visiblePhaseIds(phases: PhaseId[], input: PhaseVisibilityInput): PhaseId[] {
  return phases.filter((p) => isPhaseVisible(p, input))
}
