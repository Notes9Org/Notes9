/**
 * The reference manual for the analysis workspace.
 *
 * Written as data rather than JSX so it can be searched, linked to by id, and
 * checked by a test — `help-content.test.ts` asserts that every test the
 * software can select has an entry here, which is what stops the manual
 * drifting behind the product one release at a time.
 *
 * The rule for every entry: describe what the software ACTUALLY does, including
 * where it declines to do something. A manual that oversells is worse than no
 * manual, because it is believed.
 */

/**
 * A figure that carries the explanation.
 *
 * Rendered with the real Plotly build the app draws every chart with, from a
 * small fixture, so a reader is looking at the thing itself and not at a
 * drawing of it. `kind` names a builder in `help-figures.ts`.
 */
export interface HelpFigure {
  kind: string
  /** One line under the figure saying what to look at. */
  caption: string
}

/** A small labelled diagram of part of the interface. */
export interface HelpMockup {
  kind: string
  caption: string
}

export interface HelpEntry {
  id: string
  title: string
  /** One-line answer, for the search results list. */
  summary: string
  /**
   * Paragraphs. Kept short on purpose: where a figure can carry the point, the
   * figure carries it and the prose stops at a sentence or two. Entries that
   * are genuinely about policy rather than shape still need words.
   */
  body: string[]
  /** Live charts, drawn with the same renderer as the product. */
  figures?: HelpFigure[]
  /** Interface diagrams. */
  mockups?: HelpMockup[]
  /** Short labelled facts, e.g. assumptions or outputs. */
  facts?: { label: string; value: string }[]
  /** Words that should match this entry in search but may not appear in it. */
  keywords?: string[]
}

export interface HelpSection {
  id: string
  title: string
  blurb: string
  entries: HelpEntry[]
}

/* ── 1. The journey ────────────────────────────────────────────────────────*/

const JOURNEY: HelpSection = {
  id: "journey",
  title: "From file to figure",
  blurb: "What happens between choosing a file and seeing a chart, in order.",
  entries: [
    {
      id: "journey-overview",
      title: "The five stages",
      summary: "Read, locate, profile, repair, check — then you decide.",
      body: [
        "Every attach runs the same five stages, and you are shown each as it completes.",
        "A file from your own computer is parsed in your browser and never uploaded. Only stage five needs an answer from you.",
      ],
      mockups: [{ kind: "journey", caption: "The four automatic stages, then the one that asks." }],
      facts: [
        { label: "Read", value: "Parse the workbook — in your browser for a local file" },
        { label: "Locate", value: "Find the header row and the columns the table occupies" },
        { label: "Profile", value: "Count values, distinct values, numeric share, units" },
        { label: "Repair", value: "Fix what the file got wrong as written — automatic, undoable" },
        { label: "Check", value: "Outliers, duplicates, missing values, replicates — your call" },
      ],
      keywords: ["pipeline", "import", "loading", "stages", "process"],
    },
    {
      id: "journey-nothing-automatic",
      title: "What Notes9 will and will not do without asking",
      summary: "Repairs happen automatically; anything that moves a number does not.",
      body: [
        "The line is whether a change could alter a result you might have wanted.",
        "A tool that removes points until the bars show stars is a p-hacking machine. The defence is not to withhold the capability, but to make every use of it say its own name in a record you can show someone.",
      ],
      mockups: [{ kind: "severity", caption: "Two severities, and what each is allowed to do without asking." }],
      facts: [
        {
          label: "Applied for you",
          value:
            "Reading text as numeric in a plainly numeric column, stripping a unit repeated on every value, treating detection markers as missing. Each carries an Undo.",
        },
        {
          label: "Never applied for you",
          value:
            "Removing outliers, dropping duplicate rows, filling or dropping missing values, collapsing replicates, log-transforming. Each is offered with its evidence, and “leave as is” is always an option.",
        },
      ],
      keywords: ["automatic", "p-hacking", "governance", "safety"],
    },
  ],
}

/* ── 2. Reading the sheet ──────────────────────────────────────────────────*/

