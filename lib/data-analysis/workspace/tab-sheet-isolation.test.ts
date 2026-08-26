/**
 * One analysis tab must never be handed another's sheet.
 *
 * `liveSheetRef` is a single ref serving whichever Univer instance mounts next
 * — it exists because a remount (maximize, dock toggle, compact change) reads
 * its snapshot at mount time, and the React state carrying the same bytes lands
 * a microtask later. That makes it correct for remounts and dangerous across
 * tabs: pointed at the departing tab's edited workbook, the next mount shows
 * those edits under a different analysis, with nothing on screen to say the
 * sheet changed.
 *
 * These are source-level assertions rather than a render test because the
 * failure is an ordering one between a ref write and a state update, which a
 * render test can pass while the real sequence is wrong. What is pinned is that
 * every path which changes WHICH analysis is active also re-points the ref.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SRC = readFileSync(
  join(process.cwd(), "components/data-analysis/data-analysis-workspace.tsx"),
  "utf-8"
)

/** The body of a top-level `const <name> = useCallback(` declaration. */
function callbackBody(name: string): string {
  const start = SRC.indexOf(`const ${name} = useCallback(`)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  const end = SRC.indexOf("\n  )", start)
  return SRC.slice(start, end)
}

describe("switching tabs", () => {
  const body = callbackBody("switchAnalysis")

  it("re-points the across-remount ref even when the remount is skipped", () => {
    // The skip is deliberate: two tabs made by Duplicate share one snapshot by
    // reference, and remounting Univer for an unchanged sheet throws away the
    // cursor. The ref still has to move.
    expect(body).toMatch(/else\s*\{[\s\S]*liveSheetBoxRef\.current = \{ current: target\.snapshot/)
  })

  it("loads the target's own snapshot when it differs", () => {
    expect(body).toMatch(/loadSnapshotRef\.current\(target\.snapshot/)
  })
})

describe("capturing the tab being left", () => {
  const body = callbackBody("captureActive")

  it("reads the ref before the state, so an edit is not lost on a fast switch", () => {
    // `setLiveSnapshot` is a microtask behind the ref and its autosave is
    // debounced; capturing state alone drops the most recent edit.
    expect(body).toMatch(/snapshot:\s*\(liveSheetBoxRef\.current\.current[^)]*\)\s*\?\?\s*liveRef\.current/)
  })
})

describe("every path that installs a different workbook resets the ref", () => {
  // `loadSnapshot` is the swap door; the report writers install directly.
  it.each([
    ["loadSnapshot", "liveSheetBoxRef.current = { current: snap"],
    ["addCurveSheet", "liveSheetBoxRef.current = { current: next"],
  ])("%s", (name, assignment) => {
    const start = SRC.indexOf(`const ${name} = useCallback(`)
    expect(start, `${name} not found`).toBeGreaterThan(-1)
    const body = SRC.slice(start, SRC.indexOf("\n  )", start))
    expect(body).toContain(assignment)
  })

  it("the statistics writer resets it too", () => {
    const start = SRC.indexOf("const addStatsSheet = useCallback(")
    expect(start).toBeGreaterThan(-1)
    const body = SRC.slice(start, SRC.indexOf("\n  )", start))
    expect(body).toContain("liveSheetBoxRef.current = { current: next")
  })
})

describe("the box is replaced, never mutated, when the workbook changes", () => {
  // The whole point: a departing Univer instance's teardown writes into the box
  // it was MOUNTED with. If an install mutated one shared box instead of
  // handing out a new one, that teardown would overwrite the newly imported
  // workbook with the old sheet — which is precisely what made importing a
  // second file silently re-open the first.
  it("hands out a fresh box on every install rather than assigning .current", () => {
    const installs = SRC.split("\n").filter((l) => l.includes("liveSheetBoxRef.current ="))
    expect(installs.length).toBeGreaterThan(0)
    for (const line of installs) {
      expect(line, `mutating install: ${line.trim()}`).toMatch(/liveSheetBoxRef\.current = \{ current:/)
    }
  })

  it("never assigns through the box's own current from the workspace", () => {
    // `liveSheetBoxRef.current.current = ...` would be a mutation wearing the
    // new-box syntax's clothes.
    expect(SRC).not.toMatch(/liveSheetBoxRef\.current\.current\s*=[^=]/)
  })
})

describe("the Univer host captures its box at mount", () => {
  const VIEW = readFileSync(
    join(process.cwd(), "components/spreadsheet/univer-workbook-view.tsx"),
    "utf-8"
  )

  it("reads the box once inside mount, not at write time", () => {
    // Reading `latestSnapshotRefRef.current` inside the teardown would find the
    // NEW box and clobber it, which is the bug this shape exists to prevent.
    expect(VIEW).toMatch(/const box = latestSnapshotRefRef\.current \?\? null/)
    expect(VIEW).toMatch(/const rememberLatest = \(snapshot[\s\S]{0,140}box\.current = snapshot/)
  })

  it("has no module-level rememberLatest that could outlive a mount", () => {
    const outside = VIEW.slice(0, VIEW.indexOf("const mount = async"))
    expect(outside).not.toContain("const rememberLatest")
  })
})

describe("the ref is never read as the source of truth for rendering", () => {
  it("is not passed to snapshotToTable", () => {
    // The table must derive from state, so React re-renders when it changes.
    // Reading the ref here would give a table that silently lags the sheet.
    expect(SRC).not.toMatch(/snapshotToTable\(\s*liveSheetRef/)
  })
})
