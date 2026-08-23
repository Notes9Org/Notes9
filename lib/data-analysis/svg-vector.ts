/**
 * SVG → PDF and EPS, for figure export.
 *
 * Plotly already emits a faithful SVG of the figure, and PDF and EPS are vector
 * formats with the same primitive vocabulary, so the SVG is the source rather
 * than a second rendering path: what a journal gets is what is on screen, and
 * the text stays live text rather than becoming pixels.
 *
 * Coordinates are NOT rewritten. Both output formats carry a current
 * transformation matrix, so an SVG group's `transform` is emitted as `cm` (PDF)
 * or `concat` (PostScript) and the path data underneath is written verbatim.
 * That removes the whole class of bugs where a nested transform is applied to
 * some coordinates and not others: there is no coordinate arithmetic here to
 * get wrong, only a matrix handed to the format that already knows what to do
 * with it.
 *
 * Known ceilings, all deliberate:
 *   - Clip paths are ignored. Plotly clips the plot area; a mark drawn outside
 *     it would show. In practice the traces are already range-filtered.
 *   - EPS has no alpha (PostScript Level 2/3 has no simple transparency), so a
 *     semi-transparent mark comes out opaque there. PDF carries it properly.
 *   - PDF embeds the sans faces (Liberation Sans, metric-compatible with
 *     Helvetica) as a real font program. Serif and mono still emit a base-14
 *     REFERENCE and no font program, so a serif figure will still fail an
 *     Elsevier or Springer preflight. See `export/liberation-sans.ts`.
 *   - EPS embeds nothing at all: PostScript font embedding is Type 42 or Type 1,
 *     a second format this does not implement. Every EPS here references the
 *     base-14 faces and will fail the same preflight. PDF is the format to
 *     submit until that is closed.
 */

import {
  liberationSansBold,
  liberationSansRegular,
} from "@/lib/data-analysis/export/liberation-sans"
import {
  parseTrueType,
  pdfFontObjects,
  type EmbeddableFont,
} from "@/lib/data-analysis/export/truetype"

/* ── Geometry ──────────────────────────────────────────────────────────────*/

/** SVG/PDF/PostScript all spell a 2D affine the same way: [a b c d e f]. */
export type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** `m` then `n`, i.e. n applied in m's coordinate space. */
export function concat(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

const TRANSFORM_RE = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g

export function parseTransform(value: string | null): Matrix {
  if (!value) return IDENTITY
  let out = IDENTITY
  TRANSFORM_RE.lastIndex = 0
  for (let m = TRANSFORM_RE.exec(value); m; m = TRANSFORM_RE.exec(value)) {
    const a = m[2]
      .split(/[\s,]+/)
      .filter((p) => p.length > 0)
      .map(Number)
    const rad = (deg: number) => (deg * Math.PI) / 180
    switch (m[1]) {
      case "matrix":
        out = concat(out, [a[0], a[1], a[2], a[3], a[4], a[5]])
        break
      case "translate":
        out = concat(out, [1, 0, 0, 1, a[0] || 0, a[1] || 0])
        break
      case "scale":
        out = concat(out, [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0])
        break
      case "rotate": {
        const c = Math.cos(rad(a[0] || 0))
        const s = Math.sin(rad(a[0] || 0))
        const [cx, cy] = [a[1] || 0, a[2] || 0]
        // rotate(a cx cy) is translate(cx cy) rotate(a) translate(-cx -cy).
        out = concat(out, [1, 0, 0, 1, cx, cy])
        out = concat(out, [c, s, -s, c, 0, 0])
        out = concat(out, [1, 0, 0, 1, -cx, -cy])
        break
      }
      case "skewX":
        out = concat(out, [1, 0, Math.tan(rad(a[0] || 0)), 1, 0, 0])
        break
      case "skewY":
        out = concat(out, [1, Math.tan(rad(a[0] || 0)), 0, 1, 0, 0])
        break
    }
  }
  return out
}

/* ── Path data ─────────────────────────────────────────────────────────────*/

/**
 * Normalised to the four segments PDF and PostScript both have natively.
 * Arcs and the shorthand curve commands are converted on the way in, so the
 * writers below stay small enough to read in one sitting.
 */
export type Segment =
  | { c: "M"; x: number; y: number }
  | { c: "L"; x: number; y: number }
  | { c: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: "Z" }

const TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g

/**
 * An elliptical arc as up to four cubics.
 *
 * The endpoint→centre conversion is the one in the SVG specification's implementation
 * notes (F.6.5). Plotly draws every circular marker with `A`, so this is not an
 * exotic corner: without it a scatter plot exports with no points on it.
 */
function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number
): Segment[] {
  if (rxIn === 0 || ryIn === 0) return [{ c: "L", x: x2, y: y2 }]
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  const phi = (phiDeg * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cosPhi * dx + sinPhi * dy
  const y1p = -sinPhi * dx + cosPhi * dy
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coeff =
    (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator))
  const cxp = (coeff * (rx * y1p)) / ry
  const cyp = (-coeff * (ry * x1p)) / rx
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))
    const a = Math.acos(Math.min(1, Math.max(-1, dot)))
    return ux * vy - uy * vx < 0 ? -a : a
  }
  const ux = (x1p - cxp) / rx
  const uy = (y1p - cyp) / ry
  const vx = (-x1p - cxp) / rx
  const vy = (-y1p - cyp) / ry
  const theta1 = angle(1, 0, ux, uy)
  let sweepAngle = angle(ux, uy, vx, vy)
  if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI
  if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI

  const steps = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2)))
  const delta = sweepAngle / steps
  const k = (4 / 3) * Math.tan(delta / 4)
  const at = (t: number): [number, number] => [
    cosPhi * rx * Math.cos(t) - sinPhi * ry * Math.sin(t) + cx,
    sinPhi * rx * Math.cos(t) + cosPhi * ry * Math.sin(t) + cy,
  ]
  const slope = (t: number): [number, number] => [
    -cosPhi * rx * Math.sin(t) - sinPhi * ry * Math.cos(t),
    -sinPhi * rx * Math.sin(t) + cosPhi * ry * Math.cos(t),
  ]

  const out: Segment[] = []
  let t0 = theta1
  let [px, py] = [x1, y1]
  for (let i = 0; i < steps; i++) {
    const t1 = t0 + delta
    const [ex, ey] = at(t1)
    const [sx0, sy0] = slope(t0)
    const [sx1, sy1] = slope(t1)
    out.push({
      c: "C",
      x1: px + k * sx0,
      y1: py + k * sy0,
      x2: ex - k * sx1,
      y2: ey - k * sy1,
      x: ex,
      y: ey,
    })
    px = ex
    py = ey
    t0 = t1
  }
  return out
}

