# Data Analysis — Excel-grade Spreadsheet + GraphPad-Prism-grade Charting Roadmap

**Goal.** Make the Notes9 data-analysis module (1) as comfortable and complete as **Microsoft Excel** for a working data analyst, and (2) as scientifically capable as **GraphPad Prism** for statistics and publication graphing — inside the existing electronic-lab-notebook workspace.

**Status legend:** ✅ done · 🟡 partial (exists but incomplete) · �stub (dead code / not surfaced) · ⬜ not started · 🔒 needs license or heavy dependency.

This document is the master plan. Features are grouped into **workstreams** (what), then sequenced into **phases** (when). The phase order is the "implement one at a time" backlog.

---

## 1. Principles

1. **The spreadsheet is the source of truth.** Every chart, statistic and plate is derived live from the Univer workbook snapshot. Keep that invariant.
2. **Excel muscle-memory.** Formulas, shortcuts, formatting, and data tools should behave like Excel so an analyst is instantly productive.
3. **Prism scientific rigor.** Error representation, correct statistical tests with multiple-comparison correction, nonlinear regression with parameter CIs, and publication-quality graphs.
4. **Persist everything structured.** Charts and analyses become saved objects (not just PNGs) that recompute when data changes and version over time.
5. **Progressive disclosure.** Beginner-friendly defaults; power features one click deeper. No wall of options.
6. **No silent wrong answers.** Where an approximation is used (e.g. normal-approx CI), say so; prefer exact distributions.

---

## 2. Baseline — what exists today (2026-07)

**Spreadsheet (Univer 0.20):** core preset only — formula engine (Excel function library), number formats, cell styling, merges, freeze, multi-sheet, structural ops. xlsx/xls/csv import; xlsx/csv export (styles dropped on the SheetJS bridge). Persists as JSON snapshot in `experiment_data.workbook_snapshot`.

**Charting (Plotly):** 13 chart options over 8 trace types — line, scatter, area, bubble, bar/stacked/horizontal, pie, box, violin, histogram, 3D scatter, 3D mesh. Per-series color/symbol/width/dash/size/opacity, dual Y-axis, log-Y, 4 palettes, axis titles/ranges, title. Export PNG/JPEG/TIFF/SVG at DPI.

**Statistics (hand-rolled):** Shapiro–Wilk, 1-sample/unpaired(Student+Welch)/paired t, one-way ANOVA + Tukey, Mann–Whitney, Wilcoxon, Kruskal–Wallis, Pearson, Spearman. Descriptives (n, mean, SD, SEM, median, IQR, CV, 95%CI). Distributions: normal/t/F/χ² CDFs + incomplete beta/gamma.

**Curve fitting (Levenberg–Marquardt):** linear, semilog, 4PL, 5PL. Standard-curve panel with blank subtraction + back-calculation of unknowns. Reports R²/RMSE/EC₅₀. No parameter SE/CI, no confidence bands.

**Assay tooling:** 96/384 plate view (live sheet mirror, roles, heatmap, serial-dilution generator), 6 built-in templates (ELISA, dose–response, growth, Bradford, qPCR, kinetics), user templates (server + local).

**Key gaps in one line:** no error bars, no individual-point/grouped Prism graphs, no significance annotations, no confidence bands, a thin nonlinear-model library, no two-way/RM ANOVA or post-hoc beyond Tukey, and none of the free Excel data tools (sort/filter/conditional-format/validation) were switched on.

---

## PART A — EXCEL-GRADE SPREADSHEET

