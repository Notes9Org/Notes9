import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { describe, expect, it } from "vitest"

import {
  liberationSansBold,
  liberationSansRegular,
} from "@/lib/data-analysis/export/liberation-sans"
import {
  parseTrueType,
  pdfFontObjects,
  winAnsiToUnicode,
  WIDTHS_FIRST_CHAR,
  WIDTHS_LAST_CHAR,
} from "@/lib/data-analysis/export/truetype"

/**
 * The .ttf files the vendored base64 was generated from.
 *
 * pdfjs-dist is a direct dependency and ships the same unmodified Liberation
 * Sans that Red Hat released, so it is both the provenance of the bytes in
 * `liberation-sans.ts` and the oracle for whether they are still those bytes.
 */
const require_ = createRequire(import.meta.url)
const STANDARD_FONTS = join(
  dirname(require_.resolve("pdfjs-dist/package.json")),
  "standard_fonts"
)
const sourceTtf = (name: string) => new Uint8Array(readFileSync(join(STANDARD_FONTS, name)))

/** Base-14 advance widths in 1/1000 em, from pdf-lib's own AFM data. */
async function base14Widths(font: StandardFonts): Promise<number[]> {
  const embedded = await (await PDFDocument.create()).embedFont(font)
  const out: number[] = []
  for (let code = 32; code <= 126; code++) {
    out.push(Math.round(embedded.widthOfTextAtSize(String.fromCharCode(code), 1000)))
  }
  return out
}

describe("vendored Liberation Sans", () => {
  it("is byte-identical to the .ttf it was generated from", () => {
    // If this fails the base64 was hand-edited or regenerated from a different
    // file, and every claim below about licence and metrics is off its source.
    expect(liberationSansRegular()).toEqual(sourceTtf("LiberationSans-Regular.ttf"))
    expect(liberationSansBold()).toEqual(sourceTtf("LiberationSans-Bold.ttf"))
  })

  it("returns the same buffer on a second call rather than re-decoding", () => {
    expect(liberationSansRegular()).toBe(liberationSansRegular())
  })
})

describe("parseTrueType", () => {
  it("reads a real sfnt header", () => {
    const face = parseTrueType(liberationSansRegular(), "Fallback")
    expect(face.postScriptName).toBe("LiberationSans")
    expect(face.descriptor.flags).toBe(32) // Nonsymbolic, not fixed pitch, not italic
    expect(face.descriptor.italicAngle).toBe(0)
    expect(face.descriptor.ascent).toBeGreaterThan(0)
    expect(face.descriptor.descent).toBeLessThan(0)
    expect(face.descriptor.capHeight).toBeGreaterThan(0)
    // head's bbox, scaled to the 1/1000 em PDF measures glyphs in.
    expect(face.descriptor.bbox[0]).toBeLessThan(0)
    expect(face.descriptor.bbox[2]).toBeGreaterThan(1000)
  })

  it("reads the bold face as its own program, not the roman", () => {
    const bold = parseTrueType(liberationSansBold(), "Fallback")
    expect(bold.postScriptName).toBe("LiberationSans-Bold")
    expect(bold.descriptor.stemV).toBeGreaterThan(
      parseTrueType(liberationSansRegular(), "Fallback").descriptor.stemV
    )
  })

  it("refuses anything that is not a TrueType sfnt", () => {
    expect(() => parseTrueType(new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0]), "x")).toThrow(
      /not a TrueType sfnt/
    )
  })

  /**
   * The load-bearing claim of the whole embedding decision.
   *
   * Liberation Sans is embedded in place of a Helvetica reference. That only
   * moves nothing on the page if its advances ARE Helvetica's — and it is what
   * keeps the PDF (which measures with these numbers) agreeing with the EPS
   * (which still references base-14 Helvetica and measures it with PostScript's
   * `stringwidth` at render time).
   */
  it("has advance widths identical to Helvetica across printable ASCII", async () => {
    const face = parseTrueType(liberationSansRegular(), "Helvetica")
    const helvetica = await base14Widths(StandardFonts.Helvetica)
    for (let code = 32; code <= 126; code++) {
      expect(face.advance(code), `U+${code.toString(16)}`).toBe(helvetica[code - 32])
    }
  })

  it("has advance widths identical to Helvetica-Bold across printable ASCII", async () => {
    const face = parseTrueType(liberationSansBold(), "Helvetica-Bold")
    const bold = await base14Widths(StandardFonts.HelveticaBold)
    for (let code = 32; code <= 126; code++) {
      expect(face.advance(code), `U+${code.toString(16)}`).toBe(bold[code - 32])
    }
  })

  it("can address every WinAnsi code, including the scientific glyphs", () => {
    const face = parseTrueType(liberationSansRegular(), "Helvetica")
    const unmapped: number[] = []
    for (let code = WIDTHS_FIRST_CHAR; code <= WIDTHS_LAST_CHAR; code++) {
      if (face.advance(winAnsiToUnicode(code)) === null) unmapped.push(code)
    }
    // WinAnsiEncoding itself leaves these six codes undefined (0x7F is DEL;
    // 0x81, 0x8D, 0x8F, 0x90 and 0x9D have no character assigned), so there is
    // nothing for the font to be missing. Every code that CAN be typeset is
    // covered, which is the claim that matters.
    expect(unmapped).toEqual([0x7f, 0x81, 0x8d, 0x8f, 0x90, 0x9d])
    // The ones an axis label actually reaches for: micro, degree, plus-minus.
    for (const glyph of ["µ", "°", "±"]) {
      expect(face.advance(glyph.codePointAt(0)!), glyph).not.toBeNull()
    }
  })

  it("reports null rather than a plausible width for a codepoint it cannot set", () => {
    const face = parseTrueType(liberationSansRegular(), "Helvetica")
    expect(face.advance(0x4e2d)).toBeNull() // CJK, not in Liberation Sans
  })
})