const READING: HelpSection = {
  id: "reading",
  title: "How your sheet is read",
  blurb: "Finding the table when it does not begin in cell A1.",
  entries: [
    {
      id: "reading-region",
      title: "The data region",
      summary: "Which cells are the table, shown as an A1 range you can correct.",
      body: [
        "Instrument exports rarely start at A1: a SoftMax or Gen5 sheet opens with the run date, the protocol name, a blank row, then the plate.",
        "Before anything is charted you are shown the region that was read, as an A1 range, with every part of it correctable. It blocks on a new file deliberately — a misread region does not shift a number slightly, it makes every number afterwards about the wrong cells.",
      ],
      mockups: [{ kind: "region", caption: "Title skipped, units read as units, empty columns left out — the read region outlined." }],
      keywords: ["region", "range", "A1", "header row", "columns"],
    },
    {
      id: "reading-header",
      title: "Header rows, unit rows and footnotes",
      summary: "Four shapes that are detected, and what each one does to your columns.",
      body: [
        "A title above the table — one filled cell over a row of names — is skipped, including when a blank spacer row sits between it and the header.",
        "A two-row header, where a merged group label spans several columns above the names, is folded together: \"Vehicle\" over \"Mean\" and \"SD\" becomes \"Vehicle Mean\" and \"Vehicle SD\", so four columns stay four columns instead of collapsing into two.",
        "A unit row directly under the header is read as units rather than as the first row of data, and the unit is folded into the column name so the axis can show it. A header that already states its unit keeps its own.",
        "A trailing footnote (\"n = 8\", \"* p < 0.05\") behind a blank row is left out of the data. The blank row is required: dropping a genuine last row that happens to carry one value would lose real data, which is much worse than carrying a footnote.",
      ],
      keywords: ["merged", "units", "footnote", "title", "two-row"],
    },
    {
      id: "reading-rowids",
      title: "Row identity",
      summary: "Points are tracked by their spreadsheet row number.",
      body: [
        "Every row keeps the number it has in the spreadsheet, so a point on a chart, an excluded sample and a provenance entry all trace back to somewhere you can actually look.",
        "This matters most for exclusions. Because identity is positional, an exclusion made against one sheet must never be carried onto another — it would not dangle, it would silently re-point at whatever now sits in that row while still naming the original person and reason. Loading a new sheet therefore clears the pipeline, and reopening a saved analysis checks whether each excluded row is still the sample it was excluded on.",
      ],
      keywords: ["row id", "exclusion", "identity", "traceability"],
    },
  ],
}

/* ── 3. Data quality ───────────────────────────────────────────────────────*/

