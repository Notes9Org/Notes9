/**
 * Just enough TrueType to embed a font program in a PDF.
 *
 * The PDF writer next door emits live text (`BT /F0 ... Tj ET`), which is the
 * right thing for a journal — selectable, searchable, re-typesettable — but a
 * `/BaseFont /Helvetica` reference names a font the file does not contain, and
 * Elsevier and Springer preflight reject that outright. A `/FontFile2` stream
 * carrying the actual sfnt is the difference between a submission that passes
 * and one that bounces.
 *
 * This reads the seven tables PDF needs and nothing else:
 *   head  unitsPerEm, the bounding box, and whether `loca` is short or long
 *   hhea  ascender, descender, and how many entries `hmtx` really has
 *   maxp  glyph count
 *   hmtx  advance widths, which become /Widths and drive text anchoring
 *   cmap  Unicode -> glyph id, so /Widths can be built per WinAnsi code
 *   OS/2  cap height and weight class
 *   name  the PostScript name, so /BaseFont is the font's own name
 *
 * It does NOT subset. Subsetting means rewriting `glyf` and `loca` with
 * composite-glyph closure, and its failure mode is a PDF that opens cleanly and
 * renders the wrong glyphs — which no structural assertion catches. The full
 * program is 134 KB per face and is provably the bytes the foundry shipped, so
 * it goes in whole. See `liberation-sans.ts` for the size/licence trade.
 */

/* ── sfnt reading ──────────────────────────────────────────────────────────*/

interface TableRecord {
  offset: number
  length: number
}

function tableDirectory(dv: DataView): Record<string, TableRecord> {
  const version = dv.getUint32(0)
  // 0x00010000 is TrueType outlines; 'true' is the old Apple spelling. 'OTTO'
  // means CFF outlines, which need /FontFile3 and a different descriptor, so it
  // is refused here rather than embedded as something it is not.
  if (version !== 0x00010000 && version !== 0x74727565) {
    throw new Error(`not a TrueType sfnt (version 0x${version.toString(16)})`)
  }
  const count = dv.getUint16(4)
  const tables: Record<string, TableRecord> = {}
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16
    const tag = String.fromCharCode(
      dv.getUint8(at),
      dv.getUint8(at + 1),
      dv.getUint8(at + 2),
      dv.getUint8(at + 3)
    )
    tables[tag] = { offset: dv.getUint32(at + 8), length: dv.getUint32(at + 12) }
  }
  return tables
}

function required(tables: Record<string, TableRecord>, tag: string): TableRecord {
  const t = tables[tag]
  if (!t) throw new Error(`font is missing the ${tag} table`)
  return t
}

/**
 * A Unicode → glyph-id lookup from the format 4 subtable.
 *
 * Only the Windows platform (3) subtables are considered: encoding 1 is BMP
 * and 10 is full Unicode, and every font that can set a Latin figure label has
 * one. A missing codepoint returns glyph 0, which is `.notdef` — that is the
 * signal a caller uses to say "this face cannot carry that character".
 */
function unicodeLookup(dv: DataView, cmap: TableRecord): (codePoint: number) => number {
  const count = dv.getUint16(cmap.offset + 2)
  let subtable = -1
  for (let i = 0; i < count; i++) {
    const at = cmap.offset + 4 + i * 8
    const platform = dv.getUint16(at)
    const encoding = dv.getUint16(at + 2)
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      subtable = cmap.offset + dv.getUint32(at + 4)
    }
  }
  if (subtable < 0) throw new Error("font has no Windows Unicode cmap subtable")
  if (dv.getUint16(subtable) !== 4) {
    throw new Error(`unsupported cmap format ${dv.getUint16(subtable)}`)
  }

  const segCountX2 = dv.getUint16(subtable + 6)
  const segCount = segCountX2 / 2
  const endsAt = subtable + 14
  const startsAt = endsAt + segCountX2 + 2 // +2 skips the reservedPad
  const deltasAt = startsAt + segCountX2
  const rangesAt = deltasAt + segCountX2

  return (codePoint: number) => {
    for (let i = 0; i < segCount; i++) {
      if (codePoint > dv.getUint16(endsAt + i * 2)) continue
      const start = dv.getUint16(startsAt + i * 2)
      if (codePoint < start) return 0
      const delta = dv.getInt16(deltasAt + i * 2)
      const rangeOffset = dv.getUint16(rangesAt + i * 2)
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff
      const glyphAt = rangesAt + i * 2 + rangeOffset + (codePoint - start) * 2
      const glyph = dv.getUint16(glyphAt)
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff
    }
    return 0
  }
}

/**
 * The PostScript name (name ID 6), so /BaseFont says what the font calls
 * itself rather than what this code guessed. Falls back to the caller's name
 * when the table has no such record; a wrong /BaseFont on an embedded font is
 * cosmetic, so it is not worth throwing over.
 */