export function parsePathData(d: string): Segment[] {
  const tokens: (string | number)[] = []
  TOKEN_RE.lastIndex = 0
  for (let m = TOKEN_RE.exec(d); m; m = TOKEN_RE.exec(d)) {
    tokens.push(m[1] !== undefined ? m[1] : Number(m[2]))
  }
  const out: Segment[] = []
  let i = 0
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  let lastCubicCtrl: [number, number] | null = null
  let lastQuadCtrl: [number, number] | null = null
  let command = ""

  const num = () => tokens[i++] as number
  while (i < tokens.length) {
    if (typeof tokens[i] === "string") {
      command = tokens[i] as string
      i++
      // A bare Z carries no operands, and an implicit repeat of M means L.
      if (command === "Z" || command === "z") {
        out.push({ c: "Z" })
        cx = startX
        cy = startY
        lastCubicCtrl = null
        lastQuadCtrl = null
        continue
      }
    } else if (command === "M") {
      command = "L"
    } else if (command === "m") {
      command = "l"
    }
    const rel = command === command.toLowerCase()
    const ox = rel ? cx : 0
    const oy = rel ? cy : 0
    switch (command.toUpperCase()) {
      case "M": {
        cx = num() + ox
        cy = num() + oy
        startX = cx
        startY = cy
        out.push({ c: "M", x: cx, y: cy })
        lastCubicCtrl = null
        lastQuadCtrl = null
        break
      }
      case "L": {
        cx = num() + ox
        cy = num() + oy
        out.push({ c: "L", x: cx, y: cy })
        lastCubicCtrl = null
        lastQuadCtrl = null
        break
      }
      case "H": {
        cx = num() + ox
        out.push({ c: "L", x: cx, y: cy })
        lastCubicCtrl = null
        lastQuadCtrl = null
        break
      }
      case "V": {
        cy = num() + oy
        out.push({ c: "L", x: cx, y: cy })
        lastCubicCtrl = null
        lastQuadCtrl = null
        break
      }
      case "C": {
        const x1 = num() + ox
        const y1 = num() + oy
        const x2 = num() + ox
        const y2 = num() + oy
        cx = num() + ox
        cy = num() + oy
        out.push({ c: "C", x1, y1, x2, y2, x: cx, y: cy })
        lastCubicCtrl = [x2, y2]
        lastQuadCtrl = null
        break
      }
      case "S": {
        const [rx, ry] = lastCubicCtrl ?? [cx, cy]
        const x1 = 2 * cx - rx
        const y1 = 2 * cy - ry
        const x2 = num() + ox
        const y2 = num() + oy
        cx = num() + ox
        cy = num() + oy
        out.push({ c: "C", x1, y1, x2, y2, x: cx, y: cy })
        lastCubicCtrl = [x2, y2]
        lastQuadCtrl = null
        break
      }
      case "Q":
      case "T": {
        let qx: number
        let qy: number
        if (command.toUpperCase() === "Q") {
          qx = num() + ox
          qy = num() + oy
        } else {
          const [rx, ry] = lastQuadCtrl ?? [cx, cy]
          qx = 2 * cx - rx
          qy = 2 * cy - ry
        }
        const ex = num() + ox
        const ey = num() + oy
        // Degree elevation: a quadratic is the cubic with controls a third of
        // the way from each endpoint towards the quadratic's own control.
        out.push({
          c: "C",
          x1: cx + (2 / 3) * (qx - cx),
          y1: cy + (2 / 3) * (qy - cy),
          x2: ex + (2 / 3) * (qx - ex),
          y2: ey + (2 / 3) * (qy - ey),
          x: ex,
          y: ey,
        })
        lastQuadCtrl = [qx, qy]
        lastCubicCtrl = null
        cx = ex
        cy = ey
        break
      }
      case "A": {
        const rx = num()
        const ry = num()
        const rot = num()
        const large = num() !== 0
        const sweep = num() !== 0
        const ex = num() + ox
        const ey = num() + oy
        out.push(...arcToCubics(cx, cy, rx, ry, rot, large, sweep, ex, ey))
        cx = ex
        cy = ey
        lastCubicCtrl = null
        lastQuadCtrl = null
        break
      }
      default:
        // An unknown command would otherwise spin forever on the same token.
        i++
    }
  }
  return out
}