describe("pdfFontObjects", () => {
  const face = parseTrueType(liberationSansRegular(), "Helvetica")
  const objects = pdfFontObjects(face, 6, 7)

  it("declares a TrueType font that points at its descriptor", () => {
    expect(objects.font).toContain("/Subtype /TrueType")
    expect(objects.font).toContain("/BaseFont /LiberationSans")
    expect(objects.font).toContain("/Encoding /WinAnsiEncoding")
    expect(objects.font).toContain("/FontDescriptor 6 0 R")
  })

  it("writes one width per WinAnsi code, taken from the font", () => {
    const widths = /\/Widths \[([^\]]+)\]/.exec(objects.font)![1].split(" ").map(Number)
    expect(widths).toHaveLength(WIDTHS_LAST_CHAR - WIDTHS_FIRST_CHAR + 1)
    expect(widths[0]).toBe(face.advance(32)) // space
    expect(widths["W".charCodeAt(0) - WIDTHS_FIRST_CHAR]).toBe(face.advance(0x57))
    expect(widths[0xb5 - WIDTHS_FIRST_CHAR]).toBe(face.advance(0xb5)) // micro sign
  })

  it("points the descriptor at a FontFile2, which is the whole claim", () => {
    expect(objects.descriptor).toContain("/FontFile2 7 0 R")
    expect(objects.descriptor).toContain("/Flags 32")
    expect(objects.descriptor).toContain("/StemV")
  })

  /**
   * The byte-level check the whole task turns on: a /FontDescriptor that names
   * a /FontFile2 carrying nothing is worse than an honest base-14 reference,
   * because preflight believes it and the publisher finds out later.
   */
  it("carries the font program itself, byte for byte", () => {
    const program = liberationSansRegular()
    expect(objects.fontFile).toContain(`/Length ${program.length}`)
    expect(objects.fontFile).toContain(`/Length1 ${program.length}`)

    const start = objects.fontFile.indexOf("stream\n") + "stream\n".length
    const end = objects.fontFile.lastIndexOf("\nendstream")
    const embedded = new Uint8Array(end - start)
    for (let i = 0; i < embedded.length; i++) {
      embedded[i] = objects.fontFile.charCodeAt(start + i) & 0xff
    }
    expect(embedded.length).toBe(program.length)
    expect(embedded).toEqual(program)
    // And it really is an sfnt, not a truncated or re-encoded copy.
    expect([...embedded.subarray(0, 4)]).toEqual([0x00, 0x01, 0x00, 0x00])
  })
})

describe("winAnsiToUnicode", () => {
  it("is the identity outside the 0x80-0x9F band", () => {
    expect(winAnsiToUnicode(0x41)).toBe(0x41)
    expect(winAnsiToUnicode(0xb5)).toBe(0xb5)
  })

  it("maps the cp1252 extras that Latin-1 does not have", () => {
    expect(winAnsiToUnicode(0x92)).toBe(0x2019) // right single quote
    expect(winAnsiToUnicode(0x96)).toBe(0x2013) // en dash
  })
})
