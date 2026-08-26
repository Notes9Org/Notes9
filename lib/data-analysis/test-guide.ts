/**
 * Choosing a statistical test without already knowing statistics.
 *
 * The picker was eleven test names in a dropdown grouped "Parametric /
 * Non-parametric / Correlation" — a menu that can only be used by someone who
 * already knows which one they want, which is not the person who needs a menu.
 * A researcher who knows they measured two groups of cells and wants to know
 * whether they differ has to translate that into "Unpaired t-test (Welch)"
 * unaided, and the cost of getting it wrong is a p-value that looks exactly
 * like a right one.
 *
 * So the questions are about the EXPERIMENT, not about the statistics: what are
 * you asking, how many groups, are they the same subjects measured twice. The
 * mapping from those answers to a test is this file, kept pure and tested,
 * because it is a claim about method and not a piece of interface.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: pick for you and stay quiet. Every
 * recommendation carries the sentence that justifies it, and where the honest
 * answer is "this panel cannot run that test" it says so and points at what
 * can, rather than routing to the nearest test that happens to exist. A tool
 * that answers a question you did not ask is worse than one that declines.
 */

/** The tests the quick statistics panel can actually run. */
export type GuideTestId =
  | "oneSampleT"
  | "unpairedT"
  | "welchT"
  | "pairedT"
  | "anova"
  | "welchAnova"
  | "kruskal"
  | "mannWhitney"
  | "wilcoxon"
  | "pearson"
  | "spearman"

/** What the researcher is trying to find out. */
export type GuideGoal =
  /** Summarise: means, spread, normality. No test. */
  | "describe"
  /** Do these groups differ? */
  | "compare"
  /** Do these two measurements move together? */
  | "relationship"
  /** Counts falling into categories. */
  | "counts"

export type GuideGroups = "one" | "two" | "many"

/** How sure the researcher is that the data is roughly normal. */
export type GuideNormality = "normal" | "skewed" | "unsure"

export interface GuideAnswers {
  goal: GuideGoal
  /** Only meaningful when comparing. */
  groups?: GuideGroups
  /** Same subjects measured more than once (before/after, matched pairs). */
  paired?: boolean
  normality?: GuideNormality
}

export interface GuideResult {
  /** Null when no test in this panel is the right answer. */
  test: GuideTestId | null
  /** Plain-language name, for the recommendation line. */
  label: string
  /** Why this test, in the researcher's terms. One sentence. */
  why: string
  /**
   * Something the researcher must know before trusting it. Null when there is
   * genuinely nothing to add — never filled with reassurance.
   */
  caveat: string | null
  /** Where to go when this panel cannot answer the question. */
  elsewhere?: string
}

const NORMALITY_UNSURE =
  "You said you are not sure the data is normal. The Normality card below runs Shapiro–Wilk and Anderson–Darling on these columns — check it, and switch to the non-parametric option if either flags."

/**
 * The recommendation.
 *
 * Ordered so the cases that cannot be served are decided first: it is easier to
 * be honest about a gap before a plausible-looking test is already in hand.
 */
