/**
 * Publication-quality chart export.
 *
 * Plotly renders to PNG/JPEG/SVG/WEBP; we render at the true pixel count for the
 * requested DPI (scale = dpi / 96 CSS px-per-inch) so the bitmap is genuinely
 * high-resolution, then embed the physical resolution so image metadata reports
 * the DPI (journals check this):
 *   - PNG   → pHYs chunk (pixels-per-metre)
 *   - JPEG  → JFIF APP0 density (dots-per-inch)
 *   - TIFF  → XResolution / YResolution tags (encoded here from the pixels)
 *   - SVG   → vector, resolution-independent (DPI not applicable)
 */

export type ExportFormat = "png" | "jpeg" | "tiff" | "svg"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plotly = any

/* ── base64 / blob helpers ───────────────────────────────────────────────── */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as unknown as BlobPart], { type })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ── PNG pHYs (physical pixel dimensions) ────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngWithDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  // IHDR is the first chunk after the 8-byte signature: 4 len + 4 type + 13 data + 4 crc = 25 bytes.
  const ihdrEnd = 8 + 25
  const ppm = Math.round(dpi / 0.0254) // pixels per metre
  const chunk = new Uint8Array(4 + 4 + 9 + 4)
  const dv = new DataView(chunk.buffer)
  dv.setUint32(0, 9) // data length
  chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73 // "pHYs"
  dv.setUint32(8, ppm) // x ppu
  dv.setUint32(12, ppm) // y ppu
  chunk[16] = 1 // unit = metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)))
  const out = new Uint8Array(bytes.length + chunk.length)
  out.set(bytes.subarray(0, ihdrEnd), 0)
  out.set(chunk, ihdrEnd)
  out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length)
  return out
}

/* ── JPEG JFIF density ───────────────────────────────────────────────────── */
function jpegWithDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  // Find APP0 (FF E0) right after SOI (FF D8); patch units + density.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes
  let i = 2
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1]
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (marker === 0xe0 && bytes[i + 4] === 0x4a /* J */) {
      const out = bytes.slice()
      out[i + 11] = 1 // units = dots/inch
      out[i + 12] = (dpi >> 8) & 0xff
      out[i + 13] = dpi & 0xff
      out[i + 14] = (dpi >> 8) & 0xff
      out[i + 15] = dpi & 0xff
      return out
    }
    i += 2 + len
  }
  return bytes
}

/* ── TIFF encoder (baseline RGB, uncompressed, with resolution) ──────────── */
async function urlToImageData(url: string): Promise<ImageData> {
  const img = new Image()
  img.src = url
  await img.decode()
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff" // composite transparent chart bg → white for print
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Baseline uncompressed TIFF, RGB or CMYK.
 *
 * The CMYK conversion is the standard naive one (no ICC profile), which is
 * honest about what a browser can do: there is no colour management here, so
 * the separation is arithmetic, not calibrated. It is what a press needs for
 * line art and flat scientific colour, and it is what most tools without a
 * profile produce -- but a colour-critical figure should still be converted by
 * the production house against their own profile. The UI says so.
 */
function encodeTiff(image: ImageData, dpi: number, cmyk = false): Uint8Array {
  const { width, height, data } = image
  const nEntries = 12
  const ifdOffset = 8
  const ifdSize = 2 + nEntries * 12 + 4
  const extBits = ifdOffset + ifdSize // BitsPerSample (one short per sample)
  const extXRes = extBits + (cmyk ? 8 : 6)
  const extYRes = extXRes + 8
  const pixelOffset = extYRes + 8
  const samples = cmyk ? 4 : 3
  const pixelBytes = width * height * samples
  const buf = new ArrayBuffer(pixelOffset + pixelBytes)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)

  // Header (little-endian)
  dv.setUint16(0, 0x4949, true) // "II"
  dv.setUint16(2, 42, true)
  dv.setUint32(4, ifdOffset, true)

  dv.setUint16(ifdOffset, nEntries, true)
  let e = ifdOffset + 2
  const entry = (tag: number, type: number, count: number, value: number) => {
    dv.setUint16(e, tag, true)
    dv.setUint16(e + 2, type, true)
    dv.setUint32(e + 4, count, true)
    dv.setUint32(e + 8, value, true)
    e += 12
  }
  // type: 3=SHORT, 4=LONG, 5=RATIONAL. SHORT count 1 stored left-justified.
  const short1 = (tag: number, v: number) => {
    dv.setUint16(e, tag, true)
    dv.setUint16(e + 2, 3, true)
    dv.setUint32(e + 4, 1, true)
    dv.setUint16(e + 8, v, true)
    dv.setUint16(e + 10, 0, true)
    e += 12
  }
  entry(256, 4, 1, width) // ImageWidth
  entry(257, 4, 1, height) // ImageLength
  entry(258, 3, samples, extBits) // BitsPerSample → external
  short1(259, 1) // Compression = none
  short1(262, cmyk ? 5 : 2) // Photometric: 5 = separated (CMYK), 2 = RGB
  entry(273, 4, 1, pixelOffset) // StripOffsets
  short1(277, samples) // SamplesPerPixel
  entry(278, 4, 1, height) // RowsPerStrip
  entry(279, 4, 1, pixelBytes) // StripByteCounts
  entry(282, 5, 1, extXRes) // XResolution → external RATIONAL
  entry(283, 5, 1, extYRes) // YResolution → external RATIONAL
  short1(296, 2) // ResolutionUnit = inch
  dv.setUint32(e, 0, true) // next IFD = 0

  // External values
  for (let i = 0; i < samples; i++) dv.setUint16(extBits + i * 2, 8, true)
  dv.setUint32(extXRes, dpi, true); dv.setUint32(extXRes + 4, 1, true)
  dv.setUint32(extYRes, dpi, true); dv.setUint32(extYRes + 4, 1, true)

  let p = pixelOffset
  for (let i = 0; i < data.length; i += 4) {
    if (cmyk) {
      // Naive separation: K takes the darkest channel, CMY carry the rest.
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      const k = 1 - Math.max(r, g, b)
      const inv = 1 - k
      u8[p++] = Math.round((inv > 0 ? (1 - r - k) / inv : 0) * 255)
      u8[p++] = Math.round((inv > 0 ? (1 - g - k) / inv : 0) * 255)
      u8[p++] = Math.round((inv > 0 ? (1 - b - k) / inv : 0) * 255)
      u8[p++] = Math.round(k * 255)
    } else {
      u8[p++] = data[i]
      u8[p++] = data[i + 1]
      u8[p++] = data[i + 2]
    }
  }
  return u8
}

