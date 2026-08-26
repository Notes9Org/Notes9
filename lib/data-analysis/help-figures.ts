/**
 * The figures the manual explains itself with.
 *
 * Each builder returns Plotly traces and a layout, drawn by the same renderer
 * the product draws every chart with — so a reader comparing "what a violin
 * shows" against their own violin is looking at the same machinery, not at a
 * picture of it that may have drifted.
 *
 * The fixtures are deterministic. No `Math.random()`: a manual whose
 * illustration changes shape on every open is a manual nobody trusts, and a
 * reader who spots a difference should be able to conclude something from it.
 * Where a figure needs to look sampled, the numbers below are a fixed sample
 * that was generated once and written down.
 */

export type HelpTrace = Record<string, unknown>
export interface HelpFigureSpec {
  data: HelpTrace[]
  layout: Record<string, unknown>
  /** Height in px; figures are small and vary by what they must show. */
  height: number
}

/* Okabe–Ito, the palette the product's default uses: safe for the common forms
   of colour blindness, and the same colours a reader will see in their own
   charts. */
const BLUE = "#0072B2"
const ORANGE = "#D55E00"
const GREEN = "#009E73"
const GREY = "#8c8c8c"

const VEHICLE = [4.1, 4.6, 3.8, 5.2, 4.4, 4.9, 4.0, 5.5, 4.3, 4.7]
const TREATED = [7.2, 8.1, 6.4, 7.9, 8.8, 7.1, 6.9, 8.4, 7.6, 9.1]
const DOSE = [0.39, 0.78, 1.56, 3.13, 6.25, 12.5, 25, 50, 100]
const SIGNAL = [0.06, 0.09, 0.16, 0.31, 0.62, 1.05, 1.42, 1.63, 1.71]
const SKEWED = [1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.1, 2.6, 3.4, 5.2, 9.8]

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    margin: { t: 24, r: 12, b: 36, l: 44 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "system-ui, sans-serif", size: 11 },
    showlegend: false,
    xaxis: { zeroline: false, gridcolor: "rgba(128,128,128,0.18)" },
    yaxis: { zeroline: false, gridcolor: "rgba(128,128,128,0.18)" },
    ...overrides,
  }
}

const jitter = [-0.13, 0.09, -0.05, 0.16, -0.18, 0.04, 0.12, -0.09, 0.18, -0.02]

