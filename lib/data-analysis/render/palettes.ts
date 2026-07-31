/**
 * Figure palettes.
 *
 * One source of truth, shared by the spec-driven renderer and the existing
 * chart workspace, so a colour chosen in one place means the same thing in the
 * other and an exported figure matches what was on screen.
 *
 * Three things are tracked per palette because they change what it is FOR:
 *
 *   kind        qualitative palettes separate categories; sequential ones encode
 *               magnitude (heatmaps); diverging ones encode distance from a
 *               midpoint (log fold-change, volcano, correlation matrices).
 *               Using a sequential ramp for unordered groups implies an order
 *               that is not in the data.
 *
 *   cvdSafe     whether the palette survives the common colour-vision
 *               deficiencies. Roughly 1 in 12 men has one, and a reviewer who
 *               cannot separate two lines cannot check the claim, so this is
 *               surfaced in the picker rather than left for the author to know.
 *
 *   print       whether it holds up in greyscale. Many journals still print
 *               mono, and a figure that collapses to three identical greys is
 *               unreadable in the version of record.
 *
 * PROVENANCE OF THE JOURNAL-NAMED SETS. These are the `ggsci` R package's
 * palettes (npg, aaas, lancet, nejm, jama) — one author's derivation from
 * figures published in those journals, widely used in the R ecosystem. No
 * journal publishes an official palette, and none of these is endorsed by one.
 * The names say which house style they were derived from; they are not a claim
 * that a journal requires or supplies these colours. Each note says so, because
 * a palette labelled "Nature" that a user believes is a submission requirement
 * is a small lie the product would be telling on every figure.
 */

export type PaletteKind = "qualitative" | "sequential" | "diverging"

export interface PaletteDefinition {
  id: string
  label: string
  kind: PaletteKind
  colours: string[]
  cvdSafe: boolean
  /** Legible when the journal prints in greyscale. */
  print: boolean
  /** One line for the picker, explaining when to reach for it. */
  note: string
}