/* ── The intermediate figure ───────────────────────────────────────────────*/

export type Rgb = [number, number, number]

export interface VectorPath {
  kind: "path"
  ctm: Matrix
  segments: Segment[]
  fill: Rgb | null
  stroke: Rgb | null
  strokeWidth: number
  dash: number[] | null
  fillAlpha: number
  strokeAlpha: number
}

export type FontFamily =
  | "helvetica"
  | "helvetica-bold"
  | "times"
  | "times-bold"
  | "courier"
  | "courier-bold"

export interface VectorText {
  kind: "text"
  ctm: Matrix
  x: number
  y: number
  text: string
  size: number
  font: FontFamily
  fill: Rgb
  anchor: "start" | "middle" | "end"
  alpha: number
}

export type VectorNode = VectorPath | VectorText

export interface VectorFigure {
  /** CSS pixels, as the SVG declares them. */
  width: number
  height: number
  nodes: VectorNode[]
}

/* ── SVG walking ───────────────────────────────────────────────────────────*/

const INHERITED = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
] as const

type Style = Record<string, string>

function styleOf(el: Element, inherited: Style): Style {
  const out: Style = { ...inherited }
  for (const name of INHERITED) {
    const v = el.getAttribute(name)
    if (v !== null && v !== "") out[name] = v
  }
  // The `style` attribute beats presentation attributes, which is the order
  // Plotly relies on: it writes geometry as attributes and paint as style.
  const raw = el.getAttribute("style")
  if (raw) {
    for (const decl of raw.split(";")) {
      const colon = decl.indexOf(":")
      if (colon > 0) out[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim()
    }
  }
  return out
}

const NAMED: Record<string, Rgb> = {
  black: [0, 0, 0],
  white: [1, 1, 1],
  red: [1, 0, 0],
  green: [0, 0.5, 0],
  blue: [0, 0, 1],
  gray: [0.5, 0.5, 0.5],
  grey: [0.5, 0.5, 0.5],
}

export function parseColour(value: string | undefined): Rgb | null {
  if (!value) return null
  const s = value.trim().toLowerCase()
  if (s === "none" || s === "transparent") return null
  const fn = /^rgba?\(([^)]+)\)/.exec(s)
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return [parts[0] / 255, parts[1] / 255, parts[2] / 255]
    }
    return null
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1]
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ]
  }
  return NAMED[s] ?? null
}