const BUILDERS: Record<string, () => HelpFigureSpec> = {
  /* ── Error bars: the whole point is that the three differ ─────────────── */
  "error-bars": () => {
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    const sd = (a: number[]) => {
      const m = mean(a)
      return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1))
    }
    const m = mean(TREATED)
    const s = sd(TREATED)
    const sem = s / Math.sqrt(TREATED.length)
    return {
      data: [
        {
          type: "bar",
          x: ["SD", "SEM", "95% CI"],
          y: [m, m, m],
          marker: { color: [GREY, GREY, GREY], opacity: 0.35 },
          error_y: { type: "data", array: [s, sem, 1.96 * sem], color: BLUE, thickness: 2, width: 8 },
        },
      ],
      layout: base({ yaxis: { title: { text: "Signal" }, gridcolor: "rgba(128,128,128,0.18)" } }),
      height: 190,
    }
  },

  /* ── Same data, four ways: the argument for showing the points ────────── */
  "bar-vs-points": () => ({
    data: [
      { type: "bar", x: ["Vehicle", "Treated"], y: [4.55, 7.75], marker: { color: GREY, opacity: 0.3 }, width: 0.5 },
      {
        type: "scatter",
        mode: "markers",
        x: VEHICLE.map((_, i) => -0.0 + jitter[i]),
        y: VEHICLE,
        marker: { color: BLUE, size: 6 },
        xaxis: "x",
      },
      {
        type: "scatter",
        mode: "markers",
        x: TREATED.map((_, i) => 1 + jitter[i]),
        y: TREATED,
        marker: { color: ORANGE, size: 6 },
      },
    ],
    layout: base({
      xaxis: { tickvals: [0, 1], ticktext: ["Vehicle", "Treated"], gridcolor: "rgba(0,0,0,0)" },
      yaxis: { title: { text: "Signal" }, gridcolor: "rgba(128,128,128,0.18)" },
    }),
    height: 200,
  }),

  box: () => ({
    data: [
      { type: "box", y: VEHICLE, name: "Vehicle", marker: { color: BLUE }, boxpoints: "all", jitter: 0.5, pointpos: 0 },
      { type: "box", y: TREATED, name: "Treated", marker: { color: ORANGE }, boxpoints: "all", jitter: 0.5, pointpos: 0 },
    ],
    layout: base({ yaxis: { title: { text: "Signal" }, gridcolor: "rgba(128,128,128,0.18)" } }),
    height: 200,
  }),

  violin: () => ({
    data: [
      { type: "violin", y: [...VEHICLE, ...VEHICLE.map((v) => v + 0.3)], name: "Vehicle", line: { color: BLUE }, box: { visible: true }, meanline: { visible: true } },
      { type: "violin", y: [...TREATED, ...TREATED.map((v) => v - 0.4)], name: "Treated", line: { color: ORANGE }, box: { visible: true }, meanline: { visible: true } },
    ],
    layout: base({ yaxis: { title: { text: "Signal" }, gridcolor: "rgba(128,128,128,0.18)" } }),
    height: 200,
  }),

  histogram: () => ({
    data: [{ type: "histogram", x: [...VEHICLE, ...TREATED, ...SKEWED], marker: { color: BLUE, opacity: 0.75 }, nbinsx: 12 }],
    layout: base({ xaxis: { title: { text: "Value" } }, yaxis: { title: { text: "Count" }, gridcolor: "rgba(128,128,128,0.18)" } }),
    height: 190,
  }),

  "scatter-fit": () => ({
    data: [
      { type: "scatter", mode: "markers", x: DOSE, y: SIGNAL, marker: { color: BLUE, size: 8 } },
      { type: "scatter", mode: "lines", x: [0.39, 100], y: [0.09, 1.66], line: { color: ORANGE, width: 2 } },
    ],
    layout: base({
      xaxis: { title: { text: "Concentration" }, type: "log", gridcolor: "rgba(128,128,128,0.18)" },
      yaxis: { title: { text: "OD450" }, gridcolor: "rgba(128,128,128,0.18)" },
    }),
    height: 200,
  }),

  /* ── Pearson's blind spot, in one picture ─────────────────────────────── */
  "pearson-blindspot": () => {
    const x = [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3]
    return {
      data: [
        { type: "scatter", mode: "markers", x, y: x.map((v) => -(v * v) + 9), marker: { color: ORANGE, size: 8 } },
      ],
      layout: base({
        xaxis: { title: { text: "x" }, gridcolor: "rgba(128,128,128,0.18)" },
        yaxis: { title: { text: "y" }, gridcolor: "rgba(128,128,128,0.18)" },
        annotations: [
          {
            x: 0, y: 9.6, text: "Pearson r ≈ 0", showarrow: false,
            font: { size: 11, color: ORANGE },
          },
        ],
      }),
      height: 190,
    }
  },

  /* ── A 4PL, with the parameters marked ────────────────────────────────── */
  "standard-curve": () => {
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i <= 60; i++) {
      const x = 0.3 * Math.pow(10, (i / 60) * 2.7)
      xs.push(x)
      ys.push(0.04 + (1.78 - 0.04) / (1 + Math.pow(9.4 / x, 1.15)))
    }
    return {
      data: [
        { type: "scatter", mode: "lines", x: xs, y: ys, line: { color: ORANGE, width: 2.5 } },
        { type: "scatter", mode: "markers", x: DOSE, y: SIGNAL, marker: { color: BLUE, size: 8 } },
        { type: "scatter", mode: "markers", x: [22], y: [1.32], marker: { color: GREEN, size: 10, symbol: "diamond" } },
      ],
      layout: base({
        xaxis: { title: { text: "Concentration (pg/mL)" }, type: "log", gridcolor: "rgba(128,128,128,0.18)" },
        yaxis: { title: { text: "OD450" }, gridcolor: "rgba(128,128,128,0.18)" },
        shapes: [
          { type: "line", x0: 9.4, x1: 9.4, y0: 0.04, y1: 0.91, line: { color: GREY, width: 1, dash: "dot" } },
        ],
        annotations: [
          { x: Math.log10(9.4), y: 0.2, text: "EC₅₀", showarrow: false, font: { size: 11, color: GREY } },
          { x: Math.log10(22), y: 1.55, text: "unknown", showarrow: false, font: { size: 11, color: GREEN } },
        ],
      }),
      height: 210,
    }
  },

  /* ── Skew, and why it sends you to a rank test ────────────────────────── */
  "normal-vs-skewed": () => ({
    data: [
      { type: "box", x: VEHICLE.concat(TREATED.map((v) => v - 3)), name: "Roughly normal", marker: { color: BLUE }, boxpoints: "all", jitter: 0.6, orientation: "h" },
      { type: "box", x: SKEWED, name: "Skewed", marker: { color: ORANGE }, boxpoints: "all", jitter: 0.6, orientation: "h" },
    ],
    layout: base({ showlegend: false, margin: { t: 20, r: 12, b: 32, l: 96 } }),
    height: 180,
  }),

  /* ── Paired data: the lines are the information ───────────────────────── */
  paired: () => {
    const before = [4.1, 4.6, 3.8, 5.2, 4.4, 4.9, 4.0]
    const after = [5.0, 5.3, 4.2, 6.4, 4.7, 6.0, 4.4]
    const lines: HelpTrace[] = before.map((b, i) => ({
      type: "scatter",
      mode: "lines+markers",
      x: ["Before", "After"],
      y: [b, after[i]],
      line: { color: GREY, width: 1 },
      marker: { color: i % 2 ? BLUE : ORANGE, size: 7 },
    }))
    return {
      data: lines,
      layout: base({ yaxis: { title: { text: "Signal" }, gridcolor: "rgba(128,128,128,0.18)" } }),
      height: 190,
    }
  },

  /* ── Grubbs: one point, and what it does to the mean ──────────────────── */
  outlier: () => ({
    data: [
      {
        type: "scatter",
        mode: "markers",
        x: VEHICLE.map((_, i) => i + 1),
        y: [...VEHICLE.slice(0, 9), 12.4],
        marker: {
          color: [...Array(9).fill(BLUE), ORANGE],
          size: [...Array(9).fill(7), 11],
        },
      },
    ],
    layout: base({
      xaxis: { title: { text: "Row" }, gridcolor: "rgba(128,128,128,0.18)" },
      yaxis: { title: { text: "Signal" }, gridcolor: "rgba(128,128,128,0.18)" },
      shapes: [
        { type: "line", x0: 0.5, x1: 10.5, y0: 4.55, y1: 4.55, line: { color: BLUE, width: 1, dash: "dot" } },
        { type: "line", x0: 0.5, x1: 10.5, y0: 5.34, y1: 5.34, line: { color: ORANGE, width: 1, dash: "dot" } },
      ],
      annotations: [
        { x: 10, y: 12.4, text: "p = 0.003", showarrow: false, yshift: 16, font: { size: 11, color: ORANGE } },
        { x: 2.2, y: 4.55, text: "mean without", showarrow: false, yshift: -12, font: { size: 10, color: BLUE } },
        { x: 2.0, y: 5.34, text: "mean with", showarrow: false, yshift: 12, font: { size: 10, color: ORANGE } },
      ],
    }),
    height: 200,
  }),

  "kaplan-meier": () => ({
    data: [
      { type: "scatter", mode: "lines", line: { shape: "hv", color: BLUE, width: 2 }, x: [0, 5, 9, 14, 20, 26, 34, 40], y: [1, 0.92, 0.83, 0.7, 0.62, 0.5, 0.42, 0.38] },
      { type: "scatter", mode: "lines", line: { shape: "hv", color: ORANGE, width: 2 }, x: [0, 6, 12, 18, 25, 33, 40], y: [1, 0.85, 0.66, 0.5, 0.34, 0.22, 0.15] },
    ],
    layout: base({
      xaxis: { title: { text: "Days" }, gridcolor: "rgba(128,128,128,0.18)" },
      yaxis: { title: { text: "Survival" }, range: [0, 1.05], gridcolor: "rgba(128,128,128,0.18)" },
    }),
    height: 190,
  }),

  forest: () => ({
    data: [
      {
        type: "scatter",
        mode: "markers",
        x: [0.82, 1.4, 2.1, 0.95, 1.75],
        y: ["Marker E", "Marker D", "Marker C", "Marker B", "Marker A"],
        marker: { color: BLUE, size: 9, symbol: "square" },
        error_x: { type: "data", symmetric: false, array: [0.5, 0.6, 0.9, 0.35, 0.7], arrayminus: [0.3, 0.45, 0.7, 0.3, 0.55], color: GREY, thickness: 1.5 },
      },
    ],
    layout: base({
      margin: { t: 20, r: 16, b: 34, l: 78 },
      xaxis: { title: { text: "Effect (95% CI)" }, gridcolor: "rgba(128,128,128,0.18)" },
      shapes: [{ type: "line", x0: 1, x1: 1, y0: -0.6, y1: 4.6, line: { color: GREY, width: 1, dash: "dot" } }],
    }),
    height: 200,
  }),

  /* ── Multiplicity, as a count rather than a sentence ──────────────────── */
  multiplicity: () => {
    const n = [1, 2, 5, 10, 20, 50, 100]
    return {
      data: [
        { type: "scatter", mode: "lines+markers", x: n, y: n.map((k) => 1 - Math.pow(0.95, k)), line: { color: ORANGE, width: 2 }, marker: { size: 6 } },
      ],
      layout: base({
        xaxis: { title: { text: "Comparisons" }, gridcolor: "rgba(128,128,128,0.18)" },
        yaxis: { title: { text: "Chance of ≥1 false positive" }, tickformat: ".0%", range: [0, 1], gridcolor: "rgba(128,128,128,0.18)" },
      }),
      height: 190,
    }
  },
}

export function buildHelpFigure(kind: string): HelpFigureSpec | null {
  const builder = BUILDERS[kind]
  return builder ? builder() : null
}

export const HELP_FIGURE_KINDS = Object.keys(BUILDERS)