function postScriptName(dv: DataView, name: TableRecord, fallback: string): string {
  const count = dv.getUint16(name.offset + 2)
  const stringsAt = name.offset + dv.getUint16(name.offset + 4)
  for (let i = 0; i < count; i++) {
    const at = name.offset + 6 + i * 12
    if (dv.getUint16(at + 6) !== 6) continue
    const platform = dv.getUint16(at)
    const length = dv.getUint16(at + 8)
    const offset = stringsAt + dv.getUint16(at + 10)
    let out = ""
    if (platform === 3) {
      // Windows records are UTF-16BE; the PostScript name is ASCII in practice.
      for (let j = 0; j < length; j += 2) out += String.fromCharCode(dv.getUint16(offset + j))
    } else {
      for (let j = 0; j < length; j++) out += String.fromCharCode(dv.getUint8(offset + j))
    }
    // A PostScript name may not contain a space or a PDF delimiter.
    if (/^[\x21-\x7e]+$/.test(out)) return out
  }
  return fallback
}

/* ── The parsed face ───────────────────────────────────────────────────────*/

export interface FontDescriptorValues {
  /** PDF flag bits. 32 = Nonsymbolic, which is what a Latin text face is. */
  flags: number
  /** head's bounding box, scaled to 1/1000 em. */
  bbox: [number, number, number, number]
  italicAngle: number
  ascent: number
  descent: number
  capHeight: number
  stemV: number
}

export interface EmbeddableFont {
  /** The unmodified sfnt, exactly the bytes that go into /FontFile2. */
  program: Uint8Array
  postScriptName: string
  descriptor: FontDescriptorValues
  /**
   * Advance width in 1/1000 em, or null when the face cannot address that
   * codepoint. Null is the honest answer: a caller that guessed a width here
   * would silently mis-centre a label rather than fall back to a face that can.
   */
  advance(codePoint: number): number | null
}

/**
 * StemV is not recorded anywhere in a TrueType font, and PDF has no way to
 * compute it. It matters only when a viewer has to synthesise a substitute for
 * a font it cannot find — which cannot happen for a font that is embedded — so
 * the value is advisory. These are Adobe's published figures for Helvetica and
 * Helvetica-Bold, which is the right answer for a Helvetica-metric face and a
 * defensible one for any other.
 */
function stemVFor(weightClass: number): number {
  return weightClass >= 600 ? 140 : 88
}

export function parseTrueType(program: Uint8Array, fallbackName: string): EmbeddableFont {
  const dv = new DataView(program.buffer, program.byteOffset, program.byteLength)
  const tables = tableDirectory(dv)

  const head = required(tables, "head")
  const hhea = required(tables, "hhea")
  const hmtx = required(tables, "hmtx")
  const maxp = required(tables, "maxp")

  const unitsPerEm = dv.getUint16(head.offset + 18)
  if (unitsPerEm === 0) throw new Error("font declares unitsPerEm 0")
  /** Font units → the 1/1000 em that PDF measures glyphs in. */
  const toMille = (value: number) => Math.round((value * 1000) / unitsPerEm)

  const numGlyphs = dv.getUint16(maxp.offset + 4)
  const numberOfHMetrics = dv.getUint16(hhea.offset + 34)
  const lookup = unicodeLookup(dv, required(tables, "cmap"))

  const os2 = tables["OS/2"]
  const weightClass = os2 ? dv.getUint16(os2.offset + 4) : 400
  // sCapHeight only exists from OS/2 version 2. Below that, the ascender is the
  // conventional stand-in; it is used for substitution metrics only.
  const capHeight =
    os2 && dv.getUint16(os2.offset) >= 2 && os2.length >= 90
      ? toMille(dv.getInt16(os2.offset + 88))
      : toMille(dv.getInt16(hhea.offset + 4))

  const post = tables["post"]
  // post's italicAngle is Fixed (16.16).
  const italicAngle = post ? dv.getInt32(post.offset + 4) / 65536 : 0

  const macStyle = dv.getUint16(head.offset + 44)
  const isItalic = (macStyle & 0b10) !== 0
  const isFixedPitch = post ? dv.getUint32(post.offset + 12) !== 0 : false

  const advanceCache = new Map<number, number | null>()

  return {
    program,
    postScriptName: tables["name"]
      ? postScriptName(dv, tables["name"], fallbackName)
      : fallbackName,
    descriptor: {
      // 32 Nonsymbolic (the face is addressed through a standard Latin
      // encoding), plus 1 FixedPitch and 64 Italic when the font says so.
      flags: 32 | (isFixedPitch ? 1 : 0) | (isItalic ? 64 : 0),
      bbox: [
        toMille(dv.getInt16(head.offset + 36)),
        toMille(dv.getInt16(head.offset + 38)),
        toMille(dv.getInt16(head.offset + 40)),
        toMille(dv.getInt16(head.offset + 42)),
      ],
      italicAngle,
      ascent: toMille(dv.getInt16(hhea.offset + 4)),
      descent: toMille(dv.getInt16(hhea.offset + 6)),
      capHeight,
      stemV: stemVFor(weightClass),
    },
    advance(codePoint: number): number | null {
      const hit = advanceCache.get(codePoint)
      if (hit !== undefined) return hit
      const glyph = lookup(codePoint)
      // Glyph 0 is .notdef and has a width, so an unmapped codepoint has to be
      // caught here rather than by reading hmtx and getting a plausible number.
      let width: number | null = null
      if (glyph !== 0 && glyph < numGlyphs) {
        // Past numberOfHMetrics every glyph repeats the last advance; that is
        // how hmtx compresses a run of equal-width glyphs, not a bounds error.
        const index = Math.min(glyph, numberOfHMetrics - 1)
        width = toMille(dv.getUint16(hmtx.offset + index * 4))
      }
      advanceCache.set(codePoint, width)
      return width
    },
  }
}