function num(value: string | null | undefined, fallback = 0): number {
  if (value == null) return fallback
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

function alphaOf(style: Style, key: "fill-opacity" | "stroke-opacity"): number {
  const own = style[key] === undefined ? 1 : num(style[key], 1)
  const group = style.opacity === undefined ? 1 : num(style.opacity, 1)
  return Math.min(1, Math.max(0, own * group))
}

function fontOf(style: Style): FontFamily {
  const family = (style["font-family"] ?? "").toLowerCase()
  const weight = style["font-weight"] ?? ""
  // Weight is read before the family is branched on, not after. Reading it
  // inside the sans branch is why a bold serif axis title used to come out
  // roman: the serif and mono returns short-circuited past the weight test.
  const bold = weight === "bold" || num(weight, 400) >= 600
  if (/mono|courier|consolas|menlo/.test(family)) return bold ? "courier-bold" : "courier"
  if (/serif|georgia|times/.test(family) && !/sans-serif/.test(family)) {
    return bold ? "times-bold" : "times"
  }
  return bold ? "helvetica-bold" : "helvetica"
}

/** Elements that describe rather than draw. */
const SKIPPED = new Set(["defs", "clippath", "mask", "marker", "title", "desc", "metadata", "style"])

function pathFrom(el: Element, tag: string): Segment[] | null {
  switch (tag) {
    case "path":
      return parsePathData(el.getAttribute("d") ?? "")
    case "rect": {
      const x = num(el.getAttribute("x"))
      const y = num(el.getAttribute("y"))
      const w = num(el.getAttribute("width"))
      const h = num(el.getAttribute("height"))
      if (w <= 0 || h <= 0) return null
      return [
        { c: "M", x, y },
        { c: "L", x: x + w, y },
        { c: "L", x: x + w, y: y + h },
        { c: "L", x, y: y + h },
        { c: "Z" },
      ]
    }
    case "line":
      return [
        { c: "M", x: num(el.getAttribute("x1")), y: num(el.getAttribute("y1")) },
        { c: "L", x: num(el.getAttribute("x2")), y: num(el.getAttribute("y2")) },
      ]
    case "polyline":
    case "polygon": {
      const pts = (el.getAttribute("points") ?? "")
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number)
      if (pts.length < 4) return null
      const segs: Segment[] = [{ c: "M", x: pts[0], y: pts[1] }]
      for (let i = 2; i + 1 < pts.length; i += 2) segs.push({ c: "L", x: pts[i], y: pts[i + 1] })
      if (tag === "polygon") segs.push({ c: "Z" })
      return segs
    }
    case "circle":
    case "ellipse": {
      const cx = num(el.getAttribute("cx"))
      const cy = num(el.getAttribute("cy"))
      const r = num(el.getAttribute("r"))
      const rx = tag === "circle" ? r : num(el.getAttribute("rx"))
      const ry = tag === "circle" ? r : num(el.getAttribute("ry"))
      if (rx <= 0 || ry <= 0) return null
      return [
        { c: "M", x: cx + rx, y: cy },
        ...arcToCubics(cx + rx, cy, rx, ry, 0, true, true, cx - rx, cy),
        ...arcToCubics(cx - rx, cy, rx, ry, 0, true, true, cx + rx, cy),
        { c: "Z" },
      ]
    }
    default:
      return null
  }
}

/**
 * Read an SVG document into the figure above.
 *
 * Uses the platform's own `DOMParser` rather than a parser of our own: the
 * browser has one, jsdom has one, and an SVG parser is exactly the kind of
 * thing that is never worth writing twice.
 */