const QUALITY: HelpSection = {
  id: "quality",
  title: "Data preparation and quality",
  blurb: "Every check that runs, what it detects, and what it offers.",
  entries: [
    {
      id: "quality-contaminated",
      title: "Text in a numeric column",
      summary: "Structural. Repaired for you, with undo.",
      body: [
        "A plate reader writes \"<LOD\" into the same column it writes \"0.42\" into. A qPCR export writes \"Undetermined\" beside its Cq values. A LIMS export appends \"ng/mL\" to every cell.",
        "Any of these makes the whole column read as text, and text cannot be plotted or tested. Repaired automatically, because \"12.3 ng/mL\" was never a number — with the offending cells listed by address, and an Undo.",
      ],
      facts: [
        { label: "Severity", value: "Structural — applied automatically" },
        { label: "Reversible", value: "Yes, as a single undo step" },
      ],
      keywords: ["LOD", "coerce", "numeric", "units", "text"],
    },
    {
      id: "quality-outliers",
      title: "Outliers (Grubbs' test)",
      summary: "Decision. Never removed for you.",
      body: [
        "Grubbs' test flags one value further from the mean than the sample size makes plausible. The finding names the cell, so you can look at the point before deciding about it.",
        "Notes9 never recommends removing it. Keeping it is not the lesser answer.",
      ],
      figures: [{ kind: "outlier", caption: "One flagged point, and the two means — with it and without it." }],
      facts: [
        { label: "Severity", value: "Decision — never automatic" },
        { label: "Minimum n", value: "7" },
        { label: "Recorded", value: "Method, alpha, who, when" },
      ],
      keywords: ["grubbs", "outlier", "exclude", "remove"],
    },
    {
      id: "quality-duplicates",
      title: "Duplicate rows",
      summary: "Decision. Rows matching across every column.",
      body: [
        "Rows whose values match across every column are flagged, with the repeated rows listed by their spreadsheet position.",
        "They are not flagged when more than half the table is duplicates: at that point repetition is the shape of the data — a plate layout, a factorial design written out — not a defect.",
        "If you exclude them, the earliest occurrence is kept and the reason recorded is \"Exact duplicate of an earlier row in the source file\". Which of two identical rows survives cannot matter, so it is not offered as a choice.",
      ],
      facts: [{ label: "Severity", value: "Decision — never automatic" }],
      keywords: ["duplicate", "repeat", "identical rows"],
    },
    {
      id: "quality-replicates",
      title: "Technical replicates",
      summary: "Decision. Collapsing them changes your n.",
      body: [
        "Triplicate wells from one sample are three reads of one biological unit, not three samples. Counting them as n = 3 inflates your sample size and the significance of everything downstream — the classic pseudoreplication error.",
        "Collapsing to a mean or median per condition is offered, never applied. The evidence names exactly what it costs: the n it would change to. Whether your replicates are technical or biological is a fact about your experiment that no detector can settle.",
      ],
      facts: [{ label: "Severity", value: "Decision — changes n" }],
      keywords: ["replicate", "collapse", "mean", "pseudoreplication"],
    },
    {
      id: "quality-constant",
      title: "Columns with only one value",
      summary: "Decision. Usually noise in the analysis.",
      body: [
        "A column that holds the same value in every row carries no information for a comparison, and including it as a variable can confuse role inference and the test that follows.",
        "Dropping it from the analysis is offered and suggested. It is not removed from your sheet — only its role is set to ignore, and that is reversible.",
      ],
      keywords: ["constant", "single value", "ignore"],
    },
  ],
}

/* ── 4. Statistical tests ──────────────────────────────────────────────────*/

const test = (
  id: string,
  title: string,
  summary: string,
  body: string[],
  facts: { label: string; value: string }[],
  keywords: string[] = [],
  figures: HelpFigure[] = []
): HelpEntry => ({ id, title, summary, body, facts, keywords, figures })

