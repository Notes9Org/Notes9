import { describe, it, expect } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import {
  defaultGroupColumn,
  inferDesign,
  inferRoles,
  legalTests,
  offerableTests,
  profileColumn,
} from "./infer"

function table(columns: string[], rows: Record<string, number | string | null>[]): Table {
  return {
    columns,
    rows: rows.map((values, i) => ({ rowId: `r${i + 1}`, values })),
  }
}

function spec(overrides: Record<string, unknown> = {}): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "d.xlsx",
      sheet: null,
      versionHash: "sha256:abc",
      rowCount: 6,
      columnCount: 3,
    },
    design: { source: "inferred" },
    analysis: { test: "none" },
    figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd" },
    export: {},
    ...overrides,
  })
  if (!parsed.ok) throw new Error("fixture invalid: " + JSON.stringify(parsed.issues))
  return parsed.spec
}

/* Between-subjects: three doses, eight wells each, nothing repeated. */
const UNPAIRED = table(
  ["Well", "Treatment", "Viability (%)"],
  ["Vehicle", "10 uM", "50 uM"].flatMap((t, gi) =>
    Array.from({ length: 8 }, (_, i) => ({
      Well: `${"ABC"[gi]}${i + 1}`,
      Treatment: t,
      "Viability (%)": 90 - gi * 20 + i,
    }))
  )
)

/* Same six mice measured before and after. */
const PAIRED = table(
  ["Mouse", "Timepoint", "Tumour volume"],
  ["Before", "After"].flatMap((t) =>
    Array.from({ length: 6 }, (_, i) => ({
      Mouse: `M${i + 1}`,
      Timepoint: t,
      "Tumour volume": t === "Before" ? 100 + i : 60 + i,
    }))
  )
)

/* Same six donors at three timepoints. */
const REPEATED = table(
  ["Donor", "Day", "Signal"],
  ["D0", "D7", "D14"].flatMap((d, di) =>
    Array.from({ length: 6 }, (_, i) => ({
      Donor: `P${i + 1}`,
      Day: d,
      Signal: 10 + di * 5 + i,
    }))
  )
)

describe("column profiling", () => {
  it("reads the unit out of the header, not the cells", () => {
    expect(profileColumn("Viability (%)", [90, 80]).unit).toBe("%")
    expect(profileColumn("Conc [ng/mL]", [1, 2]).unit).toBe("ng/mL")
    expect(profileColumn("Signal", [1, 2]).unit).toBeNull()
  })

  it("does not mistake an annotation for a unit", () => {
    expect(profileColumn("Viability (n = 8)", [90, 80]).unit).toBeNull()
    expect(profileColumn("Signal (mean)", [1, 2]).unit).toBeNull()
  })

  it("calls a column of distinct integers an identifier, not a measurement", () => {
    const p = profileColumn("Sample ID", [1, 2, 3, 4, 5, 6])
    expect(p.type).toBe("identifier")
  })

  it("still calls repeated integers numeric", () => {
    const p = profileColumn("Count", [3, 3, 4, 5, 4, 3])
    expect(p.type).toBe("numeric")
    expect(p.numeric?.allIntegers).toBe(true)
  })

  it("treats a date column as a date rather than a number", () => {
    expect(profileColumn("Run date", ["2026-01-02", "2026-01-03"]).type).toBe("datetime")
  })
})