/** Composite a transparent PNG onto white, preserving its pixel dimensions. */
async function flattenOntoWhite(pngUrl: string): Promise<string> {
  const image = await urlToImageData(pngUrl)
  const canvas = document.createElement("canvas")
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return pngUrl
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const tmp = document.createElement("canvas")
  tmp.width = image.width
  tmp.height = image.height
  tmp.getContext("2d")?.putImageData(image, 0, 0)
  ctx.drawImage(tmp, 0, 0)
  return canvas.toDataURL("image/png")
}

/**
 * Write an already-composed raster as a TIFF.
 *
 * Exposed so the multi-panel composer produces byte-identical output to the
 * single-figure path: same resolution tags, same separation, same encoder.
 */
export function writeTiff(image: ImageData, dpi: number, cmyk: boolean, filename: string): void {
  triggerDownload(toBlob(encodeTiff(image, dpi, cmyk), "image/tiff"), `${filename}.tiff`)
}

/* ── Public API ──────────────────────────────────────────────────────────── */
export async function exportChartImage(
  plotly: Plotly,
  gd: HTMLElement,
  opts: {
    format: ExportFormat
    dpi: number
    filename: string
    /** Keep the page showing through the figure. Raster formats only. */
    transparent?: boolean
    /** Exact output size in px; omitted, the on-screen size is scaled by DPI. */
    width?: number | null
    height?: number | null
    /** CMYK is written for TIFF only, and is an uncalibrated separation. */
    colourSpace?: "rgb" | "cmyk"
  },
): Promise<void> {
  const { format, dpi, filename, transparent = false, colourSpace = "rgb" } = opts
  const scale = dpi / 96
  // Explicit dimensions win over the DPI scale, so "this journal wants 85mm at
  // 300dpi" is expressible exactly rather than approximately.
  const size =
    opts.width && opts.height ? { width: opts.width, height: opts.height, scale: 1 } : { scale }

  if (format === "svg") {
    // Plotly returns svg as a URI-encoded (not base64) data URL.
    const url: string = await plotly.toImage(gd, { format: "svg" })
    const comma = url.indexOf(",")
    const body = url.slice(comma + 1)
    const svg = url.slice(0, comma).includes("base64") ? atob(body) : decodeURIComponent(body)
    triggerDownload(new Blob([svg], { type: "image/svg+xml" }), `${filename}.svg`)
    return
  }

  if (format === "tiff") {
    // TIFF has no alpha here, so a transparent request is flattened onto white
    // rather than silently producing a black background.
    const pngUrl: string = await plotly.toImage(gd, { format: "png", ...size })
    const image = await urlToImageData(pngUrl)
    const tiff = encodeTiff(image, dpi, colourSpace === "cmyk")
    triggerDownload(toBlob(tiff, "image/tiff"), `${filename}.tiff`)
    return
  }

  const url: string = await plotly.toImage(gd, { format, ...size })
  // The figure's own backgrounds are already transparent (the renderer sets
  // both to rgba(0,0,0,0)), so PNG comes out transparent by default. An opaque
  // export is therefore the one that needs work: flatten onto white, because a
  // transparent PNG dropped into a manuscript renders black-on-black in more
  // than one word processor.
  const opaqueUrl =
    format === "png" && !transparent ? await flattenOntoWhite(url) : url
  let bytes = dataUrlToBytes(opaqueUrl)
  if (format === "png") bytes = pngWithDpi(bytes, dpi)
  else if (format === "jpeg") bytes = jpegWithDpi(bytes, dpi)
  triggerDownload(toBlob(bytes, `image/${format}`), `${filename}.${format === "jpeg" ? "jpg" : format}`)
}