const TESTS: HelpSection = {
  id: "tests",
  title: "Statistical tests",
  blurb: "What each test asks, when it applies, what it assumes, and how to read the result.",
  entries: [
    {
      id: "tests-choosing",
      title: "Choosing between them",
      summary: "Three questions decide almost every case.",
      body: [
        "Three questions decide almost every case, and the guided chooser in the statistics settings asks exactly these.",
      ],
      figures: [{ kind: "normal-vs-skewed", caption: "Roughly normal takes a t-test or ANOVA; skewed takes the rank equivalent." }],
      facts: [
        { label: "What are you asking?", value: "Groups differ · two measurements move together · just describe" },
        { label: "How many groups?", value: "One vs a value · two · three or more" },
        { label: "Same subjects twice?", value: "Paired, or independent — analysing paired data as independent loses real power" },
        { label: "Roughly normal?", value: "Parametric compares means; non-parametric compares ranks" },
        { label: "Not sure?", value: "The Normality card runs Shapiro–Wilk and Anderson–Darling — they fail on different departures" },
      ],
      keywords: ["choose", "which test", "guide", "parametric", "non-parametric"],
    },
    test(
      "tests-welch",
      "Unpaired t-test (Welch)",
      "Two independent groups, comparing means, without assuming equal spread.",
      [
        "Treated wells against vehicle wells. Knockdown against scrambled control. Two independent groups, comparing means.",
        "Welch is the default over Student because it does not assume equal variance — treated cells are routinely more variable than controls, and with unequal well counts that assumption distorts the result most.",
      ],
      [
        { label: "Compares", value: "Means of two independent groups" },
        { label: "Assumes", value: "Roughly normal within each group; independent observations" },
        { label: "Does not assume", value: "Equal variance between groups" },
        { label: "Non-parametric alternative", value: "Mann–Whitney U" },
      ],
      ["t test", "welch", "two groups", "unpaired"]
    ),
    test(
      "tests-student",
      "Unpaired t-test (Student)",
      "Two independent groups, assuming equal spread.",
      [
        "The classical two-sample t-test. Identical in intent to Welch's, but it pools the variance of the two groups, which assumes they have the same spread.",
        "Choose it over Welch only when you have a reason to believe the variances are equal. When they are, the two give nearly the same answer; when they are not, Student's is the one that misleads.",
      ],
      [
        { label: "Compares", value: "Means of two independent groups" },
        { label: "Assumes", value: "Normality, independence, and equal variance" },
      ],
      ["student", "pooled variance"]
    ),
    test(
      "tests-paired",
      "Paired t-test",
      "The same subjects measured twice.",
      [
        "The same donor's PBMCs in two conditions. The same animal before and after dosing. One plate read at two timepoints.",
        "Each subject is its own control, which removes donor-to-donor variation — the reason a paired design detects a smaller effect than an unpaired one with the same n.",
        "The pairing must be real and the rows correctly aligned. Applying it to data that is not genuinely paired is not conservative, it is wrong.",
      ],
      [
        { label: "Compares", value: "Mean of within-pair differences against zero" },
        { label: "Assumes", value: "The differences are roughly normal; pairing is correct" },
        { label: "Non-parametric alternative", value: "Wilcoxon signed-rank" },
      ],
      ["paired", "before after", "matched"],
      [{ kind: "paired", caption: "Each line is one subject. The pairing is the information — ignoring it throws it away." }]
    ),
    test(
      "tests-onesample",
      "One-sample t-test",
      "One group against a value you expected.",
      [
        "One group against a number you expected: 100% of a normalised control, a release specification, a historical baseline.",
        "The value you test against is yours to supply and is part of the claim — the result is only as meaningful as that number.",
      ],
      [
        { label: "Compares", value: "One group's mean against a constant" },
        { label: "Assumes", value: "Roughly normal data" },
        { label: "Note", value: "This panel has no one-sample rank test to offer as an alternative" },
      ],
      ["one sample", "hypothesized mean", "mu"]
    ),
    test(
      "tests-mannwhitney",
      "Mann–Whitney U",
      "Two independent groups, compared by rank.",
      [
        "The rank-based counterpart of the unpaired t-test. Reach for it with cytokine concentrations, colony counts, flow percentages and anything else with a floor at zero and a long right tail.",
        "It does not compare means, and reporting it as though it did is a common error — it asks whether one group tends to produce larger values.",
      ],
      [
        { label: "Compares", value: "Rank distributions of two independent groups" },
        { label: "Assumes", value: "Independent observations; similar distribution shapes" },
        { label: "Does not assume", value: "Normality" },
      ],
      ["mann whitney", "wilcoxon rank sum", "non-parametric"]
    ),
    test(
      "tests-wilcoxon",
      "Wilcoxon signed-rank",
      "Paired measurements, compared by rank.",
      [
        "The non-parametric counterpart of the paired t-test. It ranks the within-pair differences by size and asks whether they are systematically positive or negative.",
        "Use it when the pairing is real but the differences are skewed or carry outliers.",
      ],
      [
        { label: "Compares", value: "Ranked within-pair differences" },
        { label: "Assumes", value: "Correct pairing; differences symmetric about their median" },
      ],
      ["signed rank", "paired non-parametric"]
    ),
    test(
      "tests-anova",
      "One-way ANOVA with post-hoc",
      "Three or more independent groups.",
      [
        "A dose series, a panel of compounds, four cell lines. A significant ANOVA says at least one group is not like the others — it does not say which.",
        "That is what the post-hoc comparisons are for, and why a t-test on every pair instead is a mistake: with six groups there are fifteen pairs, and at alpha 0.05 that is a false positive most experiments.",
        "Welch's ANOVA is the default variant, for the same reason Welch's t-test is: it does not assume every group has the same spread.",
      ],
      [
        { label: "Compares", value: "Means across three or more groups" },
        { label: "Assumes", value: "Roughly normal within groups; independence" },
        { label: "Answers \"which pair\"", value: "Only through the post-hoc correction" },
        { label: "Non-parametric alternative", value: "Kruskal–Wallis with Dunn's test" },
      ],
      ["anova", "post hoc", "multiple comparisons", "tukey", "bonferroni"]
    ),
    test(
      "tests-kruskal",
      "Kruskal–Wallis with Dunn's test",
      "Three or more independent groups, by rank.",
      [
        "The non-parametric counterpart of one-way ANOVA. It ranks all values and asks whether the groups' ranks differ.",
        "As with ANOVA, a significant result does not identify which groups differ; Dunn's test makes the pairwise comparisons with a correction applied.",
      ],
      [
        { label: "Compares", value: "Rank distributions across three or more groups" },
        { label: "Does not assume", value: "Normality" },
      ],
      ["kruskal", "dunn", "non-parametric anova"]
    ),
    test(
      "tests-pearson",
      "Pearson correlation",
      "Whether two measurements move together in a straight line.",
      [
        "How close two measurements are to a straight-line relationship, from −1 through 0 to +1.",
        "r is not slope, and correlation is not causation.",
        "A strong curved relationship can produce a Pearson r near zero, which is why plotting the columns before trusting r is not optional:",
      ],
      [
        { label: "Measures", value: "Strength and direction of a linear relationship" },
        { label: "Assumes", value: "Linearity; roughly normal; sensitive to outliers" },
        { label: "Non-parametric alternative", value: "Spearman" },
      ],
      ["pearson", "correlation", "r", "linear"],
      [{ kind: "pearson-blindspot", caption: "A strong curved relationship, obvious by eye, with a Pearson r near zero." }]
    ),
    test(
      "tests-spearman",
      "Spearman correlation",
      "Whether two measurements move together in any consistent direction.",
      [
        "Ranks both measurements and correlates the ranks. It detects any consistently increasing or decreasing relationship, not only a straight-line one, and is far less affected by a few extreme points.",
        "Use it when the relationship is monotonic but not linear, or when outliers would dominate Pearson's r.",
      ],
      [
        { label: "Measures", value: "Strength of a monotonic relationship" },
        { label: "Does not assume", value: "Linearity or normality" },
      ],
      ["spearman", "rank correlation", "monotonic"]
    ),
    {
      id: "tests-pvalue",
      title: "Reading a p-value",
      summary: "What it does and does not tell you.",
      body: [
        "The probability of data at least as extreme as yours if there were no effect. It is not the probability that there is no effect, and not a measure of effect size.",
        "Every number comes from real scipy and statsmodels running in your browser, never from the assistant. The assistant can propose an analysis; it cannot produce a number.",
      ],
      facts: [
        { label: "Small p, tiny effect", value: "Common with large samples, usually uninteresting" },
        { label: "Large p", value: "Failure to detect a difference — not evidence there is none" },
        { label: "Better to report", value: "The confidence interval: it carries effect size and precision" },
      ],
      keywords: ["p value", "significance", "alpha", "confidence interval"],
    },
    {
      id: "tests-multiplicity",
      title: "Multiple comparisons",
      summary: "Why correction matters and which method to pick.",
      body: [
        "Every comparison is another chance at a false positive:",
      ],
      figures: [{ kind: "multiplicity", caption: "At alpha 0.05, twenty comparisons give a coin-flip chance of at least one false positive." }],
      facts: [
        { label: "Family-wise (Holm–Šídák, Bonferroni)", value: "Controls the chance of ANY false positive. For a handful of planned comparisons" },
        { label: "Holm–Šídák over Bonferroni", value: "Bonferroni is the most conservative and loses the most power" },
        { label: "FDR (Benjamini–Hochberg)", value: "Controls the PROPORTION of your hits that are false. For hundreds of comparisons" },
        { label: "Benjamini–Yekutieli", value: "The FDR variant for comparisons that are not independent" },
        { label: "After an FDR run", value: "Intervals are false-coverage-rate adjusted over the selected set, not 1 − alpha. Notes9 says so" },
      ],
      keywords: ["correction", "fdr", "bonferroni", "holm", "benjamini"],
    },
  ],
}