### A1. Grid & data-entry features (Univer plugins) — mostly configuration
| Feature | Status | Notes |
|---|---|---|
| Cell formatting (font, fill, border, align, wrap) | ✅ | core |
| Number formats (currency, %, date, sci, custom) | ✅ | core `numfmt` |
| Merge / freeze / multi-sheet / row-col ops | ✅ | core |
| **Sort** (range & column, multi-key) | ⬜→**P0** | `preset-sheets-sort` |
| **AutoFilter** (by value / condition) | ⬜→**P0** | `preset-sheets-filter` |
| **Find & Replace** (regex, workbook-wide) | ⬜→**P0** | `preset-sheets-find-replace` |
| **Conditional formatting** (color scale, data bars, icon sets, rules, top/bottom, duplicates) | ⬜→**P0** | `preset-sheets-conditional-formatting` |
| **Data validation** (dropdown lists, number/date/text/custom, input/error msgs) | ⬜→**P0** | `preset-sheets-data-validation` |
| **Structured tables** (banded rows, header) | ⬜→**P0** | `preset-sheets-table` |
| **Cell notes** | ⬜→**P0** | `preset-sheets-note` |
| **Threaded comments** | ⬜→**P0** | `preset-sheets-thread-comment` |
| **Hyperlinks** | ⬜→**P0** | `preset-sheets-hyper-link` |
| **Images / floating drawings** | ⬜→**P0** | `preset-sheets-drawing` (installed, unwired) |
| Named ranges / defined names | ⬜ | custom via Facade `defineName` |
| Cell / sheet protection | ⬜🔒 | Pro or custom mutation guard |
| Data bars in cells / sparklines | ⬜🔒 | sparkline = Univer Pro or custom SVG-in-cell |

### A2. Formula engine — Excel function parity
Univer's `sheets-formula` ships a large Excel-compatible library. Work = **audit coverage**, then fill gaps + add domain functions.
- **Categories to verify/complete:** Math/Trig · Statistical · Lookup/Reference (incl. dynamic arrays: `FILTER`, `SORT`, `UNIQUE`, `SEQUENCE`, `XLOOKUP`, `LAMBDA`, `LET`) · Text · Logical · Date/Time · Information · Financial · Engineering · Database (`DSUM`…) · Web.
- **Custom Notes9/lab formulas** (differentiator, register via `registerFunction`): `MOLARITY`, `DILUTION`, `CQ2COPIES`, `EC50`, `IC50`, `HILLSLOPE`, `ZSCORE`, `ZFACTOR` (assay quality), `CV`, `SEM`, `GEOMEAN` if missing, `INTERPOLATE(model,…)` (calls curve-fit lib).
- Formula autocomplete, argument hints, error tracing (precedent/dependent), `FORMULATEXT`, iterative calc toggle.

### A3. Data tools
| Tool | Status | Approach |
|---|---|---|
| Remove duplicates | ⬜ | custom command over selection |
| Text-to-columns / split | ⬜ | custom (delimiter/fixed width) |
| Flash-fill (pattern infer) | ⬜ | heuristic |
| Group / outline rows-cols, subtotals | ⬜ | custom or Pro |
| **Pivot tables** | ⬜🔒 | Univer Pro `sheets-pivot` **or** custom pivot builder |
| Goal seek / solver | ⬜ | custom (bisection / gradient) over formula graph |
| What-if data tables / scenarios | ⬜ | custom |
| Data consolidation | ⬜ | custom |
| Fill series / autofill handle | 🟡 | verify Univer coverage |

### A4. Import / Export fidelity
- xlsx round-trip **with styles/number-formats/CF/validation** (today the SheetJS bridge drops styles) — either extend the bridge or use Univer's native exchange (Pro `exchange-client`).
- Add **PDF** and **print** export of sheets; copy-range-as-image; paste HTML/TSV from Excel with formatting.
- JSON / TSV / clipboard round-trips; large-file streaming import.

### A5. Collaboration & history
- Cell comments/threads (A1) → tie to Notes9 identities & mentions.
- **Workbook version history** (mirror `lab_note_versions`): snapshot table + restore + diff.
- Real-time co-editing (Univer collab is Pro; app already runs Hocuspocus — evaluate bridging).

### A6. Persistence & schema (shared with Part B)
- Preserve plugin `resources` through `normalizeWorkbookSnapshot` (**done in P0** — required for CF/validation/notes/drawings to survive reload).
- Autosave analysis workbook server-side (today only localStorage + `.n9a`).

---

## PART B — GRAPHPAD-PRISM-GRADE ANALYSIS & CHARTING