export function recommendTest(answers: GuideAnswers): GuideResult {
  const { goal, groups = "two", paired = false, normality = "unsure" } = answers
  const nonParametric = normality === "skewed"
  const unsureNote = normality === "unsure" ? NORMALITY_UNSURE : null

  if (goal === "describe") {
    return {
      test: null,
      label: "No test",
      why: "You are summarising rather than testing a hypothesis, so the descriptive statistics and the normality checks below are the answer on their own.",
      caveat: null,
    }
  }

  if (goal === "counts") {
    // The quick panel has no categorical test. Routing this to the nearest
    // numeric test would answer a question nobody asked, so it declines and
    // names the surface that does support it.
    return {
      test: null,
      label: "Not in this panel",
      why: "Counts falling into categories need a chi-square or Fisher's exact test, and this quick panel only runs tests on numeric columns.",
      caveat: null,
      elsewhere:
        "The main analysis supports both — set the column roles so your categories are the grouping variable, and it will offer them.",
    }
  }

  if (goal === "relationship") {
    return nonParametric
      ? {
          test: "spearman",
          label: "Spearman correlation",
          why: "You are asking whether two measurements move together, and you said the data is skewed — Spearman ranks the values first, so a few extreme points cannot drive the result.",
          caveat: "Spearman detects any consistent up-or-down relationship, not specifically a straight-line one.",
        }
      : {
          test: "pearson",
          label: "Pearson correlation",
          why: "You are asking whether two measurements move together, and Pearson measures how close that relationship is to a straight line.",
          caveat: unsureNote ?? "Pearson assumes a linear relationship — plot the two columns and check that a straight line is what you are seeing.",
        }
  }

  // goal === "compare"
  if (groups === "one") {
    if (nonParametric) {
      return {
        test: "oneSampleT",
        label: "One-sample t-test",
        why: "You are comparing one group against a fixed value you expect it to have.",
        // Said rather than silently substituted: the panel has no one-sample
        // rank test, and pretending otherwise would misdescribe the method.
        caveat:
          "You said the data is skewed, and this panel has no one-sample rank test to offer instead. With a small sample this t-test may not be trustworthy — treat the result with care.",
      }
    }
    return {
      test: "oneSampleT",
      label: "One-sample t-test",
      why: "You are comparing one group against a fixed value you expect it to have, so the test asks whether the mean differs from that value.",
      caveat: unsureNote,
    }
  }

  if (groups === "two") {
    if (paired) {
      return nonParametric
        ? {
            test: "wilcoxon",
            label: "Wilcoxon signed-rank",
            why: "The same subjects were measured twice, and you said the data is skewed — this compares each subject with itself using ranks.",
            caveat: null,
          }
        : {
            test: "pairedT",
            label: "Paired t-test",
            why: "The same subjects were measured twice, so each one acts as its own control and the test looks at the differences within pairs.",
            caveat: unsureNote,
          }
    }
    return nonParametric
      ? {
          test: "mannWhitney",
          label: "Mann–Whitney U",
          why: "Two independent groups, and you said the data is skewed — this compares them by rank rather than by mean.",
          caveat: null,
        }
      : {
          test: "welchT",
          label: "Unpaired t-test (Welch)",
          why: "Two independent groups of a numeric measurement, comparing their means.",
          // Welch rather than Student on purpose: it does not assume the two
          // groups have equal spread, costs almost nothing when they do, and
          // "equal variances" is an assumption researchers are rarely in a
          // position to defend.
          caveat:
            unsureNote ??
            "Welch's version does not assume the two groups have the same spread, which is why it is the default here rather than Student's.",
        }
  }

  // three or more groups
  if (paired) {
    return {
      test: nonParametric ? "kruskal" : "anova",
      label: nonParametric ? "Kruskal–Wallis + Dunn" : "One-way ANOVA + post-hoc",
      why: "Three or more groups of a numeric measurement.",
      // The honest version of a missing capability: name it, do not paper over
      // it. A repeated-measures design analysed as independent groups throws
      // away the pairing and usually loses real power.
      caveat:
        "You said the same subjects appear in every group. This panel has no repeated-measures test, and the one recommended here treats the groups as independent — which ignores the pairing and is not the right analysis for that design.",
    }
  }
  return nonParametric
    ? {
        test: "kruskal",
        label: "Kruskal–Wallis + Dunn",
        why: "Three or more independent groups, and you said the data is skewed — this compares them by rank, then Dunn's test says which pairs differ.",
        caveat: null,
      }
    : {
        test: "welchAnova",
        label: "Welch's ANOVA",
        why: "Three or more independent groups of a numeric measurement, asking whether any of them differ.",
        caveat:
          unsureNote ??
          "Welch's version does not assume every group has the same spread. Switch to the standard one-way ANOVA if you know they do.",
      }
}

/** The questions worth asking, given what has been answered so far. */
export function guideQuestions(answers: GuideAnswers): {
  showGroups: boolean
  showPaired: boolean
  showNormality: boolean
} {
  if (answers.goal === "describe" || answers.goal === "counts") {
    return { showGroups: false, showPaired: false, showNormality: false }
  }
  if (answers.goal === "relationship") {
    return { showGroups: false, showPaired: false, showNormality: true }
  }
  return {
    showGroups: true,
    // "Paired" is meaningless for a single group compared to a fixed value.
    showPaired: answers.groups !== "one",
    showNormality: true,
  }
}