/* ── 5. Charts ─────────────────────────────────────────────────────────────*/

const CHARTS: HelpSection = {
  id: "charts",
  title: "Charts",
  blurb: "Every chart type available, and what each one is honest about.",
  entries: [
    {
      id: "charts-choosing",
      title: "Choosing a chart",
      summary: "The chart should show the data, not just the summary.",
      body: [
        "Show the distribution wherever you can. Bars of means hide the shape of the data; the same bars with the points over them cost nothing.",
      ],
      figures: [{ kind: "bar-vs-points", caption: "The same two groups. The bars alone would not tell you the spread barely overlaps." }],
      keywords: ["chart type", "figure", "plot"],
    },
    {
      id: "charts-types",
      title: "The chart types",
      summary: "Bar, line, scatter, box, violin, histogram, pie, survival, forest, 3D.",
      body: [
        "Bar with scatter: group means or medians with the individual points drawn over them, and error bars you choose. The default for comparing a few groups.",
        "Line: a measurement over an ordered variable, usually time. Connecting points implies you believe the values in between lie on that line — for unordered categories, do not.",
        "Scatter with fit: two numeric measurements against each other, with an optional regression line and confidence band. The right chart for a correlation or a regression.",
        "Box plot: median, quartiles and whiskers. Compact and good for many groups, but it hides multimodality and small-n structure; overlay the points where you can.",
        "Violin: the full distribution shape. Best with enough observations to have a shape worth showing.",
        "Histogram: the distribution of one column. Bin width changes the story, so check more than one.",
        "Pie: composition of a whole. Only honest when the parts genuinely sum to a meaningful total and there are few of them.",
        "Kaplan–Meier: survival or time-to-event, drawn as a step function, with censored observations marked.",
        "Forest: effect estimates with their confidence intervals, one row per comparison. The right way to show many effects at once.",
        "3D scatter and mesh: three numeric measurements. Handsome and frequently harder to read than two well-chosen 2D panels — use deliberately.",
      ],
      figures: [
        { kind: "box", caption: "Box: median, quartiles, whiskers — compact for many groups, but it hides structure unless you overlay the points." },
        { kind: "violin", caption: "Violin: the full distribution shape. Needs enough observations to have a shape worth showing." },
        { kind: "histogram", caption: "Histogram: one column's distribution. Bin width changes the story — check more than one." },
        { kind: "scatter-fit", caption: "Scatter with fit: two numeric measurements, with a regression line. The chart for a correlation." },
        { kind: "kaplan-meier", caption: "Kaplan–Meier: time-to-event as a step function, censored observations marked." },
        { kind: "forest", caption: "Forest: many effect estimates with their intervals, one row each." },
      ],
      keywords: ["bar", "line", "scatter", "box", "violin", "histogram", "pie", "kaplan meier", "forest", "3d"],
    },
    {
      id: "charts-errorbars",
      title: "Error bars",
      summary: "SD, SEM and CI answer different questions.",
      body: [
        "Same data, same mean, three different bars. An error bar with no stated meaning is not information — the generated caption always names which one it is.",
      ],
      figures: [{ kind: "error-bars", caption: "SD is the spread of the data. SEM is the precision of the mean, and shrinks with n. The CI carries the range of effects consistent with your data." }],
      keywords: ["error bars", "sd", "sem", "confidence interval"],
    },
    {
      id: "charts-usedrows",
      title: "What the figure was actually drawn from",
      summary: "The used dataset, not the raw file.",
      body: [
        "The Rows used panel shows the exact rows that reached the engine: after filters, after transforms, with excluded points still present and marked as excluded.",
        "That is also what \"Export used data\" writes. A reader given the raw file instead cannot reproduce the figure beside it, and nothing in the file says why.",
        "Clicking a point on the chart reveals its row in that panel, and the row carries its spreadsheet position.",
      ],
      keywords: ["used data", "rows used", "reproduce", "export"],
    },
    {
      id: "charts-engine",
      title: "Why the figure layout can be empty when the chart is not",
      summary: "They draw from different things, on purpose.",
      body: [
        "They are not two views of one picture. The Chart tab renders your rail settings straight from the sheet. A figure panel renders the Analysis Spec — what the engine computed — so it needs the statistics computed first, and it carries only the settings the analysis itself records.",
        "Reference lines, the marker and show-points toggles, and the bubble-size and Z column mappings have no place in the spec, so a figure panel will not show them. The layout names whichever of these your current chart is using, rather than leaving you to spot the difference.",
        "The split is deliberate: a figure going into a manuscript should show what the engine actually computed, not a second redrawing of the raw columns that could quietly disagree with it.",
      ],
      facts: [
        { label: "Chart tab", value: "Draws from the sheet. No computation needed, appears immediately" },
        { label: "Figure panel", value: "Draws from the computed analysis. Needs “Compute statistics”" },
        { label: "Carried into both", value: "Chart type, axes, labels, scales, error bars, palette, per-series styling" },
        { label: "Chart tab only", value: "Reference lines, marker toggle, points-over-bars, bubble-size and Z columns" },
      ],
      mockups: [{ kind: "engine", caption: "One draws from the sheet; the other waits for a computed result." }],
      keywords: ["figure layout", "empty", "not computed", "panel", "missing chart"],
    },
  ],
}