### B1. Typed data tables (Prism's organizing idea)
Introduce a **table kind** that gates which analyses/graphs are offered and how replicates are handled:
- **XY** (X + Y with optional replicate subcolumns / mean±SD±N)
- **Column** (each column = a group)
- **Grouped** (rows × column-groups, two-factor)
- **Contingency** (R×C counts)
- **Survival** (time, status)
- **Parts-of-whole** (compositions)
- **Nested** (subcolumns nested in groups)
- **Multiple variables** (wide, for correlation/regression matrices)

### B2. Chart type catalog (exhaustive)
**XY / correlation**
- Scatter (points) ✅ · Line ✅ · Line+symbols ✅ · Area/stacked area ✅ · Bubble ✅ · Step line ⬜ · Spline/smoothed ⬜ · **XY with error bars** ⬜ · **Before–after / paired lines** ⬜ · Connected-replicates ⬜ · Fit line + **CI/PI band** ⬜ · Deming/regression overlay ⬜

**Column (one grouping variable)**
- Bar (mean) ✅ · **Bar + error bars** ⬜ · **Scatter dot plot (individual points, jittered)** ⬜ · **Bar + individual points (Prism signature)** ⬜ · Box & whisker (Tukey / min-max / 10–90 / SD whisker styles) 🟡 · Violin ✅ · **Floating bars (min→max)** ⬜ · **Mean±SD/SEM without bar (points+error)** ⬜ · Interleaved / stacked / separated ⬜

**Grouped (two grouping variables)**
- Grouped/interleaved bar 🟡 · Stacked ✅ · Separated ⬜ · **Grouped scatter with points+error** ⬜ · **Grouped before–after** ⬜ · **Heatmap (matrix)** ⬜

**Distribution**
- Histogram ✅ · Frequency distribution ⬜ · Cumulative frequency / **ECDF** ⬜ · **Q–Q plot** ⬜ · P–P plot ⬜ · **Density (KDE)** ⬜ · Rug/strip ⬜

**Parts-of-whole**
- Pie ✅ · Donut ✅ · 100%-stacked bar ⬜ · **Treemap** ⬜ · **Sunburst** ⬜ · Waffle ⬜

**Contingency / proportion**
- Grouped/stacked proportion bars ⬜ · **Mosaic** ⬜

**Survival**
- **Kaplan–Meier (step) + censor ticks** ⬜

**Scientific / specialized**
- Real **Heatmap** (trace) ⬜ · **Contour / 2D density** ⬜ · **Correlation-matrix heatmap** ⬜ · **Volcano** ⬜ · **MA plot** ⬜ · **Bland–Altman** ⬜ · **ROC** ⬜ · **Forest plot** ⬜ · **Radar/spider** ⬜ · **Polar** ⬜ · **Ternary** ⬜ · **Parallel coordinates** ⬜ · **Sankey** ⬜ · **Waterfall** ⬜ · **Funnel** ⬜ · **Dumbbell / lollipop** ⬜ · **Slope chart** ⬜ · Candlestick/OHLC ⬜ · Gantt ⬜

**3D & multi-panel**
- 3D scatter ✅ · 3D mesh/surface ✅ · 3D line/bar ⬜ · **Small multiples / faceting (trellis)** ⬜ · Multi-graph layout/composer ⬜

### B3. Chart customization (Prism-grade)
- **Error bars**: SD · SEM · 95% CI · range · geometric SD · custom column; direction both/up/down; cap width; per-series. ⬜
- **Individual points overlay**: jitter/align, symbol/size, show-all/mean line. ⬜
- **Connecting lines between means / paired subjects.** ⬜
- **Significance annotations**: brackets + asterisks/exact p, auto-placed from a comparison. ⬜
- **Reference lines / bands**: horizontal & vertical lines, shaded threshold regions, target ranges. ⬜
- **Fit overlays** on any XY: linear + nonlinear, with **confidence & prediction bands**. ⬜
- **Axes**: subtitle ⬜; units 🟡; linear/log10/log2/ln/probability/reversed ⬜; **discontinuous (broken) axis** ⬜; dual axes ✅ (needs UI for 2nd title); per-axis grid/ticks/minor-ticks/format/angle/direction ⬜.
- **Legend**: position/orientation/title/per-item edit ⬜ (today hardcoded bottom).
- **Color**: palettes ✅; per-series ✅; continuous colormap/color-by-value ⬜; pattern/hatch fills ⬜.
- **Layout**: editable margins, canvas size, aspect ratio ⬜; annotation authoring (text/arrow/shape/image) ⬜; **graph templates / "apply look"** ⬜.
- **Export**: add **PDF** & **EPS** to PNG/JPEG/TIFF/SVG. ⬜