export const PALETTE_DEFINITIONS: PaletteDefinition[] = [
  /* ── Qualitative: colour-blind safe ──────────────────────────────────── */
  {
    id: "okabe-ito",
    label: "Okabe-Ito",
    kind: "qualitative",
    colours: ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#F0E442", "#000000"],
    cvdSafe: true,
    print: false,
    note: "Designed to stay distinguishable with any colour-vision deficiency.",
  },
  {
    id: "tol-bright",
    label: "Tol bright",
    kind: "qualitative",
    colours: ["#4477AA", "#EE6677", "#228833", "#CCBB44", "#66CCEE", "#AA3377", "#BBBBBB"],
    cvdSafe: true,
    print: false,
    note: "High contrast on white; holds up under all three deficiency types.",
  },
  {
    id: "tol-muted",
    label: "Tol muted",
    kind: "qualitative",
    colours: ["#332288", "#88CCEE", "#44AA99", "#117733", "#999933", "#DDCC77", "#CC6677", "#882255", "#AA4499"],
    cvdSafe: true,
    print: false,
    note: "Nine quiet hues; the safe choice when a figure has many series.",
  },
  {
    id: "tol-light",
    label: "Tol light",
    kind: "qualitative",
    colours: ["#77AADD", "#EE8866", "#EEDD88", "#FFAABB", "#99DDFF", "#44BB99", "#BBCC33", "#DDDDDD"],
    cvdSafe: true,
    print: false,
    note: "Pale fills for stacked areas and large blocks of colour.",
  },

  /* ── Qualitative: journal house styles ───────────────────────────────── */
  {
    id: "nature",
    label: "Nature",
    kind: "qualitative",
    colours: ["#E64B35", "#4DBBD5", "#00A087", "#3C5488", "#F39B7F", "#8491B4", "#91D1C2", "#DC0000", "#7E6148"],
    cvdSafe: false,
    print: false,
    note: "ggsci npg, derived from Nature figures. Not an official journal palette.",
  },
  {
    id: "science",
    label: "Science",
    kind: "qualitative",
    colours: ["#3B4992", "#EE0000", "#008B45", "#631879", "#008280", "#BB0021", "#5F559B", "#A20056"],
    cvdSafe: false,
    print: false,
    note: "ggsci aaas, derived from Science figures. Not an official journal palette.",
  },
  {
    id: "lancet",
    label: "Lancet",
    kind: "qualitative",
    colours: ["#00468B", "#ED0000", "#42B540", "#0099B4", "#925E9F", "#FDAF91", "#AD002A", "#ADB6B6"],
    cvdSafe: false,
    print: false,
    note: "ggsci lancet. Strong blue and red, which suits two trial arms.",
  },
  {
    id: "nejm",
    label: "NEJM",
    kind: "qualitative",
    colours: ["#BC3C29", "#0072B5", "#E18727", "#20854E", "#7876B1", "#6F99AD", "#FFDC91", "#EE4C97"],
    cvdSafe: false,
    print: false,
    note: "ggsci nejm, derived from NEJM figures. Not an official journal palette.",
  },
  {
    id: "jama",
    label: "JAMA",
    kind: "qualitative",
    colours: ["#374E55", "#DF8F44", "#00A1D5", "#B24745", "#79AF97", "#6A6599", "#80796B"],
    cvdSafe: false,
    print: true,
    note: "ggsci jama. Muted, and well separated in greyscale as well as colour.",
  },
  {
    // Renamed from "Cell": these are a common ggpubr example triplet extended
    // with a complementary set, not a journal-derived palette. Naming it after
    // a journal implied a provenance it does not have.
    id: "teal-amber",
    label: "Teal and amber",
    kind: "qualitative",
    colours: ["#00AFBB", "#E7B800", "#FC4E07", "#3D5A80", "#98C1D9", "#EE6C4D", "#293241"],
    cvdSafe: false,
    print: false,
    note: "High-contrast trio common in cell-biology figures; no journal source.",
  },
  {
    id: "prism",
    label: "Prism",
    kind: "qualitative",
    colours: ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7"],
    cvdSafe: false,
    print: false,
    note: "Tableau 10, the ordering GraphPad figures often use. For matching older panels.",
  },

  /* ── Qualitative: general purpose ────────────────────────────────────── */
  {
    id: "notes9",
    label: "Notes9",
    kind: "qualitative",
    colours: ["#965034", "#C07B5A", "#8F9F86", "#7A8FA7", "#C5A46D", "#A9736B", "#6F8E7E"],
    cvdSafe: false,
    print: false,
    note: "The product's own warm palette; matches the rest of the app.",
  },
  {
    id: "dark2",
    label: "Dark 2",
    kind: "qualitative",
    colours: ["#1B9E77", "#D95F02", "#7570B3", "#E7298A", "#66A61E", "#E6AB02", "#A6761D", "#666666"],
    cvdSafe: false,
    print: true,
    note: "ColorBrewer qualitative; readable on both light and dark backgrounds.",
  },
  {
    id: "set2",
    label: "Set 2",
    kind: "qualitative",
    colours: ["#66C2A5", "#FC8D62", "#8DA0CB", "#E78AC3", "#A6D854", "#FFD92F", "#E5C494", "#B3B3B3"],
    cvdSafe: false,
    print: false,
    note: "Soft pastels for filled shapes such as bars and boxes.",
  },
  {
    id: "paired",
    label: "Paired",
    kind: "qualitative",
    colours: ["#A6CEE3", "#1F78B4", "#B2DF8A", "#33A02C", "#FB9A99", "#E31A1C", "#FDBF6F", "#FF7F00"],
    cvdSafe: false,
    print: false,
    note: "Light/dark pairs, for treated-vs-control within each condition.",
  },
  {
    id: "grayscale",
    label: "Greyscale",
    kind: "qualitative",
    colours: ["#111111", "#4D4D4D", "#7A7A7A", "#A3A3A3", "#C6C6C6", "#E2E2E2"],
    cvdSafe: true,
    print: true,
    note: "For journals that print mono; separation comes from lightness alone.",
  },

  /* ── Sequential: magnitude ───────────────────────────────────────────── */
  {
    id: "viridis",
    label: "Viridis",
    kind: "sequential",
    colours: ["#440154", "#443983", "#31688E", "#21918C", "#35B779", "#90D743", "#FDE725"],
    cvdSafe: true,
    print: true,
    note: "Perceptually uniform: equal steps in the data look like equal steps in colour.",
  },
  {
    id: "cividis",
    label: "Cividis",
    kind: "sequential",
    colours: ["#00224E", "#123570", "#3B496C", "#575D6D", "#707173", "#8A8779", "#A59C74", "#C3B369", "#E1CC55", "#FEE838"],
    cvdSafe: true,
    print: true,
    note: "Built for colour-vision deficiency; the safest heatmap ramp.",
  },
  {
    id: "magma",
    label: "Magma",
    kind: "sequential",
    colours: ["#000004", "#2C115F", "#721F81", "#B63679", "#F1605D", "#FEAF77", "#FCFDBF"],
    cvdSafe: true,
    print: true,
    note: "Dark-to-light, good for dense heatmaps on a dark background.",
  },
  {
    id: "blues",
    label: "Blues",
    kind: "sequential",
    colours: ["#F7FBFF", "#DEEBF7", "#C6DBEF", "#9ECAE1", "#6BAED6", "#4292C6", "#2171B5", "#08519C", "#08306B"],
    cvdSafe: true,
    print: true,
    note: "Single-hue ramp; the conservative choice for a single measure.",
  },

  /* ── Diverging: distance from a midpoint ─────────────────────────────── */
  {
    id: "rdbu",
    label: "Red-Blue",
    kind: "diverging",
    colours: ["#67001F", "#B2182B", "#D6604D", "#F4A582", "#FDDBC7", "#F7F7F7", "#D1E5F0", "#92C5DE", "#4393C3", "#2166AC", "#053061"],
    cvdSafe: true,
    print: false,
    note: "Up and down around zero: log fold-change, correlation, volcano plots.",
  },
  {
    id: "brbg",
    label: "Brown-Teal",
    kind: "diverging",
    colours: ["#543005", "#8C510A", "#BF812D", "#DFC27D", "#F6E8C3", "#F5F5F5", "#C7EAE5", "#80CDC1", "#35978F", "#01665E", "#003C30"],
    cvdSafe: true,
    print: false,
    note: "Diverging without red or green, when red-green confusion is a concern.",
  },
  {
    id: "piyg",
    label: "Pink-Green",
    kind: "diverging",
    colours: ["#8E0152", "#C51B7D", "#DE77AE", "#F1B6DA", "#FDE0EF", "#F7F7F7", "#E6F5D0", "#B8E186", "#7FBC41", "#4D9221", "#276419"],
    cvdSafe: false,
    print: false,
    note: "High-contrast diverging ramp for enrichment and differential maps.",
  },
]

