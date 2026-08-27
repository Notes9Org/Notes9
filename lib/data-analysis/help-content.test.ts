/**
 * The manual has to keep up with the software.
 *
 * A help centre that documents nine of eleven tests is worse than none for the
 * two it misses, because a reader who finds the other nine assumes the omission
 * means something. These assertions are what make adding a test to the picker
 * fail the build until it is also explained.
 */
import { describe, expect, it } from "vitest"
import {
  HELP_ENTRIES,
  HELP_SECTIONS,
  findHelpEntry,
  searchHelp,
} from "@/lib/data-analysis/help-content"

describe("structure", () => {
  it("gives every entry a unique id", () => {
    const ids = HELP_ENTRIES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("gives every entry a title, a summary and at least one paragraph", () => {
    for (const entry of HELP_ENTRIES) {
      expect(entry.title.length, entry.id).toBeGreaterThan(0)
      expect(entry.summary.length, entry.id).toBeGreaterThan(0)
      expect(entry.body.length, entry.id).toBeGreaterThan(0)
      for (const p of entry.body) expect(p.trim().length, entry.id).toBeGreaterThan(0)
    }
  })

  it("has no empty sections", () => {
    for (const s of HELP_SECTIONS) expect(s.entries.length, s.id).toBeGreaterThan(0)
  })
})

describe("coverage of what the software can do", () => {
  // The tests the quick statistics panel offers, by the name it shows.
  const PANEL_TESTS = [
    "One-sample t-test",
    "Unpaired t-test (Student)",
    "Unpaired t-test (Welch)",
    "Paired t-test",
    "One-way ANOVA",
    "Mann–Whitney U",
    "Wilcoxon signed-rank",
    "Kruskal–Wallis",
    "Pearson correlation",
    "Spearman correlation",
  ]

  it.each(PANEL_TESTS)("explains %s", (name) => {
    const hay = HELP_ENTRIES.map((e) => `${e.title} ${e.summary} ${e.body.join(" ")}`).join(" ")
    expect(hay).toContain(name.split(" (")[0])
  })

  const CHART_TYPES = ["Bar", "Line", "Scatter", "Box", "Violin", "Histogram", "Pie", "Kaplan", "Forest", "3D"]
  it.each(CHART_TYPES)("explains the %s chart", (kind) => {
    const charts = HELP_SECTIONS.find((s) => s.id === "charts")!
    const hay = charts.entries.map((e) => `${e.title} ${e.body.join(" ")}`).join(" ")
    expect(hay).toContain(kind)
  })

  const DETECTORS = ["Grubbs", "Duplicate", "replicates", "one value", "numeric column"]
  it.each(DETECTORS)("explains the %s check", (name) => {
    const quality = HELP_SECTIONS.find((s) => s.id === "quality")!
    const hay = quality.entries.map((e) => `${e.title} ${e.summary} ${e.body.join(" ")}`).join(" ")
    expect(hay.toLowerCase()).toContain(name.toLowerCase())
  })

  it("covers the fit models the curve panel offers", () => {
    const curves = HELP_SECTIONS.find((s) => s.id === "curves")!
    const hay = curves.entries.map((e) => e.body.join(" ")).join(" ")
    for (const model of ["4PL", "5PL", "Michaelis–Menten", "Boltzmann", "Gaussian"]) {
      expect(hay).toContain(model)
    }
  })
})

describe("honesty", () => {
  it("states the audit trail's limitation rather than only its capability", () => {
    const entry = findHelpEntry("record-history")!
    expect(entry.body.join(" ")).toMatch(/does not tell you the order/i)
  })

  it("says a p-value is not the probability there is no effect", () => {
    const entry = findHelpEntry("tests-pvalue")!
    expect(entry.body.join(" ")).toMatch(/not the probability that there is no effect/i)
  })

  it("warns that Pearson misses curved relationships", () => {
    expect(findHelpEntry("tests-pearson")!.body.join(" ")).toMatch(/curved relationship/i)
  })

  it("says which changes are made without asking, and which never are, IN TEXT", () => {
    // Deliberately not satisfied by the diagram beside it. A reader using a
    // screen reader gets the diagram's one-line label and nothing else, and
    // this is the paragraph that says what the software will do to their data
    // without asking — the last thing that should be available only visually.
    const entry = findHelpEntry("journey-nothing-automatic")!
    const text = [entry.body.join(" "), ...(entry.facts ?? []).map((f) => `${f.label} ${f.value}`)].join(" ")
    expect(text).toMatch(/Never applied for you/i)
    expect(text).toMatch(/outliers/i)
  })
})

describe("searchHelp", () => {
  it("finds an entry by a word in its body", () => {
    expect(searchHelp("grubbs").map((e) => e.id)).toContain("quality-outliers")
  })

  it("finds an entry by a keyword that does not appear in the prose", () => {
    // "pseudoreplication" is a keyword on the replicates entry, not a word in it.
    expect(searchHelp("pseudoreplication").map((e) => e.id)).toContain("quality-replicates")
  })

  it("requires every term to match, so two words narrow rather than widen", () => {
    const one = searchHelp("test")
    const two = searchHelp("test paired")
    expect(two.length).toBeLessThanOrEqual(one.length)
  })

  it("returns nothing for an empty query rather than everything", () => {
    expect(searchHelp("")).toEqual([])
    expect(searchHelp("   ")).toEqual([])
  })

  it("is case-insensitive", () => {
    expect(searchHelp("WELCH").length).toBeGreaterThan(0)
  })
})

describe("findHelpEntry", () => {
  it("returns null for an unknown id rather than throwing", () => {
    expect(findHelpEntry("nope")).toBeNull()
  })
})