### B4. Statistical analyses (Prism-grade)
**Descriptives+**: geometric mean & SD, skewness, kurtosis, mode, sum, range, MAD, **t-based CI** (replace fixed-1.96), normality summary. ⬜

**Column analyses**
- t tests: 1-sample ✅, unpaired Student/Welch ✅, paired ✅, **ratio-paired** ⬜, **one/two-tailed toggle** ⬜.
- Nonparametric: Mann–Whitney ✅, Wilcoxon ✅, **sign test** ⬜, **1-sample Wilcoxon** ⬜.
- ANOVA: one-way ✅, **Welch ANOVA** ⬜, **RM one-way** ⬜; post-hoc: Tukey ✅, **Dunnett** ⬜, **Bonferroni** ⬜, **Šídák** ⬜, **Holm** ⬜, **Holm–Šídák** ⬜, Newman–Keuls ⬜.
- Kruskal–Wallis ✅ + **Dunn's** ⬜; **Friedman** ⬜ + Dunn's.
- Normality: Shapiro–Wilk ✅, **D'Agostino–Pearson** ⬜, **KS** ⬜, **Anderson–Darling** ⬜.
- Outliers: **Grubbs** ⬜, **ROUT** ⬜.

**Grouped analyses**
- **Two-way ANOVA** (±RM on one/both factors) ⬜ + multiple comparisons; **three-way** ⬜; **mixed-effects (REML)** for missing data ⬜.

**Correlation & regression**
- Pearson ✅, Spearman ✅, **partial correlation** ⬜, **correlation matrix** ⬜.
- **Simple linear regression** surface: slope/intercept ± SE/CI, r², runs test, replicate test, **compare slopes/intercepts**, CI/PI bands. 🔧(lib exists, unsurfaced)
- **Multiple linear regression** ⬜; **Deming** ⬜; **logistic regression** ⬜.
- **Nonlinear regression** (see B6): parameter SE/CI, confidence bands, weighting, constraints, shared params, global fit, model comparison (AICc / extra-sum-of-squares F).

**Contingency**: χ² independence ✅(unsurfaced) + **goodness-of-fit** ⬜, **Fisher's exact** ⬜, **McNemar** ⬜, **relative risk / odds ratio** ⬜, sensitivity/specificity ⬜.

**Survival**: **Kaplan–Meier**, **log-rank (Mantel–Cox)**, Gehan–Breslow, **hazard ratio** ⬜.

**Diagnostic/agreement**: **ROC + AUC (±CI)** ⬜, **Bland–Altman** ⬜.