describe("role inference", () => {
  it("finds the grouping column and the response", () => {
    const roles = inferRoles(UNPAIRED)
    const byColumn = Object.fromEntries(roles.map((r) => [r.column, r.role]))
    expect(byColumn["Treatment"]).toBe("treatment")
    expect(byColumn["Viability (%)"]).toBe("response")
    expect(byColumn["Well"]).toBe("ignore")
  })

  it("carries the unit onto the response role", () => {
    const roles = inferRoles(UNPAIRED)
    expect(roles.find((r) => r.column === "Viability (%)")?.unit).toBe("%")
  })

  it("recognises a subject column by name", () => {
    const roles = inferRoles(PAIRED)
    expect(roles.find((r) => r.column === "Mouse")?.role).toBe("subject")
  })

  it("recognises a subject structurally when the name says nothing", () => {
    // "Ferret" is not in any pattern; only the crossing structure reveals it.
    const anonymous = table(
      ["Ferret", "Arm", "Reading"],
      ["A", "B"].flatMap((a) =>
        Array.from({ length: 5 }, (_, i) => ({ Ferret: `x${i}`, Arm: a, Reading: i + (a === "A" ? 0 : 10) }))
      )
    )
    expect(inferRoles(anonymous).find((r) => r.column === "Ferret")?.role).toBe("subject")
  })

  it("never re-guesses a role the user set (§6.2)", () => {
    const roles = inferRoles(UNPAIRED, [
      { column: "Well", role: "subject", unit: null, source: "user", confidence: null },
    ])
    const well = roles.find((r) => r.column === "Well")!
    expect(well.role).toBe("subject")
    expect(well.source).toBe("user")
  })

  it("marks every guess with a confidence so the UI can show it is a guess", () => {
    for (const role of inferRoles(UNPAIRED)) {
      expect(role.source).toBe("inferred")
      expect(role.confidence).toBeGreaterThan(0)
      expect(role.rationale.length).toBeGreaterThan(0)
    }
  })
})

describe("design detection", () => {
  it("reads independent wells as unpaired", () => {
    const design = inferDesign(UNPAIRED, inferRoles(UNPAIRED))
    expect(design.paired).toBe(false)
    expect(design.repeatedMeasures).toBe(false)
  })

  it("reads two timepoints on the same animals as paired", () => {
    const design = inferDesign(PAIRED, inferRoles(PAIRED))
    expect(design.paired).toBe(true)
    expect(design.repeatedMeasures).toBe(false)
    expect(design.subjectColumn).toBe("Mouse")
  })

  it("reads three timepoints on the same donors as repeated measures", () => {
    const design = inferDesign(REPEATED, inferRoles(REPEATED))
    expect(design.repeatedMeasures).toBe(true)
    expect(design.paired).toBe(false)
    expect(design.subjectColumn).toBe("Donor")
  })

  it("does not claim pairing when a subject is missing a condition", () => {
    const ragged = table(
      ["Mouse", "Timepoint", "Volume"],
      [
        { Mouse: "M1", Timepoint: "Before", Volume: 100 },
        { Mouse: "M1", Timepoint: "After", Volume: 60 },
        { Mouse: "M2", Timepoint: "Before", Volume: 110 },
        // M2 has no "After" row: the design is not cleanly paired.
        { Mouse: "M3", Timepoint: "After", Volume: 70 },
      ]
    )
    expect(inferDesign(ragged, inferRoles(ragged)).paired).toBe(false)
  })

  it("never overrides a design the user declared", () => {
    const design = inferDesign(UNPAIRED, inferRoles(UNPAIRED), {
      paired: true,
      repeatedMeasures: false,
      subjectColumn: "Well",
      nesting: [],
      replicateType: "biological",
      source: "user",
      recordMismatch: null,
    })
    expect(design.paired).toBe(true)
    expect(design.source).toBe("user")
  })
})