export function parseSvg(svg: string): VectorFigure {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  const root = doc.documentElement
  if (!root || root.nodeName === "parsererror") {
    throw new Error("The figure's SVG could not be parsed.")
  }

  const viewBox = (root.getAttribute("viewBox") ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
  const width = num(root.getAttribute("width"), viewBox[2] || 700)
  const height = num(root.getAttribute("height"), viewBox[3] || 450)

  const nodes: VectorNode[] = []

  const walk = (el: Element, parentCtm: Matrix, inherited: Style) => {
    const tag = el.nodeName.toLowerCase()
    if (SKIPPED.has(tag)) return
    const style = styleOf(el, inherited)
    if (style.display === "none" || style.visibility === "hidden") return
    const ctm = concat(parentCtm, parseTransform(el.getAttribute("transform")))

    if (tag === "text") {
      pushText(el, ctm, style)
      return // tspans are handled inside pushText.
    }

    const segments = pathFrom(el, tag)
    if (segments && segments.length > 0) {
      // SVG's initial fill is black, which is why a shape with only a stroke
      // set still needs `fill:none` written on it -- and Plotly does write it.
      const fill = parseColour(style.fill ?? "black")
      const stroke = parseColour(style.stroke)
      const fillAlpha = alphaOf(style, "fill-opacity")
      const strokeAlpha = alphaOf(style, "stroke-opacity")
      if ((fill && fillAlpha > 0) || (stroke && strokeAlpha > 0)) {
        const dash = (style["stroke-dasharray"] ?? "none")
          .split(/[\s,]+/)
          .filter((p) => p.length > 0 && p !== "none")
          .map((p) => parseFloat(p))
          .filter((n) => Number.isFinite(n))
        nodes.push({
          kind: "path",
          ctm,
          segments,
          fill: fillAlpha > 0 ? fill : null,
          stroke: strokeAlpha > 0 ? stroke : null,
          strokeWidth: num(style["stroke-width"], 1),
          dash: dash.length > 0 ? dash : null,
          fillAlpha,
          strokeAlpha,
        })
      }
    }

    for (const child of Array.from(el.children)) walk(child, ctm, style)
  }

  const pushText = (el: Element, ctm: Matrix, style: Style) => {
    const spans = Array.from(el.children).filter(
      (c) => c.nodeName.toLowerCase() === "tspan"
    )
    const baseX = num(el.getAttribute("x"))
    const baseY = num(el.getAttribute("y"))
    const emit = (source: Element, text: string, x: number, y: number, s: Style) => {
      const trimmed = text.replace(/\s+/g, " ")
      if (trimmed.trim().length === 0) return
      const fill = parseColour(s.fill ?? "black")
      const alpha = alphaOf(s, "fill-opacity")
      if (!fill || alpha === 0) return
      nodes.push({
        kind: "text",
        ctm: concat(ctm, parseTransform(source === el ? null : source.getAttribute("transform"))),
        x,
        y,
        text: trimmed,
        size: num(s["font-size"], 12),
        font: fontOf(s),
        fill,
        anchor:
          s["text-anchor"] === "middle" ? "middle" : s["text-anchor"] === "end" ? "end" : "start",
        alpha,
      })
    }

    if (spans.length === 0) {
      emit(el, el.textContent ?? "", baseX, baseY, style)
      return
    }
    // Multi-line labels: Plotly stacks lines as tspans offset by `dy` in ems.
    let y = baseY
    for (const span of spans) {
      const spanStyle = styleOf(span, style)
      const size = num(spanStyle["font-size"], 12)
      const dyRaw = span.getAttribute("dy")
      const dy = dyRaw?.endsWith("em") ? num(dyRaw) * size : num(dyRaw)
      y = num(span.getAttribute("y"), y) + dy
      emit(span, span.textContent ?? "", num(span.getAttribute("x"), baseX), y, spanStyle)
    }
  }

  for (const child of Array.from(root.children)) walk(child, IDENTITY, {})
  return { width, height, nodes }
}

/* ── Text encoding ─────────────────────────────────────────────────────────*/

/**
 * Codepoints that the standard fonts' Latin-1 encoding cannot carry, mapped to
 * the nearest thing it can. A figure axis reading "10 uM" is wrong but legible;
 * a figure axis reading "10 ?M" is neither, so the common scientific glyphs get
 * an explicit spelling rather than falling through to the question mark.
 */
const SUBSTITUTIONS: Record<string, string> = {
  "μ": "µ", // Greek mu → micro sign, which Latin-1 does have
  "−": "-",
  "–": "-",
  "—": "--",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "≈": "~",
  "±": "±",
  "′": "'",
  "″": '"',
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "×": "×",
}

/** Latin-1 only: everything the standard-14 fonts can address by byte. */
export function toLatin1(text: string): string {
  let out = ""
  for (const ch of text) {
    const mapped = SUBSTITUTIONS[ch] ?? ch
    for (const c of mapped) out += c.charCodeAt(0) <= 0xff ? c : "?"
  }
  return out
}

/**
 * Base-14 advance widths (AFM, 1/1000 em) for the printable ASCII range, ONE
 * TABLE PER FACE.
 *
 * There used to be a single Helvetica table used for all four faces. PDF
 * resolves `text-anchor: middle` and `end` by measuring the string itself, so a
 * centred title set in Helvetica-Bold — about 8% wider than the roman — landed
 * visibly left of centre, and EPS did not, because PostScript's `stringwidth`
 * measures the real font at render time. That is the whole reason a PDF and an
 * EPS of the same figure disagreed.
 *
 * The numbers are the Adobe AFM metrics for the standard 14, and
 * `svg-vector.test.ts` checks them against @pdf-lib/standard-fonts rather than
 * trusting that they were transcribed correctly.
 */
const COURIER_WIDTHS = new Array(95).fill(600)

const FACE_WIDTHS: Record<FontFamily, number[]> = {
  helvetica: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
    611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ],
  "helvetica-bold": [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
    611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
    278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  ],
  times: [
    250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500,
    500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611,
    556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722,
    722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500,
    278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541,
  ],
  "times-bold": [
    250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278, 500, 500, 500,
    500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500, 930, 722, 667, 722, 722, 667,
    611, 778, 778, 389, 500, 778, 667, 944, 722, 778, 611, 778, 722, 556, 667, 722, 722, 1000, 722,
    722, 667, 333, 278, 333, 581, 500, 333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556,
    278, 833, 556, 500, 556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520,
  ],
  courier: COURIER_WIDTHS,
  "courier-bold": COURIER_WIDTHS,
}