**Other**: equivalence/**TOST** ⬜, one-sample tests vs hypothetical value 🟡.

### B5. Distribution library (support for the above)
Add **PDFs** and **inverse/quantile** functions for t, F, χ² (removes the fixed-1.96 CI and hard-coded Tukey critical values); **studentized-range** distribution (exact Tukey); discrete: **binomial, Poisson, hypergeometric** (enables Fisher's exact & exact nonparametric tails).

### B6. Nonlinear model catalog (curve fitting)
Extend `curve-fitting.ts` from {linear, semilog, 4PL, 5PL} to the Prism catalog:
- **Dose–response**: log(agonist)→response variable slope (=4PL) ✅, fixed-slope (3PL) ⬜, log(inhibitor)→response ⬜, biphasic ⬜, operational model ⬜, Gaddum/Schild ⬜, EC-anything (ECₓ) ⬜.
- **Receptor binding**: one-site specific/total ⬜, two-site ⬜, one-site + Hill slope ⬜, homologous/competitive ⬜, saturation/Scatchard ⬜, kinetics assoc/dissoc ⬜.
- **Enzyme kinetics**: Michaelis–Menten ⬜, substrate inhibition ⬜, competitive/noncompetitive/uncompetitive/mixed inhibition ⬜, Morrison Kᵢ ⬜, allosteric sigmoidal ⬜.
- **Exponential**: one-phase decay/association ⬜, two-/three-phase ⬜, plateau-then-decay ⬜, exponential growth ⬜.
- **Polynomial**: order 1–6 ⬜; centered polynomial ⬜.
- **Peaks**: Gaussian ⬜, Lorentzian ⬜, sum-of-two-Gaussians ⬜.
- **Sigmoidal/growth**: Boltzmann ⬜, Gompertz ⬜, logistic growth ⬜.
- **Lines**: straight ✅, through-origin ⬜, segmental/broken-line ⬜, sine wave ⬜.
- **Utilities**: standard-curve interpolation any model 🟡, smoothing/LOWESS/spline ⬜, **area under curve** ⬜, derivative/integral ⬜.
- **Per fit report**: parameters ± SE ± CI, R²/adjusted, Sy.x, AICc, runs/replicates test, residual plot, normality of residuals. ⬜

### B7. Analysis workflow & output
- **Structured analysis & graph objects** persisted to DB (not just PNG); recompute when the source data changes ("linked").
- Results tables → paste into sheet / export; **auto-generated methods & stats text** for manuscripts.
- **Layout composer**: arrange multiple graphs + tables on a page (Prism "Layouts").
- Clone/duplicate analysis & graph; parameter presets; reproducibility (params saved + versioned).

---

## 3. Combination matrices ("all possible combinations")

### 3.1 Data-table kind × valid graph types
| Table kind | Primary graphs | Also allowed |
|---|---|---|
| **XY** | scatter, line, line+symbols, XY+error, fit+CI band | bubble, area, step, spline, before-after, residual, Bland-Altman, ROC |
| **Column** | bar+error, scatter dot, bar+points, box, violin, floating bar | mean±SEM, before-after, estimation plot |
| **Grouped** | grouped bar+error, grouped points, interleaved/stacked/separated, heatmap | grouped before-after, 100%-stack |
| **Contingency** | stacked/grouped proportion bars, mosaic | forest (RR/OR) |
| **Survival** | Kaplan–Meier | cumulative incidence |
| **Parts-of-whole** | pie, donut, 100%-stack, treemap, sunburst, waffle | — |
| **Multiple variables** | correlation-matrix heatmap, scatter matrix, parallel coords, volcano, MA | PCA scatter |

### 3.2 Error-bar × graph combinations (each independently selectable)
Error types **{SD, SEM, 95%CI, range, geometric SD, custom}** × graphs **{bar, scatter dot, XY point, line-of-means, grouped bar, grouped point, floating bar, box(as whisker style)}** × direction **{both, up, down}** × cap **{on/off, width}**.

### 3.3 Statistical test × experimental design (the "which test" matrix)
| Design | Parametric | Nonparametric |
|---|---|---|
| 1 group vs value | 1-sample t | 1-sample Wilcoxon / sign |
| 2 groups unpaired | unpaired t (Student/Welch) | Mann–Whitney |
| 2 groups paired | paired / ratio-paired t | Wilcoxon signed-rank |
| ≥3 groups, 1 factor | one-way ANOVA (+Welch/RM) | Kruskal–Wallis (+Dunn) / Friedman |
| ≥3 groups, 2 factors | two-way ANOVA (±RM) | (aligned-rank) |
| Post-hoc | Tukey / Dunnett / Bonferroni / Šídák / Holm / Newman–Keuls | Dunn |
| Association (continuous) | Pearson, linear/nonlinear regression | Spearman |
| Association (categorical) | χ², Fisher, McNemar, RR/OR | — |
| Time-to-event | Cox HR | Kaplan–Meier, log-rank |
| Agreement/diagnostic | Bland–Altman, ROC/AUC, Deming | — |

### 3.4 Multiple-comparison correction × ANOVA family
{Tukey, Dunnett (vs control), Bonferroni, Šídák, Holm, Holm–Šídák, Newman–Keuls} for parametric; {Dunn} for KW/Friedman — each reporting adjusted p + CI of the difference.

---

## 4. Phased delivery plan (implement one at a time)

**Phase 0 — Excel feature suite (foundation)** ✅ *in progress this PR*
Enable the free Univer plugins for the `workspace` variant: sort, filter, find & replace, conditional formatting, data validation, tables, notes, threaded comments, hyperlinks, images. Preserve plugin `resources` through snapshot normalization so they persist. → **the single biggest Excel-comfort leap.**

**Phase 1 — Prism graph DNA (charting essentials)**
1. Error bars (SD/SEM/CI/range/custom) + automatic replicate aggregation.
2. Individual data points overlay (dot plots, jitter) + bar+points combo.
3. Significance brackets/asterisks driven by a comparison.
4. Reference lines & shaded threshold bands.
5. Chart polish: subtitle, editable margins/size, legend position, per-axis grid/tick/log controls, secondary-axis title UI.

**Phase 2 — Curve fitting & regression**
6. Expand nonlinear model catalog (exponential, Michaelis–Menten, one/two-site binding, polynomial 1–6, Gaussian, Boltzmann, dose–response variants).
7. Parameter SE + CI, confidence/prediction bands, weighting, AICc / extra-sum-of-squares model comparison, residual & runs tests.
8. Surface simple linear regression (CI/PI, compare slopes/intercepts) — wire the existing lib fn.
9. Render confidence bands + fit overlays on the main chart (not just the standard-curve tab).

**Phase 3 — Statistics expansion**
10. Distribution library: PDFs + inverse for t/F/χ², studentized-range, binomial/Poisson/hypergeometric.
11. Post-hoc suite (Dunnett/Bonferroni/Šídák/Holm/Dunn) + one/two-tailed toggles + t-based CIs.
12. Two-way ANOVA (+RM) & multiple comparisons.
13. More normality (D'Agostino/KS/Anderson–Darling) + outliers (Grubbs/ROUT).
14. Contingency (Fisher, McNemar, RR/OR, χ² goodness-of-fit) — surface χ² too.
15. Descriptives+ (geometric mean/SD, skew/kurtosis, sum/range/MAD).

**Phase 4 — New scientific chart types**
16. Real heatmap / contour / correlation-matrix.
17. Volcano · Bland–Altman · ROC · Kaplan–Meier · forest.
18. Q–Q / P–P / ECDF / KDE density.
19. Grouped & faceted small multiples; before–after/estimation plots.
20. Long-tail: radar, polar, ternary, parallel coords, sankey, waterfall, treemap/sunburst, dumbbell/slope.

**Phase 5 — Spreadsheet advanced**
21. Function-library audit + custom lab formulas + autocomplete/hints.
22. Named ranges; remove-duplicates, text-to-columns, goal-seek.
23. Pivot tables (custom or Univer Pro) + sparklines.
24. xlsx style/format fidelity round-trip; PDF/print export.

**Phase 6 — Workflow, persistence & output**
25. Structured chart/analysis objects in DB + auto-recompute on data change.
26. Workbook & analysis version history.
27. Multi-graph layout composer; methods/stats text generation.
28. Survival/advanced regression (Cox, logistic, multiple, Deming); TOST.

---

## 5. Backlog checklist (living)

Track progress here; check items as phases land.

- [x] **P0** Enable Univer Excel feature suite (sort/filter/find-replace/CF/validation/table/note/comment/hyperlink/drawing) + persist `resources` — *shipped, build-verified*
- [x] **P1.1** Error bars (SD/SEM/95%CI) + automatic replicate aggregation
- [x] **P1.2** Individual data points overlay (bar+points / dot plots)
- [ ] **P1.3** Significance brackets & asterisks — *remaining*
- [x] **P1.4** Reference lines (H/V) & threshold bands
- [x] **P1.5** Chart polish: subtitle, legend position, canvas height *(editable margins / per-axis minor-tick control still open)*
- [x] **P2.6** Nonlinear model catalog (exp ×3, MM, 1/2-site binding, poly 2/3, Gaussian, Boltzmann, 3PL/4PL/5PL, linear/semilog) — *15 models, tested*
- [x] **P2.7** Fit parameter SE/CI + confidence & prediction bands + Sy.x + AICc + weighting (1/Y, 1/Y²)
- [ ] **P2.8** Linear regression surface (compare slopes/intercepts) — *remaining*
- [x] **P2.9** Confidence-band overlay wired into the standard-curve panel *(general main-chart fit overlay still open)*
- [x] **P3.10** Distribution library: PDFs, inverse t/F/χ², exact studentized-range, binomial/Poisson/hypergeometric — *tested vs published values*
- [x] **P3.11** Post-hoc suite (Tukey exact + Bonferroni/Šídák/Holm/Holm–Šídák + Dunn) + one/two-tailed + t-based CI
- [x] **P3.12** Two-way ANOVA (lib, tested) *(UI needs a factor-column input)*
- [x] **P3.13** Normality (Shapiro–Wilk + D'Agostino–Pearson) + Grubbs outliers — *wired into panel*
- [x] **P3.14** Contingency: Fisher's exact, McNemar, odds ratio/relative risk, χ² goodness-of-fit (lib, tested) *(UI needs a 2×2 input)*
- [x] **P3.15** Descriptives+: geometric mean/SD, skewness, kurtosis, sum, range, t-based CI — *in the panel*
- [x] **P4.16** Real heatmap + correlation-matrix traces *(contour still open)*
- [x] **P4.17** Volcano, Bland–Altman, ROC (+AUC), Kaplan–Meier, forest — *ROC/KM/Bland–Altman math tested*
- [x] **P4.18** Q–Q (normal) + ECDF *(P–P / KDE still open)*
- [ ] **P4.19** Faceting / small multiples / estimation plots — *remaining*
- [ ] **P4.20** Long-tail chart types — *remaining*
- [ ] **P5.21** Formula audit + custom lab functions — *remaining*
- [ ] **P5.22** Named ranges / data tools — *remaining*
- [ ] **P5.23** Pivot tables + sparklines — *remaining (Univer Pro or custom)*
- [ ] **P5.24** xlsx fidelity + PDF export — *remaining*
- [ ] **P6.25** Structured objects + auto-recompute — *remaining*
- [ ] **P6.26** Version history — *remaining*
- [ ] **P6.27** Layout composer + methods text — *remaining*
- [ ] **P6.28** Advanced regression + survival + TOST — *remaining*

---

## 6. Key files

| Area | File |
|---|---|
| Workspace orchestration + chart builder | `components/data-analysis/data-analysis-workspace.tsx` |
| Chart renderer | `components/data-analysis/plotly-chart.tsx` |
| Spreadsheet mount + presets | `components/spreadsheet/univer-workbook-view.tsx` |
| Workspace feature presets (P0) | `components/spreadsheet/univer-workspace-presets.ts` |
| Snapshot normalize / resources | `components/spreadsheet/spreadsheet-univer-shared.ts` |
| xlsx ↔ snapshot bridge | `lib/spreadsheet-workbook.ts` |
| Statistics | `lib/data-analysis/statistics.ts` |
| Curve fitting | `lib/data-analysis/curve-fitting.ts` |
| Distributions | `lib/data-analysis/distributions.ts` |
| Stats UI | `components/data-analysis/stats-panel.tsx` |
| Standard curve UI | `components/data-analysis/standard-curve-panel.tsx` |
| Plate model | `components/data-analysis/plate-view.tsx`, `lib/data-analysis/plate.ts` |
| Chart export | `lib/data-analysis/chart-export.ts`, `components/data-analysis/export-menu.tsx` |
| Schema | `scripts/044_experiment_data_workbook_links_chat_metadata.sql`, `scripts/103_data_analysis_templates.sql` |
