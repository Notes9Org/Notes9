/**
 * What the export actually asks Plotly for.
 *
 * Three separate bugs lived in `exportChartImage`, and all three are invisible
 * in the finished file unless you know what to measure — a figure whose type is
 * 3pt still opens, a PDF at the wrong page size still prints, and a black JPEG
 * looks like a rendering failure rather than an export one. So these tests read
 * the ARGUMENTS handed to Plotly, which is where each bug actually lives:
 *
 *   - journal presets: `width` re-lays out and shrinks the type; `scale` does not
 *   - vector: the requested millimetre width used to be dropped silently
 *   - JPEG: Plotly's own encoder composites the transparent paper onto BLACK
 */

import { describe, it, expect } from "vitest"
import { exportChartImage } from "@/lib/data-analysis/chart-export"

const MM_PER_INCH = 25.4

/** On-screen size of the chart div — Plotly renders at 100% of its box. */
const ON_SCREEN = { width: 700, height: 440 }

/**
 * Record the `toImage` options and stop. The size decision is made before a
 * single pixel is encoded, so nothing past this point needs a canvas.
 */
function recordingPlotly() {
  const calls: Record<string, unknown>[] = []
  return {
    calls,
    plotly: {
      toImage: (_gd: unknown, opts: Record<string, unknown>) => {
        calls.push(opts)
        throw new Error("__stop__")
      },
    },
  }
}

const gd = () =>
  ({ clientWidth: ON_SCREEN.width, clientHeight: ON_SCREEN.height }) as unknown as HTMLElement

async function optsFor(o: Parameters<typeof exportChartImage>[2]) {
  const { calls, plotly } = recordingPlotly()
  await expect(exportChartImage(plotly, gd(), o)).rejects.toThrow("__stop__")
  return calls[0]
}

/** The six presets the menu offers, verbatim from `export-menu.tsx`. */
const PRESETS = [
  { id: "single", dpi: 300, widthMm: 85, format: "tiff" as const },
  { id: "double", dpi: 300, widthMm: 180, format: "tiff" as const },
  { id: "line-art", dpi: 1200, widthMm: 180, format: "tiff" as const },
  { id: "vector", dpi: 300, widthMm: null, format: "svg" as const },
  { id: "slide", dpi: 600, widthMm: null, format: "png" as const },
  { id: "preprint", dpi: 150, widthMm: null, format: "png" as const },
]

/** What the menu computes and passes down. */
const targetPx = (widthMm: number, dpi: number) => Math.round((widthMm / MM_PER_INCH) * dpi)

describe("journal presets keep the on-screen layout and scale to the target", () => {
  for (const p of PRESETS.filter((p) => p.widthMm !== null)) {
    it(`${p.id}: ${p.widthMm}mm @ ${p.dpi}dpi scales rather than re-laying out`, async () => {
      const width = targetPx(p.widthMm!, p.dpi)
      const height = Math.round((width * ON_SCREEN.height) / ON_SCREEN.width)
      const opts = await optsFor({ format: p.format, dpi: p.dpi, filename: "f", width, height })

      // The layout width Plotly is given is the ON-SCREEN one. Handing it the
      // target instead is the whole bug: font sizes are absolute px, so a
      // 1004px-wide layout renders 13px type at ~3.1pt once printed at 85mm.
      expect(opts.width).toBe(ON_SCREEN.width)
      expect(opts.height).toBe(ON_SCREEN.height)
      expect(opts.scale).toBeCloseTo(width / ON_SCREEN.width, 10)

      // And the pixels that come out still land exactly on the named physical
      // size at the named DPI, which is what the journal actually checks.
      expect(Math.round((opts.scale as number) * ON_SCREEN.width)).toBe(width)
    })
  }

  it("single column at 300dpi is 1004px, not a re-laid-out 1004px-wide figure", async () => {
    expect(targetPx(85, 300)).toBe(1004)
    const opts = await optsFor({ format: "png", dpi: 300, filename: "f", width: 1004, height: 631 })
    expect(opts.scale).toBeCloseTo(1004 / 700, 10)
  })

  it("line art at 1200dpi is 8504px wide", async () => {
    expect(targetPx(180, 1200)).toBe(8504)
    const opts = await optsFor({ format: "png", dpi: 1200, filename: "f", width: 8504, height: 5345 })
    expect(opts.scale).toBeCloseTo(8504 / 700, 10)
  })

  it("with no width, scale is dpi/96 — the formula the menu previews", async () => {
    for (const p of PRESETS.filter((p) => p.widthMm === null && p.format !== "svg")) {
      const opts = await optsFor({ format: p.format, dpi: p.dpi, filename: "f" })
      expect(opts.scale).toBeCloseTo(p.dpi / 96, 10)
      expect(opts.width).toBeUndefined()
    }
  })
})