/**
 * The width used for a character the AFM table does not cover — anything above
 * printable ASCII, so the micro sign and the degree sign on a concentration
 * axis. Only reached for a face with no embedded program; an embedded face
 * measures the real glyph.
 */
const FALLBACK_WIDTH: Record<FontFamily, number> = {
  helvetica: 556,
  "helvetica-bold": 556,
  times: 500,
  "times-bold": 500,
  courier: 600,
  "courier-bold": 600,
}

const BASE_FONT: Record<FontFamily, string> = {
  helvetica: "Helvetica",
  "helvetica-bold": "Helvetica-Bold",
  times: "Times-Roman",
  "times-bold": "Times-Bold",
  courier: "Courier",
  "courier-bold": "Courier-Bold",
}

/**
 * The faces this build carries an actual font program for.
 *
 * Only these can be embedded; the rest fall through to a base-14 reference,
 * which is honest but still bounces preflight. Adding a face here is the whole
 * change needed to embed it — see the upgrade note in `liberation-sans.ts`.
 */
const EMBEDDABLE: Partial<Record<FontFamily, () => Uint8Array>> = {
  helvetica: liberationSansRegular,
  "helvetica-bold": liberationSansBold,
}

const faceCache = new Map<FontFamily, EmbeddableFont>()

/**
 * The parsed font program for a face, or null when this build has none.
 *
 * A parse failure is deliberately NOT caught. The programs are vendored and
 * their bytes are asserted in the tests, so a throw here means the vendored
 * font is corrupt — and an export that fails loudly is better than one that
 * quietly reverts to the non-embedded output this code exists to replace.
 */
function embeddedFace(font: FontFamily): EmbeddableFont | null {
  const load = EMBEDDABLE[font]
  if (!load) return null
  const hit = faceCache.get(font)
  if (hit) return hit
  const face = parseTrueType(load(), BASE_FONT[font])
  faceCache.set(font, face)
  return face
}

/**
 * Text width in ems, in the face it will actually be set in.
 *
 * An embedded face is measured from its own `hmtx`, which is both exact and
 * defined for the whole of Latin-1 rather than printable ASCII. For Liberation
 * Sans those numbers are byte-identical to the Helvetica AFM (the test asserts
 * it), so embedding moved nothing on the page and PDF still agrees with the
 * EPS, which measures base-14 Helvetica with `stringwidth`.
 */
export function textWidth(text: string, font: FontFamily): number {
  const face = embeddedFace(font)
  const table = FACE_WIDTHS[font]
  let total = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const measured = face?.advance(code) ?? null
    if (measured !== null) total += measured
    else total += code >= 32 && code <= 126 ? table[code - 32] : FALLBACK_WIDTH[font]
  }
  return total / 1000
}

const ANCHOR_FACTOR = { start: 0, middle: 0.5, end: 1 } as const

/** CSS px → PostScript points. Both formats measure in 1/72 inch. */
const PT = 72 / 96

const n = (v: number) => (Math.round(v * 1000) / 1000).toString()

/** PDF and PostScript spell the same four operators differently, nothing more. */
type PathOps = { move: string; line: string; curve: string; close: string }
const PDF_OPS: PathOps = { move: "m", line: "l", curve: "c", close: "h" }
const PS_OPS: PathOps = { move: "moveto", line: "lineto", curve: "curveto", close: "closepath" }

function segmentOps(segments: Segment[], ops: PathOps): string {
  const out: string[] = []
  for (const s of segments) {
    if (s.c === "M") out.push(`${n(s.x)} ${n(s.y)} ${ops.move}`)
    else if (s.c === "L") out.push(`${n(s.x)} ${n(s.y)} ${ops.line}`)
    else if (s.c === "Z") out.push(ops.close)
    else
      out.push(
        `${n(s.x1)} ${n(s.y1)} ${n(s.x2)} ${n(s.y2)} ${n(s.x)} ${n(s.y)} ${ops.curve}`
      )
  }
  return out.join("\n")
}

/* ── PDF ───────────────────────────────────────────────────────────────────*/

function pdfString(text: string): string {
  return `(${text.replace(/[\\()]/g, (c) => "\\" + c).replace(/[\r\n]/g, " ")})`
}

/** Latin-1 bytes: a PDF's byte offsets must match its characters exactly. */
function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
  return out
}