/* ── 6. Standard curves ────────────────────────────────────────────────────*/

const CURVES: HelpSection = {
  id: "curves",
  title: "Standard curves",
  blurb: "Fitting a calibration curve and quantifying unknowns from it.",
  entries: [
    {
      id: "curves-how",
      title: "How the curve is built",
      summary: "Rows with a concentration are standards; rows without are unknowns.",
      body: [
        "Lay out your plate as rows: standards carry a known concentration, samples leave that cell empty. That is the whole rule, and the counts under the pickers say what it did to your sheet.",
        "Replicates at one concentration are averaged in the standards table; every individual point still feeds the fit.",
        "Blank subtraction can be off, automatic (the mean of your zero rows), or typed. Whether a blank was subtracted, and which value, is recorded in the export.",
      ],
      keywords: ["elisa", "standard curve", "calibration", "unknowns", "blank"],
    },
    {
      id: "curves-models",
      title: "The fit models",
      summary: "4PL, 5PL, and eleven others.",
      body: [
        "4PL logistic is the standard choice for an ELISA or a dose-response: a symmetric sigmoid with a bottom, a top, an EC50 and a slope.",
        "5PL adds an asymmetry parameter, which matters when the curve approaches its two plateaus at different rates. It costs a degree of freedom, so use it when the residuals of a 4PL show structure.",
        "3PL fixes the slope at 1. Boltzmann, Michaelis–Menten, one- and two-site binding, exponential growth and decay, Gaussian, polynomial, linear and semi-log are also available for the assays where those are the right model.",
        "The fit reports R², adjusted R², RMSE, Sy.x, AICc and degrees of freedom. AICc is the one to compare models with — lower is better, and it penalises the extra parameters that always improve R².",
        "Weighting (1/Y or 1/Y²) is offered because immunoassay error is usually proportional to signal, so unweighted fits are dominated by the high standards.",
      ],
      figures: [{ kind: "standard-curve", caption: "A 4PL through the standards, with the EC₅₀ marked and one unknown read back off the curve." }],
      keywords: ["4pl", "5pl", "ec50", "logistic", "aicc", "weighting"],
    },
    {
      id: "curves-unknowns",
      title: "Back-calculated unknowns",
      summary: "Every sample carries whether it is inside the standard range.",
      body: [
        "Each unknown's signal is run back through the fit to give a concentration, multiplied by a dilution factor if you named that column.",
        "Every result is marked in range, extrapolated, or no fit. This matters more than it looks: an extrapolated concentration is a number produced by a curve outside the range anything was measured in, and once it is a value in a spreadsheet it is indistinguishable from a good one.",
        "The export carries that status as its own column, along with the fit statistics, every parameter with its standard error and confidence interval, and the standards themselves — at full precision, not at display rounding.",
      ],
      keywords: ["back-calculate", "extrapolated", "in range", "dilution"],
    },
  ],
}

