import { describe, expect, it } from "vitest"
import { guideQuestions, recommendTest, type GuideAnswers } from "@/lib/data-analysis/test-guide"

const ask = (a: GuideAnswers) => recommendTest(a)

describe("comparing groups", () => {
  it("two independent groups get Welch, not Student", () => {
    // Welch does not assume equal spread, and "equal variances" is an
    // assumption researchers are rarely in a position to defend.
    const r = ask({ goal: "compare", groups: "two", paired: false, normality: "normal" })
    expect(r.test).toBe("welchT")
  })

  it("two paired groups get the paired test", () => {
    expect(ask({ goal: "compare", groups: "two", paired: true, normality: "normal" }).test).toBe("pairedT")
  })

  it("skewed and paired goes to Wilcoxon, skewed and unpaired to Mann-Whitney", () => {
    expect(ask({ goal: "compare", groups: "two", paired: true, normality: "skewed" }).test).toBe("wilcoxon")
    expect(ask({ goal: "compare", groups: "two", paired: false, normality: "skewed" }).test).toBe("mannWhitney")
  })

  it("three or more independent groups get Welch's ANOVA, or Kruskal when skewed", () => {
    expect(ask({ goal: "compare", groups: "many", paired: false, normality: "normal" }).test).toBe("welchAnova")
    expect(ask({ goal: "compare", groups: "many", paired: false, normality: "skewed" }).test).toBe("kruskal")
  })

  it("one group against a fixed value is the one-sample t-test", () => {
    expect(ask({ goal: "compare", groups: "one", normality: "normal" }).test).toBe("oneSampleT")
  })
})

describe("honesty about what the panel cannot do", () => {
  it("says repeated measures across 3+ groups is the wrong analysis, rather than staying quiet", () => {
    const r = ask({ goal: "compare", groups: "many", paired: true, normality: "normal" })
    expect(r.caveat).toMatch(/repeated-measures/i)
    expect(r.caveat).toMatch(/not the right analysis/i)
  })

  it("declines categorical counts instead of routing to a numeric test", () => {
    const r = ask({ goal: "counts" })
    expect(r.test).toBeNull()
    expect(r.elsewhere).toMatch(/chi-square|main analysis/i)
  })

  it("admits there is no one-sample rank test rather than substituting one", () => {
    const r = ask({ goal: "compare", groups: "one", normality: "skewed" })
    expect(r.test).toBe("oneSampleT")
    expect(r.caveat).toMatch(/no one-sample rank test/i)
  })

  it("recommends no test at all when the goal is to describe", () => {
    const r = ask({ goal: "describe" })
    expect(r.test).toBeNull()
    expect(r.why).toMatch(/summarising/i)
    expect(r.caveat).toBeNull()
  })
})

describe("uncertainty is routed to the evidence, not guessed", () => {
  it("points at the normality card when the researcher is unsure", () => {
    const r = ask({ goal: "compare", groups: "two", paired: false, normality: "unsure" })
    expect(r.caveat).toMatch(/Shapiro–Wilk/)
  })

  it("does not claim normality was checked when it was asserted", () => {
    const r = ask({ goal: "compare", groups: "two", paired: false, normality: "normal" })
    expect(r.caveat).not.toMatch(/Shapiro–Wilk/)
  })
})

describe("relationships", () => {
  it("Pearson for normal, Spearman for skewed", () => {
    expect(ask({ goal: "relationship", normality: "normal" }).test).toBe("pearson")
    expect(ask({ goal: "relationship", normality: "skewed" }).test).toBe("spearman")
  })

  it("warns that Pearson is about straight lines", () => {
    expect(ask({ goal: "relationship", normality: "normal" }).caveat).toMatch(/linear|straight-line/i)
  })
})

describe("every recommendation justifies itself", () => {
  const cases: GuideAnswers[] = [
    { goal: "describe" },
    { goal: "counts" },
    { goal: "relationship", normality: "normal" },
    { goal: "relationship", normality: "skewed" },
    { goal: "compare", groups: "one", normality: "normal" },
    { goal: "compare", groups: "one", normality: "skewed" },
    { goal: "compare", groups: "two", paired: false, normality: "unsure" },
    { goal: "compare", groups: "two", paired: true, normality: "skewed" },
    { goal: "compare", groups: "many", paired: false, normality: "unsure" },
    { goal: "compare", groups: "many", paired: true, normality: "skewed" },
  ]

  it("always carries a label and a reason", () => {
    for (const c of cases) {
      const r = ask(c)
      expect(r.label.length).toBeGreaterThan(0)
      expect(r.why.length).toBeGreaterThan(0)
    }
  })
})

describe("guideQuestions", () => {
  it("asks nothing further once the goal is describe or counts", () => {
    expect(guideQuestions({ goal: "describe" })).toEqual({ showGroups: false, showPaired: false, showNormality: false })
    expect(guideQuestions({ goal: "counts" })).toEqual({ showGroups: false, showPaired: false, showNormality: false })
  })

  it("does not ask about pairing for a single group", () => {
    expect(guideQuestions({ goal: "compare", groups: "one" }).showPaired).toBe(false)
    expect(guideQuestions({ goal: "compare", groups: "two" }).showPaired).toBe(true)
  })

  it("asks about distribution for a relationship, but not about groups", () => {
    const q = guideQuestions({ goal: "relationship" })
    expect(q.showGroups).toBe(false)
    expect(q.showNormality).toBe(true)
  })
})