describe("capability matrix", () => {
  function capabilityFor(t: Table) {
    const roles = inferRoles(t)
    const design = inferDesign(t, roles)
    const groupColumn = defaultGroupColumn(roles)
    const s = spec({
      roles: roles.map(({ rationale: _rationale, ...r }) => r),
      design: { ...design, rationale: undefined },
      analysis: {
        test: "none",
        responseColumns: roles.filter((r) => r.role === "response").map((r) => r.column),
        groupColumn,
      },
    })
    return { spec: s, caps: legalTests(s, t) }
  }
  const legal = (caps: ReturnType<typeof legalTests>, test: string) =>
    caps.find((c) => c.test === test)!

  it("offers a one-way ANOVA on three independent groups and refuses the paired tests", () => {
    const { caps } = capabilityFor(UNPAIRED)
    expect(legal(caps, "anova-one-way").legal).toBe(true)
    expect(legal(caps, "anova-one-way").recommended).toBe(true)
    expect(legal(caps, "t-paired").legal).toBe(false)
    expect(legal(caps, "anova-rm").legal).toBe(false)
  })

  it("refuses a two-group test on three groups, and says how many there are", () => {
    const { caps } = capabilityFor(UNPAIRED)
    const t = legal(caps, "t-welch")
    expect(t.legal).toBe(false)
    expect(t.reason).toContain("3")
  })

  it("recommends the paired test on paired data and refuses the unpaired one", () => {
    const { caps } = capabilityFor(PAIRED)
    expect(legal(caps, "t-paired").legal).toBe(true)
    expect(legal(caps, "t-paired").recommended).toBe(true)
    expect(legal(caps, "t-unpaired").legal).toBe(false)
    expect(legal(caps, "t-unpaired").reason).toContain("paired")
  })

  it("recommends repeated-measures ANOVA over one-way on repeated data", () => {
    const { caps } = capabilityFor(REPEATED)
    expect(legal(caps, "anova-rm").legal).toBe(true)
    expect(legal(caps, "anova-rm").recommended).toBe(true)
    expect(legal(caps, "anova-one-way").legal).toBe(false)
    expect(legal(caps, "friedman").legal).toBe(true)
  })

  it("explains every refusal and offers a fix", () => {
    const { caps } = capabilityFor(UNPAIRED)
    for (const cap of caps.filter((c) => !c.legal)) {
      expect(cap.reason, `${cap.test} was refused without a reason`).toBeTruthy()
    }
  })

  it("never marks a refused test as recommended", () => {
    for (const t of [UNPAIRED, PAIRED, REPEATED]) {
      for (const cap of capabilityFor(t).caps) {
        if (!cap.legal) expect(cap.recommended).toBe(false)
      }
    }
  })

  it("ranks the design's own answer first among the offerable tests", () => {
    const { spec: s } = capabilityFor(PAIRED)
    expect(offerableTests(s, PAIRED)[0].recommended).toBe(true)
  })

  it("offers survival only when a duration and an event column exist", () => {
    const { caps } = capabilityFor(UNPAIRED)
    expect(legal(caps, "kaplan-meier").legal).toBe(false)

    const survival = table(
      ["Patient", "Arm", "Survival time", "Event"],
      Array.from({ length: 8 }, (_, i) => ({
        Patient: `P${i}`,
        Arm: i % 2 ? "Drug" : "Placebo",
        "Survival time": 5 + i,
        Event: i % 3 ? 1 : 0,
      }))
    )
    const { caps: sc } = capabilityFor(survival)
    expect(sc.find((c) => c.test === "kaplan-meier")!.legal).toBe(true)
  })
})