/* ── 7. Provenance ─────────────────────────────────────────────────────────*/

const RECORD: HelpSection = {
  id: "record",
  title: "Saving, exporting and the record",
  blurb: "What is kept, where it lives, and what can be shown to a reviewer.",
  entries: [
    {
      id: "record-saving",
      title: "Saving a sheet versus saving an analysis",
      summary: "Two different things with two different buttons.",
      body: [
        "Save sheet writes the spreadsheet back to the data file it came from, so every other page in Notes9 reads your edits. It appears beside the sheet, and it is only available for a file that came from your data library — a file opened from your own computer has no row on the server to be written back to.",
        "Save on the toolbar cuts a revision of the analysis: the spec, the figure, the results and the reasoning. Revisions are append-only; there is no delete and there will not be one.",
        "Both are separate from the automatic session save, which keeps your work in this browser across a reload but is not a record anyone else can see.",
      ],
      keywords: ["save", "revision", "data file", "session"],
    },
    {
      id: "record-history",
      title: "Sheet history",
      summary: "What changed in the spreadsheet, and what was there before.",
      body: [
        "Every other edit in the workspace was already auditable — an exclusion records who, when and why; a chart edit is a typed change on the provenance card. A cell typed over in the grid used to record nothing at all.",
        "Sheet history closes that. Entries are cut at boundaries — attaching a file, saving, or Notes9 writing a sheet — and each one lists the cells that changed with their addresses and their previous values. It exports as CSV.",
        "One honest limit, stated in the panel too: because entries are cut at boundaries rather than per keystroke, this tells you what changed between two points and what was there before. It does not tell you the order two cells were edited in.",
      ],
      keywords: ["audit", "history", "trail", "changes", "compliance"],
    },
    {
      id: "record-provenance",
      title: "Provenance",
      summary: "Everything needed to judge a figure or a number.",
      body: [
        "The provenance card is one click from both the figure and the statistics, because \"what produced this?\" gets asked of the picture as often as of the number.",
        "It carries the engine version, the data version, the spec hash, when it was computed, every transform and filter applied, every exclusion with its reason and author, and every edit made to the figure.",
        "Results are cached on the combination of engine version, data version and spec — so a stored number can always be checked against the data and the analysis that produced it, and a mismatch is reported rather than quietly recomputed.",
      ],
      keywords: ["provenance", "reproducibility", "audit", "hash"],
    },
    {
      id: "record-exports",
      title: "What you can export",
      summary: "Figures, data, code and the analysis itself.",
      body: [
        "Figures export as PNG, JPEG, TIFF, SVG, PDF and EPS, at a resolution you set.",
        "Export used data writes the rows the figure was built from, post-transform, with exclusions marked. Export sheet with edits writes the whole workbook as it currently stands.",
        "Export code writes a Python script that reproduces the analysis, so the result can be checked outside Notes9 entirely.",
        "Export analysis writes a .n9a bundle — the sheet and the full configuration — which reopens as the analysis you left.",
      ],
      keywords: ["export", "png", "svg", "python", "n9a", "reproduce"],
    },
  ],
}