describe("vector export honours the requested physical size", () => {
  it("PDF at 85mm sets the SVG width in CSS px, not dpi px", async () => {
    const dpi = 300
    const width = targetPx(85, dpi) // 1004
    const height = Math.round((width * ON_SCREEN.height) / ON_SCREEN.width)
    const opts = await optsFor({ format: "pdf", dpi, filename: "f", width, height })

    expect(opts.format).toBe("svg")
    // svg-vector maps 1 px -> 0.75 pt, so 85mm must arrive as 85mm in CSS px
    // (96/inch). Handing it 1004 would have produced a 10.5-inch-wide page.
    expect(opts.width).toBe(Math.round((85 / MM_PER_INCH) * 96)) // 321
    expect(opts.width).not.toBe(width)
  })

  it("EPS at 180mm likewise", async () => {
    const dpi = 1200
    const width = targetPx(180, dpi)
    const opts = await optsFor({
      format: "eps",
      dpi,
      filename: "f",
      width,
      height: Math.round((width * ON_SCREEN.height) / ON_SCREEN.width),
    })
    expect(opts.width).toBe(Math.round((180 / MM_PER_INCH) * 96)) // 680
  })

  it("no width means no size — a vector is resolution-independent", async () => {
    const opts = await optsFor({ format: "svg", dpi: 300, filename: "f" })
    expect(opts).toEqual({ format: "svg" })
  })
})

describe("opaque formats are never encoded by Plotly", () => {
  it("JPEG is rendered as PNG so the transparent paper can be flattened first", async () => {
    // `canvas.toDataURL("image/jpeg")` composites alpha onto BLACK, so asking
    // Plotly for a JPEG of a figure whose paper is rgba(0,0,0,0) returned a
    // black image. PNG is the only raster format that carries the alpha out.
    const opts = await optsFor({ format: "jpeg", dpi: 300, filename: "f" })
    expect(opts.format).toBe("png")
  })

  it("PNG is requested as PNG whether or not transparency was asked for", async () => {
    for (const transparent of [true, false]) {
      const opts = await optsFor({ format: "png", dpi: 300, filename: "f", transparent })
      expect(opts.format).toBe("png")
    }
  })

  it("TIFF is rendered as PNG too", async () => {
    const opts = await optsFor({ format: "tiff", dpi: 300, filename: "f" })
    expect(opts.format).toBe("png")
  })
})

/**
 * The full raster path, with a canvas stubbed just enough to observe the
 * compositing. The point of proof is narrow and specific: before the bytes are
 * handed to a JPEG encoder, the transparent paper has been painted white.
 */
describe("JPEG is composited onto white, not onto black", () => {
  /** A 2x2 fully transparent source — exactly what the figure's paper is. */
  const TRANSPARENT = new Uint8ClampedArray(2 * 2 * 4) // all zeroes, alpha 0

  function stubCanvas() {
    const encoded: string[] = []
    let filled: string | null = null
    const ctx = {
      set fillStyle(v: string) {
        filled = v
      },
      get fillStyle() {
        return filled ?? ""
      },
      fillRect: () => {},
      drawImage: () => {},
      putImageData: () => {},
      // Mirrors a real 2d context: whatever was fillRect'd shows through the
      // transparent pixels drawn over it.
      getImageData: () => {
        const px = new Uint8ClampedArray(TRANSPARENT)
        if (filled === "#ffffff") {
          for (let i = 0; i < px.length; i += 4) {
            px[i] = 255
            px[i + 1] = 255
            px[i + 2] = 255
            px[i + 3] = 255
          }
        }
        return { width: 2, height: 2, data: px } as unknown as ImageData
      },
    }
    const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>
    proto.getContext = () => ctx
    proto.toDataURL = (mime: string) => {
      encoded.push(mime)
      return `data:${mime};base64,${"A".repeat(64)}`
    }
    Object.defineProperty(Image.prototype, "decode", {
      configurable: true,
      value: () => Promise.resolve(),
    })
    Object.defineProperty(Image.prototype, "naturalWidth", { configurable: true, get: () => 2 })
    Object.defineProperty(Image.prototype, "naturalHeight", { configurable: true, get: () => 2 })
    return { encoded, lastFill: () => filled, ctx }
  }

  it("re-encodes as image/jpeg after a white fill", async () => {
    const stub = stubCanvas()
    const downloads: { type: string; name: string }[] = []
    const origCreate = URL.createObjectURL
    URL.createObjectURL = ((b: Blob) => {
      downloads.push({ type: b.type, name: "" })
      return "blob:x"
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = () => {}

    const plotly = { toImage: async () => `data:image/png;base64,${"A".repeat(64)}` }
    await exportChartImage(plotly, gd(), { format: "jpeg", dpi: 300, filename: "f" })

    // Plotly was asked for PNG; WE produced the JPEG, after filling white.
    expect(stub.encoded).toEqual(["image/jpeg"])
    expect(stub.lastFill()).toBe("#ffffff")
    expect(downloads[0]?.type).toBe("image/jpeg")
    URL.createObjectURL = origCreate
  })

  it("a transparent PNG export skips the flatten entirely", async () => {
    const stub = stubCanvas()
    URL.createObjectURL = (() => "blob:x") as typeof URL.createObjectURL
    URL.revokeObjectURL = () => {}
    const plotly = { toImage: async () => `data:image/png;base64,${"A".repeat(64)}` }
    await exportChartImage(plotly, gd(), {
      format: "png",
      dpi: 300,
      filename: "f",
      transparent: true,
    })
    expect(stub.encoded).toEqual([])
  })
})