describe("wide-format sheets", () => {
  // One column per series and one reading per timepoint. Every "group" has a
  // single value, so no group comparison can describe it — and the matrix must
  // say so rather than offering a test the resolver will then refuse.
  const WIDE = table(
    ["Time (h)", "Control OD600", "Treated OD600"],
    [
      { "Time (h)": 0, "Control OD600": 0.05, "Treated OD600": 0.05 },
      { "Time (h)": 2, "Control OD600": 0.08, "Treated OD600": 0.07 },
      { "Time (h)": 4, "Control OD600": 0.18, "Treated OD600": 0.12 },
      { "Time (h)": 6, "Control OD600": 0.41, "Treated OD600": 0.22 },
      { "Time (h)": 8, "Control OD600": 0.79, "Treated OD600": 0.38 },
      { "Time (h)": 10, "Control OD600": 1.23, "Treated OD600": 0.55 },
      { "Time (h)": 12, "Control OD600": 1.34, "Treated OD600": 0.66 },
      { "Time (h)": 24, "Control OD600": 1.51, "Treated OD600": 0.78 },
    ]
  )

  function capsFor(t: Table) {
    const roles = inferRoles(t)
    const design = inferDesign(t, roles)
    const s = spec({
      roles: roles.map(({ rationale: _r, ...r }) => r),
      design: { ...design, rationale: undefined },
      analysis: {
        test: "none",
        responseColumns: roles.filter((r) => r.role === "response").map((r) => r.column),
        groupColumn: defaultGroupColumn(roles),
      },
    })
    return legalTests(s, t)
  }

  it("refuses a group comparison when every group holds one value", () => {
    const caps = capsFor(WIDE)
    const anova = caps.find((c) => c.test === "anova-one-way")!
    expect(anova.legal).toBe(false)
    expect(anova.reason).toMatch(/at least 2 in each/)
  })

  it("says how to fix it", () => {
    const anova = capsFor(WIDE).find((c) => c.test === "anova-one-way")!
    expect(anova.fix).toMatch(/replicates|reshape/i)
  })

  it("recommends nothing rather than something wrong", () => {
    expect(capsFor(WIDE).filter((c) => c.recommended)).toHaveLength(0)
  })

  it("still allows the tests that suit two numeric columns", () => {
    const caps = capsFor(WIDE)
    expect(caps.find((c) => c.test === "correlation-pearson")!.legal).toBe(true)
    expect(caps.find((c) => c.test === "linear-regression")!.legal).toBe(true)
  })

  it("keeps recommending a comparison when the groups are genuinely replicated", () => {
    // The guard must not block ordinary tidy data.
    const anova = capsFor(UNPAIRED).find((c) => c.test === "anova-one-way")!
    expect(anova.legal).toBe(true)
    expect(anova.recommended).toBe(true)
  })
})

describe("a measurement is not a factor", () => {
  // "Treated OD600" matches the treatment name pattern, but it holds eight
  // distinct readings, not eight treatments. Taking it as the factor puts the
  // measurements on the x axis and drops a series from the figure.
  const WIDE_GROWTH = table(
    ["Time (h)", "Control OD600", "Treated OD600"],
    [0, 2, 4, 6, 8, 10, 12, 24].map((h, i) => ({
      "Time (h)": h,
      "Control OD600": [0.05, 0.08, 0.18, 0.41, 0.79, 1.23, 1.34, 1.51][i],
      "Treated OD600": [0.05, 0.07, 0.12, 0.22, 0.38, 0.55, 0.66, 0.78][i],
    }))
  )

  it("reads a numeric column of distinct readings as a response", () => {
    const roles = inferRoles(WIDE_GROWTH)
    expect(roles.find((r) => r.column === "Treated OD600")?.role).toBe("response")
    expect(roles.find((r) => r.column === "Control OD600")?.role).toBe("response")
  })

  it("still reads the time column as time", () => {
    // A wide timecourse has exactly one row per timepoint, so a unique numeric
    // time column is the normal case, not a misclassification.
    expect(inferRoles(WIDE_GROWTH).find((r) => r.column === "Time (h)")?.role).toBe("time")
  })

  it("puts time on the x axis rather than a measurement", () => {
    expect(defaultGroupColumn(inferRoles(WIDE_GROWTH))).toBe("Time (h)")
  })

  it("keeps a genuine dose column as a factor", () => {
    // Repeating numeric levels are what a real dose column looks like.
    const dosed = table(
      ["Dose", "Signal"],
      [0, 0, 10, 10, 50, 50].map((d, i) => ({ Dose: d, Signal: 100 - d + i }))
    )
    expect(inferRoles(dosed).find((r) => r.column === "Dose")?.role).toBe("treatment")
  })

  it("keeps a categorical treatment column as a factor", () => {
    expect(inferRoles(UNPAIRED).find((r) => r.column === "Treatment")?.role).toBe("treatment")
  })
})