export const HELP_SECTIONS: HelpSection[] = [JOURNEY, READING, QUALITY, TESTS, CHARTS, CURVES, RECORD]

/** Flat list, for search and for direct linking by id. */
export const HELP_ENTRIES: HelpEntry[] = HELP_SECTIONS.flatMap((s) => s.entries)

/**
 * Search across titles, summaries, bodies, facts and keywords.
 *
 * Deliberately a plain substring match over every word in the query, all of
 * which must appear somewhere in the entry. Nothing here justifies a ranking
 * algorithm, and a fuzzy match that surfaces the wrong entry for "paired" is
 * worse than one that finds nothing.
 */
export function searchHelp(query: string): HelpEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  return HELP_ENTRIES.filter((entry) => {
    const haystack = [
      entry.title,
      entry.summary,
      ...entry.body,
      ...(entry.facts ?? []).flatMap((f) => [f.label, f.value]),
      ...(entry.figures ?? []).map((f) => f.caption),
      ...(entry.mockups ?? []).map((m) => m.caption),
      ...(entry.keywords ?? []),
    ]
      .join(" ")
      .toLowerCase()
    return terms.every((t) => haystack.includes(t))
  })
}

export function findHelpEntry(id: string): HelpEntry | null {
  return HELP_ENTRIES.find((e) => e.id === id) ?? null
}
