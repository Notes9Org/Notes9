import { describe, expect, it } from "vitest"
import { PDFDocument, StandardFonts } from "pdf-lib"

import { liberationSansBold, liberationSansRegular } from "./export/liberation-sans"
import {
  parsePathData,
  parseSvg,
  parseTransform,
  textWidth,
  vectorToEps,
  vectorToPdf,
  type FontFamily,
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

// Chunked: a PDF now carries an embedded font program, so spreading the whole
// buffer into one fromCharCode call overflows the argument stack.
const decode = (bytes: Uint8Array) => {
  let out = ""
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return out
}

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
    // The sans face is embedded, so /BaseFont is the program's own PostScript
    // name. Naming Helvetica while carrying Liberation would be a lie about
    // what the file contains.
    expect(pdf).toContain("/BaseFont /LiberationSans")
    // The serif face has no program in this build, so it stays a base-14
    // reference under its real base-14 name.
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

/* ── Font embedding (the publication blocker) ──────────────────────────────*/

const FACE_SVG = (family: string, weight: string, text = "Title") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
    <text x="100" y="50" text-anchor="middle" style="font-family: ${family}; font-weight: ${weight}; font-size: 12px; fill: rgb(0,0,0);">${text}</text>
  </svg>`

describe("fontOf, through parseSvg", () => {
  const faceOf = (family: string, weight: string) => {
    const node = parseSvg(FACE_SVG(family, weight)).nodes[0]
    if (node.kind !== "text") throw new Error("expected a text node")
    return node.font
  }

  it("keeps bold on the sans face", () => {
    expect(faceOf("'Open Sans', sans-serif", "normal")).toBe("helvetica")
    expect(faceOf("'Open Sans', sans-serif", "bold")).toBe("helvetica-bold")
    expect(faceOf("'Open Sans', sans-serif", "700")).toBe("helvetica-bold")
  })

  /**
   * The regression: the serif and mono branches returned before the weight was
   * ever read, so a bold serif axis title came out roman with no warning.
   */
  it("keeps bold on the serif face", () => {
    expect(faceOf("Georgia, serif", "normal")).toBe("times")
    expect(faceOf("Georgia, serif", "bold")).toBe("times-bold")
    expect(faceOf("Georgia, serif", "600")).toBe("times-bold")
  })

  it("keeps bold on the mono face", () => {
    expect(faceOf("Menlo, monospace", "normal")).toBe("courier")
    expect(faceOf("Menlo, monospace", "bold")).toBe("courier-bold")
  })

  it("still reads sans-serif as sans, not serif", () => {
    expect(faceOf("Helvetica, sans-serif", "bold")).toBe("helvetica-bold")
  })
})

describe("textWidth, per face", () => {
  it("measures each base-14 face with its own AFM table", async () => {
    const doc = await PDFDocument.create()
    const cases: [FontFamily, StandardFonts][] = [
      ["helvetica", StandardFonts.Helvetica],
      ["helvetica-bold", StandardFonts.HelveticaBold],
      ["times", StandardFonts.TimesRoman],
      ["times-bold", StandardFonts.TimesRomanBold],
      ["courier", StandardFonts.Courier],
      ["courier-bold", StandardFonts.CourierBold],
    ]
    for (const [face, standard] of cases) {
      const oracle = await doc.embedFont(standard)
      for (let code = 32; code <= 126; code++) {
        const ch = String.fromCharCode(code)
        expect(Math.round(textWidth(ch, face) * 1000), `${face} U+${code.toString(16)}`).toBe(
          Math.round(oracle.widthOfTextAtSize(ch, 1000))
        )
      }
    }
  })

  /**
   * One table for all four faces is why a centred bold title landed off-centre:
   * Helvetica-Bold is wider, and PDF resolves `text-anchor` by measuring.
   */
  it("makes bold wider than roman, in both families", () => {
    expect(textWidth("Response", "helvetica-bold")).toBeGreaterThan(
      textWidth("Response", "helvetica")
    )
    expect(textWidth("Response", "times-bold")).toBeGreaterThan(textWidth("Response", "times"))
  })

  it("measures the embedded face's own glyphs beyond ASCII", () => {
    // The old table stopped at 126 and charged 556 for everything above it.
    // Liberation Sans says the micro sign is 556 and the degree sign is not.
    expect(textWidth("°", "helvetica")).not.toBeCloseTo(0.556, 5)
  })
})

describe("vectorToPdf font embedding", () => {
  const pdfOf = (svg: string) => decode(vectorToPdf(parseSvg(svg)))

  it("carries the sans program itself, byte for byte", () => {
    const pdf = pdfOf(FACE_SVG("'Open Sans', sans-serif", "normal"))
    expect(pdf).toContain("/FontFile2")
    expect(pdf).toContain("/Type /FontDescriptor")
    expect(pdf).toContain("/Subtype /TrueType")

    const program = liberationSansRegular()
    const declared = Number(/\/Length (\d+) \/Length1 (\d+) >>/.exec(pdf)![1])
    expect(declared).toBe(program.length)

    // Not "a stream of the right length" — the actual sfnt bytes.
    const at = pdf.indexOf(`/Length ${program.length} /Length1`)
    const start = pdf.indexOf("stream\n", at) + "stream\n".length
    const embedded = new Uint8Array(program.length)
    for (let i = 0; i < program.length; i++) embedded[i] = pdf.charCodeAt(start + i) & 0xff
    expect(embedded).toEqual(program)
  })

  it("embeds roman and bold as two distinct programs", () => {
    const pdf = pdfOf(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
        <text x="10" y="20" style="font-family: sans-serif; font-size: 12px; fill: rgb(0,0,0);">roman</text>
        <text x="10" y="60" style="font-family: sans-serif; font-weight: bold; font-size: 12px; fill: rgb(0,0,0);">bold</text>
      </svg>`
    )
    expect(pdf).toContain("/BaseFont /LiberationSans ")
    expect(pdf).toContain("/BaseFont /LiberationSans-Bold")
    expect(pdf.match(/\/FontFile2/g)).toHaveLength(2)
    const lengths = [...pdf.matchAll(/\/Length (\d+) \/Length1 \1 >>/g)].map((m) => Number(m[1]))
    expect(lengths).toEqual([liberationSansRegular().length, liberationSansBold().length])
  })

  /**
   * The honesty check. This build has no serif program, so the serif face MUST
   * come out as a plain base-14 reference. A /FontDescriptor here with no
   * /FontFile2 behind it would tell preflight the font is embedded when it is
   * not — worse than the reference, because the rejection then arrives from the
   * publisher instead of from the export.
   */
  it("emits no descriptor at all for a face it cannot embed", () => {
    const pdf = pdfOf(FACE_SVG("Georgia, serif", "bold"))
    expect(pdf).toContain("/BaseFont /Times-Bold")
    expect(pdf).toContain("/Subtype /Type1")
    expect(pdf).not.toContain("/FontDescriptor")
    expect(pdf).not.toContain("/FontFile")
  })

  it("keeps every xref offset pointing at its object once fonts are embedded", () => {
    const bytes = vectorToPdf(
      parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
          <text x="10" y="20" style="font-family: sans-serif; font-size: 12px; fill: rgb(0,0,0);">a</text>
          <text x="10" y="40" style="font-family: serif; font-size: 12px; fill: rgb(0,0,0);">b</text>
          <text x="10" y="60" style="font-family: sans-serif; font-weight: bold; font-size: 12px; fill: rgb(0,0,0);">c</text>
        </svg>`
      )
    )
    const pdf = decode(bytes)
    const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)![1])
    // "xref", the "0 <count>" header, then the free entry, then the objects.
    const rows = pdf.slice(xrefAt).split("\n").slice(3)
    let object = 1
    for (const row of rows) {
      const offset = /^(\d{10}) 00000 n $/.exec(row)
      if (!offset) break
      expect(pdf.slice(Number(offset[1]))).toMatch(new RegExp(`^${object} 0 obj\\n`))
      object++
    }
    // catalog, pages, page, content = 4; sans = 3; serif reference = 1;
    // sans bold = 3; /Info = 1. An embedded face costing one object instead of
    // three is the numbering bug this catches.
    expect(object - 1).toBe(12)
  })

  it("still opens as a PDF with an embedded font in it", async () => {
    const doc = await PDFDocument.load(vectorToPdf(parseSvg(FACE_SVG("sans-serif", "bold"))))
    expect(doc.getPageCount()).toBe(1)
  })

  /**
   * PDF anchors by measuring; PostScript anchors with `stringwidth` at render
   * time. They agree only if the number PDF used is the number the font really
   * has — which is what makes the embedded face safe to swap in for Helvetica.
   */
  it("centres a bold title on the bold face's own metrics", () => {
    const pdf = pdfOf(FACE_SVG("sans-serif", "bold", "Response"))
    const tm = /1 0 0 -1 ([-\d.]+) [-\d.]+ Tm/.exec(pdf)!
    const expected = 100 - textWidth("Response", "helvetica-bold") * 12 * 0.5
    expect(Number(tm[1])).toBeCloseTo(expected, 3)
    // And it is NOT where the roman table would have put it.
    expect(Number(tm[1])).not.toBeCloseTo(100 - textWidth("Response", "helvetica") * 12 * 0.5, 3)
  })
})