export const PALETTE_IDS = PALETTE_DEFINITIONS.map((p) => p.id)
export type PaletteId = (typeof PALETTE_DEFINITIONS)[number]["id"]

const BY_ID = new Map(PALETTE_DEFINITIONS.map((p) => [p.id, p]))

/** Legacy display names used by the existing chart workspace. */
const ALIASES: Record<string, string> = {
  "Okabe–Ito": "okabe-ito",
  "Okabe-Ito": "okabe-ito",
  Viridis: "viridis",
  Grayscale: "grayscale",
  Greyscale: "grayscale",
  Notes9: "notes9",
  cell: "teal-amber",
}

export function getPalette(id: string | null | undefined): PaletteDefinition {
  if (!id) return BY_ID.get("okabe-ito")!
  return BY_ID.get(id) ?? BY_ID.get(ALIASES[id] ?? "") ?? BY_ID.get("okabe-ito")!
}

/** Just the colours, which is what a renderer usually wants. */
export function paletteColours(id: string | null | undefined): string[] {
  return getPalette(id).colours
}

/** Grouped for the picker, in the order they should be offered. */
export function palettesByKind(): Record<PaletteKind, PaletteDefinition[]> {
  return {
    qualitative: PALETTE_DEFINITIONS.filter((p) => p.kind === "qualitative"),
    sequential: PALETTE_DEFINITIONS.filter((p) => p.kind === "sequential"),
    diverging: PALETTE_DEFINITIONS.filter((p) => p.kind === "diverging"),
  }
}

/**
 * Sample a ramp at n evenly spaced points.
 *
 * A sequential or diverging palette is a continuum that happens to be stored as
 * stops, so drawing k categories from it means interpolating rather than
 * taking the first k stops and leaving the rest of the range unused.
 */
export function sampleRamp(id: string, n: number): string[] {
  const stops = getPalette(id).colours
  if (n <= 1) return [stops[Math.floor(stops.length / 2)]]
  const rgb = stops.map(hexToRgb)
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (rgb.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, rgb.length - 1)
    const f = t - lo
    return rgbToHex(
      rgb[lo].map((c, k) => Math.round(c + (rgb[hi][k] - c) * f)) as [number, number, number]
    )
  })
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "")
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`
}

/** Plotly colorscale form: [[0, colour], … [1, colour]]. */
export function toColorscale(id: string): [number, string][] {
  const stops = getPalette(id).colours
  return stops.map((colour, i) => [i / (stops.length - 1), colour])
}