/* ── WinAnsi ───────────────────────────────────────────────────────────────*/

/**
 * The 32 codes where WinAnsiEncoding is not Latin-1.
 *
 * The text reaching the PDF writer is already folded to Latin-1, so none of
 * these can actually appear — but /Widths is indexed by WinAnsi code, and an
 * array that is right for 224 of 224 entries is no more work than one that is
 * right for 192 and quietly wrong about the rest.
 */
const WIN_ANSI_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
}

/**
 * The Unicode codepoint a WinAnsiEncoding byte addresses.
 *
 * Six codes — 0x7F, 0x81, 0x8D, 0x8F, 0x90, 0x9D — are undefined in
 * WinAnsiEncoding and stay identity here. Nothing can be typeset at them, so
 * they take a width of 0 in /Widths and that is the correct answer.
 */
export function winAnsiToUnicode(code: number): number {
  return WIN_ANSI_HIGH[code] ?? code
}

export const WIDTHS_FIRST_CHAR = 32
export const WIDTHS_LAST_CHAR = 255

/* ── PDF objects ───────────────────────────────────────────────────────────*/

export interface PdfFontObjects {
  /** The /Font dictionary. */
  font: string
  /** The /FontDescriptor dictionary. */
  descriptor: string
  /**
   * The /FontFile2 stream object, as a latin1 string: every character is one
   * byte of the font program. The PDF writer assembles the whole file as such
   * a string and masks it back to bytes on the way out, so handing it a string
   * here keeps the font on the same path as everything else rather than
   * bolting on a second, binary one.
   */
  fontFile: string
}

/**
 * Turn a parsed face into the three PDF objects that embed it.
 *
 * The object numbers are the caller's to allocate — it is the one that knows
 * how many objects precede the fonts — so they are passed in rather than
 * invented here.
 */
export function pdfFontObjects(
  font: EmbeddableFont,
  descriptorRef: number,
  fontFileRef: number
): PdfFontObjects {
  const widths: number[] = []
  for (let code = WIDTHS_FIRST_CHAR; code <= WIDTHS_LAST_CHAR; code++) {
    // 0 for a codepoint the face cannot address. Nothing can be typeset there,
    // so the width is never consulted; a made-up number would be worse.
    widths.push(font.advance(winAnsiToUnicode(code)) ?? 0)
  }

  const d = font.descriptor
  const name = font.postScriptName

  let fontFile = ""
  // String.fromCharCode is applied in chunks: spreading 134 000 arguments in
  // one call overflows the argument stack in every engine.
  const CHUNK = 8192
  for (let i = 0; i < font.program.length; i += CHUNK) {
    fontFile += String.fromCharCode(...font.program.subarray(i, i + CHUNK))
  }

  return {
    font:
      `<< /Type /Font /Subtype /TrueType /BaseFont /${name} ` +
      `/FirstChar ${WIDTHS_FIRST_CHAR} /LastChar ${WIDTHS_LAST_CHAR} ` +
      `/Widths [${widths.join(" ")}] ` +
      `/Encoding /WinAnsiEncoding /FontDescriptor ${descriptorRef} 0 R >>`,
    descriptor:
      `<< /Type /FontDescriptor /FontName /${name} /Flags ${d.flags} ` +
      `/FontBBox [${d.bbox.join(" ")}] /ItalicAngle ${d.italicAngle} ` +
      `/Ascent ${d.ascent} /Descent ${d.descent} /CapHeight ${d.capHeight} ` +
      `/StemV ${d.stemV} /FontFile2 ${fontFileRef} 0 R >>`,
    // /Length1 is the uncompressed program length. No filter is applied: the
    // bytes are already a compressed format, and a Flate wrapper would add a
    // decode step for a percent or two.
    fontFile:
      `<< /Length ${font.program.length} /Length1 ${font.program.length} >>\n` +
      `stream\n${fontFile}\nendstream`,
  }
}
