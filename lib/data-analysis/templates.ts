/**
 * Data-Analysis templates, baked-in bio-analysis starting points (with example
 * data) plus the shape used for a user's own saved setups. A template carries a
 * chart/plate `config` (no data of its own unless `aoa` is set) and a target
 * `phase`, applied to whatever sheet is open.
 */

export type AnalysisTemplate = {
  id: string
  name: string
  description: string
  category: string
  builtin: boolean
  /** Example data to seed (built-ins only). */
  aoa?: (string | number)[][]
  /** Chart + plate configuration to apply. */
  config: Record<string, unknown>
  /** Which workspace tab to open ("chart" | "stats" | "curve" | "plate"). */
  phase: string
}

/** The ELISA standard-curve dataset, also the app's opening demo. */
export const ELISA_AOA: (string | number)[][] = [
  ["Concentration (pg/mL)", "OD450", "Sample"],
  [1000, 2.85, "Std 1"],
  [500, 2.42, "Std 2"],
  [250, 1.98, "Std 3"],
  [125, 1.45, "Std 4"],
  [62.5, 0.92, "Std 5"],
  [31.25, 0.51, "Std 6"],
  [15.6, 0.28, "Std 7"],
  [0, 0.05, "Blank"],
  ["", 1.72, "Sample A"],
  ["", 0.68, "Sample B"],
  ["", 2.1, "Sample C"],
]

export const BUILTIN_TEMPLATES: AnalysisTemplate[] = [
  {
    id: "elisa", name: "ELISA quantification", category: "Immunoassay", builtin: true,
    description: "4PL standard curve, blank subtraction, back-calculated unknowns.",
    aoa: ELISA_AOA,
    config: { chartType: "scatter", xKey: "Concentration (pg/mL)", yKeys: ["OD450"], title: "ELISA standard curve", xLabel: "Concentration", xUnit: "pg/mL", yLabel: "OD₄₅₀", yUnit: "" },
    phase: "curve",
  },
  {
    id: "doseresponse", name: "Dose–response / IC50", category: "Pharmacology", builtin: true,
    description: "Sigmoidal inhibition curve; read IC₅₀ from the 4PL fit (log X).",
    aoa: [["Concentration (nM)", "% Inhibition"], [0.1, 3], [0.3, 6], [1, 14], [3, 32], [10, 58], [30, 80], [100, 92], [300, 97]],
    config: { chartType: "scatter", xKey: "Concentration (nM)", yKeys: ["% Inhibition"], title: "Dose–response", xLabel: "Concentration", xUnit: "nM", yLabel: "% Inhibition", yUnit: "" },
    phase: "curve",
  },
  {
    id: "growth", name: "Growth curve", category: "Microbiology", builtin: true,
    description: "OD₆₀₀ over time for two conditions, line chart with markers.",
    aoa: [["Time (h)", "Control OD600", "Treated OD600"], [0, 0.05, 0.05], [2, 0.08, 0.07], [4, 0.18, 0.12], [6, 0.41, 0.22], [8, 0.79, 0.38], [10, 1.12, 0.55], [12, 1.34, 0.66], [24, 1.51, 0.78]],
    config: { chartType: "line", xKey: "Time (h)", yKeys: ["Control OD600", "Treated OD600"], title: "Growth curve", xLabel: "Time", xUnit: "h", yLabel: "OD₆₀₀", yUnit: "" },
    phase: "chart",
  },
  {
    id: "bradford", name: "Bradford / BCA protein", category: "Protein", builtin: true,
    description: "Protein standard curve, fit linear and back-calculate concentrations.",
    aoa: [["Protein (µg/mL)", "A595"], [0, 0.04], [125, 0.18], [250, 0.31], [500, 0.58], [750, 0.84], [1000, 1.09], [1500, 1.55], [2000, 1.98]],
    config: { chartType: "scatter", xKey: "Protein (µg/mL)", yKeys: ["A595"], title: "Bradford protein assay", xLabel: "Protein", xUnit: "µg/mL", yLabel: "A₅₉₅", yUnit: "" },
    phase: "curve",
  },
  {
    id: "qpcr", name: "qPCR Cq", category: "Molecular", builtin: true,
    description: "Target vs reference Cq per sample, grouped bars (compute ΔΔCt from means).",
    aoa: [["Sample", "Target Cq", "Reference Cq"], ["Control", 24.1, 18.2], ["Control", 24.3, 18.1], ["Knockdown", 26.8, 18.3], ["Knockdown", 26.9, 18.2]],
    config: { chartType: "bar", xKey: "Sample", yKeys: ["Target Cq", "Reference Cq"], title: "qPCR Cq by sample", xLabel: "Sample", xUnit: "", yLabel: "Cq", yUnit: "" },
    phase: "chart",
  },
  {
    id: "kinetics", name: "Enzyme kinetics", category: "Enzymology", builtin: true,
    description: "Rate vs [substrate], Michaelis–Menten saturation (Vmax / Km).",
    aoa: [["[S] (µM)", "Rate (µM/min)"], [2, 12], [5, 26], [10, 42], [20, 60], [50, 82], [100, 95], [200, 103], [500, 108]],
    config: { chartType: "scatter", xKey: "[S] (µM)", yKeys: ["Rate (µM/min)"], title: "Michaelis–Menten", xLabel: "[S]", xUnit: "µM", yLabel: "Rate", yUnit: "µM/min" },
    phase: "chart",
  },
]

/** Per-category accent + glyph kind for the gallery cards. */
export const CATEGORY_STYLE: Record<string, { color: string; kind: "curve" | "line" | "bars" | "custom" }> = {
  Immunoassay: { color: "#0072B2", kind: "curve" },
  Pharmacology: { color: "#7c3aed", kind: "curve" },
  Microbiology: { color: "#009E73", kind: "line" },
  Protein: { color: "#E69F00", kind: "line" },
  Molecular: { color: "#0891b2", kind: "bars" },
  Enzymology: { color: "#db2777", kind: "curve" },
  Custom: { color: "var(--n9-accent, #965034)", kind: "custom" },
}
