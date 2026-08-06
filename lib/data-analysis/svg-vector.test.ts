import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"

import {
  parsePathData,
  parseSvg,
  parseTransform,
  vectorToEps,
  vectorToPdf,
} from "./svg-vector"

/**
 * A miniature of what Plotly hands back from `toImage({format:"svg"})`: a
 * background rect, a grid line, a nested transform, a circular marker written
 * as arcs, and axis text with an anchor. Every construct the writers have to
 * survive is in here, and nothing else is.
 */
const PLOTLY_LIKE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="450" viewBox="0 0 700 450">
  <defs><clipPath id="clip"><rect x="0" y="0" width="10" height="10"/></clipPath></defs>
  <rect class="bg" x="0" y="0" width="700" height="450" style="fill: rgb(255, 255, 255); stroke-width: 0;"/>
  <g class="gridlayer">
    <path class="ygrid" d="M80,60H660" style="stroke: rgb(235, 240, 248); stroke-width: 1px; fill: none;"/>
    <path class="zeroline" d="M80,400H660" style="stroke: rgb(150,150,150); stroke-width: 2px; fill: none; stroke-dasharray: 4px, 2px;"/>
  </g>
  <g class="plot" transform="translate(80,60)">
    <g class="points">
      <path class="point" transform="translate(120,240)" d="M3,0A3,3 0 1,1 0,-3A3,3 0 1,1 -3,0A3,3 0 1,1 0,3A3,3 0 1,1 3,0Z" style="opacity: 0.85; stroke-width: 0; fill: rgb(0, 114, 178);"/>
    </g>
  </g>
  <g class="infolayer">
    <text class="xtitle" x="370" y="430" text-anchor="middle" style="font-family: 'Open Sans', sans-serif; font-size: 13px; fill: rgb(42, 63, 95);">Concentration (uM)</text>
    <text class="ytick" transform="rotate(-90,20,240)" x="20" y="240" text-anchor="end" style="font-family: Georgia, serif; font-size: 11px; fill: rgb(42, 63, 95);">Response</text>
  </g>