/**
 * A single-page PDF holding the figure as vector art with live text.
 *
 * Hand-written rather than pulled from a PDF library, for the same reason the
 * PNG and TIFF writers next door are: the output is one page, one content
 * stream and up to four standard fonts, which is a smaller thing to write than
 * a dependency is to carry into the export bundle.
 */
export function vectorToPdf(figure: VectorFigure, meta: { title?: string } = {}): Uint8Array {
  const pageW = figure.width * PT
  const pageH = figure.height * PT

  const fonts: FontFamily[] = []
  const alphas: number[] = []
  const alphaId = (value: number) => {
    const rounded = Math.round(value * 100) / 100
    if (rounded >= 1) return null
    if (!alphas.includes(rounded)) alphas.push(rounded)
    return `/GS${alphas.indexOf(rounded)} gs`
  }

  const body: string[] = []
  // SVG is y-down from the top-left; PDF is y-up from the bottom-left. One flip
  // here means every coordinate below stays in the SVG's own space.
  body.push("q", `${n(PT)} 0 0 ${n(-PT)} 0 ${n(pageH)} cm`)

  for (const node of figure.nodes) {
    const m = node.ctm
    body.push("q", `${n(m[0])} ${n(m[1])} ${n(m[2])} ${n(m[3])} ${n(m[4])} ${n(m[5])} cm`)
    if (node.kind === "path") {
      const gs = alphaId(Math.min(node.fillAlpha, node.strokeAlpha))
      if (gs) body.push(gs)
      if (node.fill) body.push(`${n(node.fill[0])} ${n(node.fill[1])} ${n(node.fill[2])} rg`)
      if (node.stroke) {
        body.push(`${n(node.stroke[0])} ${n(node.stroke[1])} ${n(node.stroke[2])} RG`)
        body.push(`${n(node.strokeWidth)} w`)
        body.push(node.dash ? `[${node.dash.map(n).join(" ")}] 0 d` : "[] 0 d")
      }
      body.push(segmentOps(node.segments, PDF_OPS))
      body.push(node.fill && node.stroke ? "B" : node.fill ? "f" : "S")
    } else {
      const gs = alphaId(node.alpha)
      if (gs) body.push(gs)
      if (!fonts.includes(node.font)) fonts.push(node.font)
      const text = toLatin1(node.text)
      const shift = textWidth(text, node.font) * node.size * ANCHOR_FACTOR[node.anchor]
      body.push(`${n(node.fill[0])} ${n(node.fill[1])} ${n(node.fill[2])} rg`)
      body.push("BT")
      body.push(`/F${fonts.indexOf(node.font)} ${n(node.size)} Tf`)
      // The text matrix undoes the page-level flip so glyphs sit upright.
      body.push(`1 0 0 -1 ${n(node.x - shift)} ${n(node.y)} Tm`)
      body.push(`${pdfString(text)} Tj`)
      body.push("ET")
    }
    body.push("Q")
  }
  body.push("Q")
  const content = body.join("\n")

  /**
   * Font objects, and the reference each /Fn resource points at.
   *
   * An embedded face costs three objects — the /Font, its /FontDescriptor and
   * the /FontFile2 stream carrying the program — and a base-14 reference costs
   * one, so the numbering cannot be `5 + i` any more. Objects 1-4 are the
   * catalog, pages, page and content stream, so the fonts start at 5.
   */
  const FIRST_FONT_OBJECT = 5
  const fontObjects: string[] = []
  const fontRefs: number[] = []
  for (const f of fonts) {
    const ref = FIRST_FONT_OBJECT + fontObjects.length
    const face = embeddedFace(f)
    if (face) {
      const objects = pdfFontObjects(face, ref + 1, ref + 2)
      fontObjects.push(objects.font, objects.descriptor, objects.fontFile)
    } else {
      // No program for this face, so no /FontDescriptor either. A descriptor
      // without a /FontFile2 would claim an embedding that is not there, which
      // is worse than an honest reference: preflight believes the claim and the
      // rejection arrives later, from the publisher.
      fontObjects.push(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONT[f]} /Encoding /WinAnsiEncoding >>`
      )
    }
    fontRefs.push(ref)
  }
  const fontRes = fonts.map((_, i) => `/F${i} ${fontRefs[i]} 0 R`).join(" ")
  const gsRes = alphas
    .map((a, i) => `/GS${i} << /Type /ExtGState /ca ${n(a)} /CA ${n(a)} >>`)
    .join(" ")
  const resources = `<< /Font << ${fontRes} >> /ExtGState << ${gsRes} >> >>`

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pageW)} ${n(pageH)}] /Resources ${resources} /Contents 4 0 R >>`,
    `<< /Length ${latin1(content).length} >>\nstream\n${content}\nendstream`,
    ...fontObjects,
  ]

  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  for (let i = 0; i < objects.length; i++) {
    offsets.push(latin1(pdf).length)
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const infoIndex = objects.length + 1
  offsets.push(latin1(pdf).length)
  pdf += `${infoIndex} 0 obj\n<< /Producer (Notes9) /Title ${pdfString(
    toLatin1(meta.title ?? "Figure")
  )} >>\nendobj\n`

  const xrefAt = latin1(pdf).length
  pdf += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
  pdf += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R /Info ${infoIndex} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return latin1(pdf)
}

/* ── EPS ───────────────────────────────────────────────────────────────────*/

function psString(text: string): string {
  return `(${text.replace(/[\\()]/g, (c) => "\\" + c).replace(/[\r\n]/g, " ")})`
}

/**
 * Encapsulated PostScript of the same figure.
 *
 * PostScript measures its own strings, so `stringwidth` does the anchoring that
 * the PDF writer needs a metrics table for, and a centred label lands exactly
 * where the SVG put it whatever face it is set in.
 */
export function vectorToEps(figure: VectorFigure, meta: { title?: string } = {}): string {
  const pageW = figure.width * PT
  const pageH = figure.height * PT
  const fonts: FontFamily[] = []
  const out: string[] = []

  for (const node of figure.nodes) {
    const m = node.ctm
    out.push("gsave")
    out.push(`[${n(m[0])} ${n(m[1])} ${n(m[2])} ${n(m[3])} ${n(m[4])} ${n(m[5])}] concat`)
    if (node.kind === "path") {
      out.push("newpath")
      out.push(segmentOps(node.segments, PS_OPS))
      if (node.fill) {
        out.push(`${n(node.fill[0])} ${n(node.fill[1])} ${n(node.fill[2])} setrgbcolor`)
        out.push(node.stroke ? "gsave fill grestore" : "fill")
      }
      if (node.stroke) {
        out.push(`${n(node.stroke[0])} ${n(node.stroke[1])} ${n(node.stroke[2])} setrgbcolor`)
        out.push(`${n(node.strokeWidth)} setlinewidth`)
        out.push(node.dash ? `[${node.dash.map(n).join(" ")}] 0 setdash` : "[] 0 setdash")
        out.push("stroke")
      }
    } else {
      const text = psString(toLatin1(node.text))
      if (!fonts.includes(node.font)) fonts.push(node.font)
      // The page-level flip would set the glyphs upside down, so the text
      // origin gets its own un-flip.
      out.push(`${n(node.x)} ${n(node.y)} translate 1 -1 scale`)
      out.push(`/${BASE_FONT[node.font]}-L1 findfont ${n(node.size)} scalefont setfont`)
      out.push(`${n(node.fill[0])} ${n(node.fill[1])} ${n(node.fill[2])} setrgbcolor`)
      out.push("0 0 moveto")
      if (ANCHOR_FACTOR[node.anchor] > 0) {
        out.push(`${text} stringwidth pop ${n(ANCHOR_FACTOR[node.anchor])} mul neg 0 rmoveto`)
      }
      out.push(`${text} show`)
    }
    out.push("grestore")
  }

  return [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: 0 0 ${Math.ceil(pageW)} ${Math.ceil(pageH)}`,
    `%%HiResBoundingBox: 0 0 ${n(pageW)} ${n(pageH)}`,
    "%%Creator: Notes9",
    `%%Title: ${toLatin1(meta.title ?? "Figure")}`,
    "%%LanguageLevel: 2",
    `%%DocumentNeededResources: ${fonts.map((f) => `font ${BASE_FONT[f]}`).join(" ") || "(none)"}`,
    "%%EndComments",
    "%%BeginProlog",
    // Latin-1 on the standard faces, so the micro sign and the degree sign
    // survive the trip to a typesetter. Copying a font dictionary wholesale
    // would carry its FID across and `definefont` refuses that, hence the
    // key-by-key rebuild.
    "/n9reencode {",
    "  findfont dup length dict begin",
    "    { 1 index /FID ne { def } { pop pop } ifelse } forall",
    "    /Encoding ISOLatin1Encoding def",
    "    currentdict",
    "  end definefont pop",
    "} bind def",
    ...fonts.map((f) => `/${BASE_FONT[f]}-L1 /${BASE_FONT[f]} n9reencode`),
    "%%EndProlog",
    "gsave",
    `${n(PT)} 0 0 ${n(-PT)} 0 ${n(pageH)} concat`,
    ...out,
    "grestore",
    "showpage",
    "%%EOF",
  ].join("\n") + "\n"
}