</svg>`

const decode = (bytes: Uint8Array) => String.fromCharCode(...bytes)

describe("parseTransform", () => {
  it("composes nested SVG transforms left to right", () => {
    expect(parseTransform("translate(10,20)")).toEqual([1, 0, 0, 1, 10, 20])
    // translate then scale: the scale happens in the translated space.
    expect(parseTransform("translate(10,20) scale(2)")).toEqual([2, 0, 0, 2, 10, 20])
  })

  it("rotates about a named centre", () => {
    const m = parseTransform("rotate(90,5,5)")
    // The centre is a fixed point of its own rotation.
    expect(m[0] * 5 + m[2] * 5 + m[4]).toBeCloseTo(5, 6)
    expect(m[1] * 5 + m[3] * 5 + m[5]).toBeCloseTo(5, 6)
  })
})

describe("parsePathData", () => {
  it("turns a circular marker's arcs into cubics that close on themselves", () => {
    const segments = parsePathData("M3,0A3,3 0 1,1 0,-3A3,3 0 1,1 -3,0A3,3 0 1,1 0,3A3,3 0 1,1 3,0Z")
    expect(segments[0]).toEqual({ c: "M", x: 3, y: 0 })
    expect(segments.filter((s) => s.c === "C").length).toBeGreaterThan(0)
    expect(segments.at(-1)).toEqual({ c: "Z" })
    // Every emitted point stays on the circle it came from: an arc conversion
    // that drifts is the failure that turns scatter markers into blobs.
    for (const s of segments) {
      if (s.c === "C") expect(Math.hypot(s.x, s.y)).toBeCloseTo(3, 4)
    }
  })

  it("expands the shorthand commands the SVG grammar allows", () => {
    // Implicit repeat of L after M, plus H and V.
    expect(parsePathData("M0,0 10,0H20V30")).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "L", x: 10, y: 0 },
      { c: "L", x: 20, y: 0 },
      { c: "L", x: 20, y: 30 },
    ])
  })
})

describe("parseSvg", () => {
  it("reads geometry, paint and text without descending into <defs>", () => {
    const figure = parseSvg(PLOTLY_LIKE_SVG)
    expect(figure.width).toBe(700)
    expect(figure.height).toBe(450)

    // The clipPath's rect must not become art.
    const rects = figure.nodes.filter((n) => n.kind === "path" && n.fill)
    expect(rects.some((n) => n.kind === "path" && n.segments.length === 5)).toBe(true)

    const marker = figure.nodes.find(
      (n) => n.kind === "path" && n.fill?.[2] === 178 / 255
    )
    expect(marker).toBeDefined()
    // translate(80,60) on the group, translate(120,240) on the mark.
    expect(marker && marker.kind === "path" && marker.ctm).toEqual([1, 0, 0, 1, 200, 300])
    expect(marker && marker.kind === "path" && marker.fillAlpha).toBeCloseTo(0.85, 6)

    const dashed = figure.nodes.find((n) => n.kind === "path" && n.dash !== null)
    expect(dashed && dashed.kind === "path" && dashed.dash).toEqual([4, 2])

    const texts = figure.nodes.filter((n) => n.kind === "text")
    expect(texts.map((t) => t.kind === "text" && t.text)).toEqual([
      "Concentration (uM)",
      "Response",
    ])
    expect(texts[0].kind === "text" && texts[0].anchor).toBe("middle")
    expect(texts[0].kind === "text" && texts[0].font).toBe("helvetica")
    expect(texts[1].kind === "text" && texts[1].font).toBe("times")
  })
})

describe("vectorToPdf", () => {
  const bytes = vectorToPdf(parseSvg(PLOTLY_LIKE_SVG), { title: "figure-1" })
  const pdf = decode(bytes)

  it("is a structurally valid PDF whose xref offsets address real objects", () => {
    expect(pdf.startsWith("%PDF-1.4")).toBe(true)
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true)

    const startxref = /startxref\s+(\d+)\s+%%EOF/.exec(pdf)
    expect(startxref).not.toBeNull()
    // startxref must land exactly on the xref keyword, byte-counted.
    expect(pdf.slice(Number(startxref![1]), Number(startxref![1]) + 4)).toBe("xref")

    const table = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(pdf)
    expect(table).not.toBeNull()
    const entries = table![2].trimEnd().split("\n")
    expect(entries.length).toBe(Number(table![1]))
    // Entry 0 is the free head; every other entry must point at "<n> 0 obj".
    for (let i = 1; i < entries.length; i++) {
      const offset = Number(entries[i].slice(0, 10))
      expect(pdf.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`)
    }

    // The declared stream length has to match the bytes actually written, or a
    // reader stops at the wrong place and the page comes up blank.
    const declared = Number(/<< \/Length (\d+) >>\nstream\n/.exec(pdf)![1])
    const streamStart = pdf.indexOf("stream\n") + "stream\n".length
    expect(pdf.slice(streamStart, streamStart + declared)).toBe(
      pdf.slice(streamStart, pdf.indexOf("\nendstream"))
    )
  })

  it("opens in a real PDF parser at the right page size", async () => {
    // pdf-lib is already in the tree, so an independent reader can say whether
    // the catalog, the page tree and the xref actually hang together -- which is
    // a stronger claim than any regex over the bytes above.
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    // 700 x 450 CSS px, at 72/96 points per pixel.
    expect(doc.getPage(0).getWidth()).toBeCloseTo(525, 3)
    expect(doc.getPage(0).getHeight()).toBeCloseTo(337.5, 3)
  })

  it("is vector art, not a raster, and keeps the text live", () => {
    // 700 x 450 CSS px at 72/96 pt per px.
    expect(pdf).toContain("/MediaBox [0 0 525 337.5]")
    // No image XObject anywhere: a pixel-buffer export would need one.
    expect(pdf).not.toContain("/Subtype /Image")
    expect(pdf).not.toContain("/DCTDecode")

    // Curves from the marker's arcs, and a filled path.
    expect(pdf).toMatch(/ c\n/)
    expect(pdf).toMatch(/\nf\n/)
    // The group transform is carried as a CTM rather than baked into the coords.
    expect(pdf).toContain("1 0 0 1 200 300 cm")

    // Live text: a font resource, a text object and the string itself.
    expect(pdf).toContain("/BaseFont /Helvetica")
    expect(pdf).toContain("/BaseFont /Times-Roman")
    expect(pdf).toMatch(/BT\n\/F\d 13 Tf/)
    expect(pdf).toContain("(Concentration \\(uM\\)) Tj")
    expect(pdf).toContain("(Response) Tj")

    // A centred label is shifted left by half its measured width, so the anchor
    // survives the trip. 370 minus half of "Concentration (uM)" at 13pt.
    const tm = /1 0 0 -1 ([\d.]+) 430 Tm/.exec(pdf)
    expect(tm).not.toBeNull()
    expect(Number(tm![1])).toBeGreaterThan(310)
    expect(Number(tm![1])).toBeLessThan(360)

    // Marker opacity survives as a graphics state rather than being flattened.
    expect(pdf).toContain("/ca 0.85")
  })

  it("emits Latin-1 bytes so offsets and characters cannot disagree", () => {
    const withMicro = vectorToPdf(
      parseSvg(PLOTLY_LIKE_SVG.replace("Concentration (uM)", "10 μM")),
      {}
    )
    const text = decode(withMicro)
    // Greek mu is folded to the micro sign: one byte, not a two-byte UTF-8 pair.
    expect(text).toContain("(10 µM) Tj")
    expect(withMicro).toContain(0xb5)
    // And the stream length still counts bytes, not code points: a UTF-8 encoder
    // here would push every later object past its own xref offset.
    const declared = Number(/<< \/Length (\d+) >>\nstream\n/.exec(text)![1])
    const start = text.indexOf("stream\n") + "stream\n".length
    expect(declared).toBe(text.indexOf("\nendstream") - start)
  })
})

describe("vectorToEps", () => {
  const eps = vectorToEps(parseSvg(PLOTLY_LIKE_SVG), { title: "figure-1" })

  it("is an EPS with a bounding box and vector operators", () => {
    expect(eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0")).toBe(true)
    expect(eps).toContain("%%BoundingBox: 0 0 525 338")
    expect(eps.trimEnd().endsWith("%%EOF")).toBe(true)
    expect(eps).toContain("curveto")
    expect(eps).toContain("fill")
    expect(eps).toContain("[4 2] 0 setdash")
    expect(eps).toContain("[1 0 0 1 200 300] concat")
  })

  it("keeps text as text and lets PostScript do the anchoring", () => {
    expect(eps).toContain("(Concentration \\(uM\\)) show")
    // Re-encoded once in the prolog, with a key `definefont` can accept, then
    // referenced by name. Re-defining per label is what a missing key looks like.
    expect(eps).toContain("/Helvetica-L1 /Helvetica n9reencode")
    expect(eps).toContain("/Times-Roman-L1 /Times-Roman n9reencode")
    expect(eps).toContain("/Helvetica-L1 findfont 13 scalefont setfont")
    // Its own definition plus one call per distinct face, not one per label.
    expect(eps.match(/n9reencode/g)).toHaveLength(3)

    // stringwidth is what centres the label; without it the anchor is guessed.
    expect(eps).toContain("stringwidth pop 0.5 mul neg 0 rmoveto")
  })
})
