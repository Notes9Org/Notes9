"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { DownloadSimple, CaretDown, Copy, FloppyDisk, Check, CircleNotch } from "@phosphor-icons/react/ssr"
import type { ExportFormat } from "@/lib/data-analysis/chart-export"

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "png", label: "PNG", hint: "Raster · transparent background" },
  { id: "jpeg", label: "JPG", hint: "Raster · smaller file, white background" },
  { id: "tiff", label: "TIFF", hint: "Raster · lossless, print-ready" },
  { id: "svg", label: "SVG", hint: "Vector · infinitely scalable" },
]
const DPI_PRESETS = [150, 300, 600, 1200]

/**
 * Journal presets, front and centre (§976).
 *
 * Every one of these is a real submission requirement someone would otherwise
 * look up, then hand-enter, then get wrong. Widths are the standard column
 * measures in millimetres, converted to pixels at the preset's own DPI, so
 * "85mm at 300dpi" comes out exactly rather than approximately.
 */
const MM_PER_INCH = 25.4
const JOURNAL_PRESETS: {
  id: string
  label: string
  note: string
  format: ExportFormat
  dpi: number
  widthMm: number | null
  colourSpace: "rgb" | "cmyk"
  transparent: boolean
}[] = [
  { id: "single", label: "Single column", note: "85 mm · 300 dpi · TIFF · CMYK", format: "tiff", dpi: 300, widthMm: 85, colourSpace: "cmyk", transparent: false },
  { id: "double", label: "Double column", note: "180 mm · 300 dpi · TIFF · CMYK", format: "tiff", dpi: 300, widthMm: 180, colourSpace: "cmyk", transparent: false },
  { id: "line-art", label: "Line art", note: "180 mm · 1200 dpi · TIFF", format: "tiff", dpi: 1200, widthMm: 180, colourSpace: "cmyk", transparent: false },
  { id: "vector", label: "Vector", note: "SVG · editable in Illustrator", format: "svg", dpi: 300, widthMm: null, colourSpace: "rgb", transparent: false },
  { id: "slide", label: "Slide or poster", note: "600 dpi · PNG · transparent", format: "png", dpi: 600, widthMm: null, colourSpace: "rgb", transparent: true },
  { id: "preprint", label: "Preprint / web", note: "150 dpi · PNG", format: "png", dpi: 150, widthMm: null, colourSpace: "rgb", transparent: false },
]
const DPI_MIN = 72
const DPI_MAX = 2400
const PANEL_W = 300
const PANEL_H = 380

/**
 * Advanced, modular chart-export popover. Lives in a portal so it's never
 * clipped by a card's overflow, and positions itself under its trigger.
 * DPI is free-typed (the backend renders at scale = dpi/96 and embeds the
 * physical resolution), with presets and a live output-pixel estimate.
 */
export function ExportMenu({
  disabled,
  defaultName,
  onExport,
  getPng,
  getCanvasSize,
  onSaveToLibrary,
  variant = "solid",
}: {
  disabled?: boolean
  defaultName: string
  onExport: (opts: {
    format: ExportFormat
    dpi: number
    filename: string
    transparent?: boolean
    colourSpace?: "rgb" | "cmyk"
    width?: number | null
    height?: number | null
  }) => Promise<void>
  getPng?: () => Promise<string | null>
  getCanvasSize?: () => { width: number; height: number } | null
  onSaveToLibrary?: () => void
  /** "solid" = filled accent trigger (settings); "ghost" = bordered chip (chart header). */
  variant?: "solid" | "ghost" | "inline"
}) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>("png")
  const [dpiText, setDpiText] = useState("600")
  const [transparent, setTransparent] = useState(false)
  const [colourSpace, setColourSpace] = useState<"rgb" | "cmyk">("rgb")
  const [widthMmText, setWidthMmText] = useState("")
  const [presetId, setPresetId] = useState<string | null>(null)
  const [fname, setFname] = useState("")
  const [busy, setBusy] = useState<null | "export" | "copy">(null)
  const [copied, setCopied] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const cleanBase = useMemo(
    () => (defaultName || "figure").trim().replace(/\s+/g, "-").toLowerCase().replace(/[^a-z0-9._-]/g, "") || "figure",
    [defaultName],
  )
  useEffect(() => {
    if (open) setFname(cleanBase)
  }, [open, cleanBase])

  const isVector = format === "svg"
  const ext = format === "jpeg" ? "jpg" : format
  const dpiNum = Number(dpiText)
  const dpiValid = Number.isFinite(dpiNum) && dpiNum >= DPI_MIN && dpiNum <= DPI_MAX
  const dpi = Math.max(DPI_MIN, Math.min(DPI_MAX, Math.round(dpiNum) || 0))

  const size = open ? getCanvasSize?.() ?? null : null
  const outW = size ? Math.round((size.width * dpi) / 96) : null
  const outH = size ? Math.round((size.height * dpi) / 96) : null

  const place = useCallback(() => {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.right - PANEL_W, window.innerWidth - PANEL_W - 8))
    let top = r.bottom + 6
    if (top + PANEL_H > window.innerHeight - 8) top = Math.max(8, r.top - PANEL_H - 6)
    setPos({ left, top })
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open, place])

  const doDownload = async () => {
    setBusy("export")
    try {
      const widthMm = Number(widthMmText)
      const px = Number.isFinite(widthMm) && widthMm > 0 ? Math.round((widthMm / MM_PER_INCH) * dpi) : null
      const size = getCanvasSize?.() ?? null
      await onExport({
        format,
        dpi,
        filename: (fname || cleanBase).trim() || "figure",
        transparent,
        colourSpace,
        width: px,
        // Height follows the on-screen aspect, so a width-constrained journal
        // spec never silently distorts the figure.
        height: px && size ? Math.round((px * size.height) / size.width) : null,
      })
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setBusy(null)
    }
  }

  const doCopy = async () => {
    if (!getPng) return
    setBusy("copy")
    try {
      if (typeof ClipboardItem === "undefined") throw new Error("This browser can’t copy images")
      const url = await getPng()
      if (!url) throw new Error("Couldn’t render the chart")
      const blob = await (await fetch(url)).blob()
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
      toast.success("Chart copied to clipboard")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Copy failed")
    } finally {
      setBusy(null)
    }
  }

  const panelBody = (
    <>
      {/* Journal presets first: the whole point of owning the last
          mile is that a submission spec should be one click, not five
          fields the author has to look up and re-enter. */}
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">Journal preset</div>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {JOURNAL_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.note}
            onClick={() => {
              setPresetId(preset.id)
              setFormat(preset.format)
              setDpiText(String(preset.dpi))
              setColourSpace(preset.colourSpace)
              setTransparent(preset.transparent)
              setWidthMmText(preset.widthMm ? String(preset.widthMm) : "")
            }}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-left transition-colors",
              presetId === preset.id
                ? "border-[var(--n9-accent,#965034)]/50 bg-[var(--n9-accent,#965034)]/10"
                : "border-border hover:bg-muted/50",
            )}
          >
            <span className="block text-[11.5px] font-semibold">{preset.label}</span>
            <span className="block text-[10px] leading-tight text-muted-foreground">{preset.note}</span>
          </button>
        ))}
      </div>

      {/* Format */}
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">Format</div>
      <div className="grid grid-cols-4 gap-1.5">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFormat(f.id)}
            title={f.hint}
            className={cn(
              "rounded-lg border py-1.5 text-[11px] font-semibold transition-colors",
              format === f.id
                ? "border-[var(--n9-accent,#965034)] bg-[var(--n9-accent,#965034)] text-white"
                : "border-input bg-background text-muted-foreground hover:border-[var(--n9-accent,#965034)]/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Resolution */}
      <div className={cn("mt-3 transition-opacity", isVector && "pointer-events-none opacity-40")}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Resolution</span>
          {!isVector && outW && outH && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">≈ {outW.toLocaleString()} × {outH.toLocaleString()} px</span>
          )}
        </div>
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            min={DPI_MIN}
            max={DPI_MAX}
            value={dpiText}
            disabled={isVector}
            onChange={(e) => setDpiText(e.target.value)}
            className={cn(
              "h-9 w-full rounded-lg border bg-background pl-3 pr-10 text-sm tabular-nums outline-none transition-colors focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/20",
              dpiValid || isVector ? "border-input focus:border-[var(--n9-accent,#965034)]/50" : "border-red-400/70 focus:border-red-400",
            )}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">dpi</span>
        </div>
        <div className="mt-1.5 flex gap-1">
          {DPI_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDpiText(String(d))}
              className={cn(
                "flex-1 rounded-md border px-1 py-1 text-[11px] font-medium tabular-nums transition-colors",
                dpiNum === d
                  ? "border-[var(--n9-accent,#965034)]/50 bg-[var(--n9-accent,#965034)]/10 text-[var(--n9-accent,#965034)]"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {d}
            </button>
          ))}
        </div>
        {isVector ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">SVG is a vector, resolution-independent.</p>
        ) : dpiValid ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">Physical DPI is embedded for print (journals check this).</p>
        ) : (
          <p className="mt-1.5 text-[11px] text-red-500">Enter a DPI between {DPI_MIN} and {DPI_MAX}.</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Colour space</span>
          <select
            value={colourSpace}
            onChange={(e) => { setColourSpace(e.target.value as "rgb" | "cmyk"); setPresetId(null) }}
            className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
          >
            <option value="rgb">RGB (screen)</option>
            <option value="cmyk">CMYK (print, TIFF)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Width (mm)</span>
          <input
            value={widthMmText}
            onChange={(e) => { setWidthMmText(e.target.value); setPresetId(null) }}
            placeholder="auto"
            inputMode="decimal"
            className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
          />
        </label>
      </div>
      <label className="mt-2 flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={transparent}
          onChange={(e) => { setTransparent(e.target.checked); setPresetId(null) }}
          disabled={format !== "png"}
          className="accent-[var(--n9-accent,#965034)]"
        />
        Transparent background
        {format !== "png" && <span className="text-[10px] text-muted-foreground">(PNG only)</span>}
      </label>
      {colourSpace === "cmyk" && (
        <p className="mt-1.5 rounded-md bg-amber-500/[0.08] px-2 py-1 text-[10.5px] leading-snug text-amber-800 dark:text-amber-300">
          Written as a CMYK TIFF using an uncalibrated separation, there is no ICC
          profile in the browser. Fine for line art and flat colour; for colour-critical
          figures let the production house convert against their own profile.
        </p>
      )}

      {/* File name */}
      <div className="mt-3">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">File name</div>
        <div className="relative">
          <input
            value={fname}
            onChange={(e) => setFname(e.target.value)}
            spellCheck={false}
            className="h-9 w-full rounded-lg border border-input bg-background pl-3 pr-14 text-sm outline-none transition-colors focus:border-[var(--n9-accent,#965034)]/50 focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/20"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground">.{ext}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={doDownload}
          disabled={busy !== null || (!isVector && !dpiValid)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--n9-accent,#965034)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "export" ? <CircleNotch className="h-4 w-4 animate-spin" /> : <DownloadSimple className="h-4 w-4" />}
          {busy === "export" ? "Rendering…" : "Download"}
        </button>
        {getPng && (
          <button
            type="button"
            onClick={doCopy}
            disabled={busy !== null}
            title="Copy chart image to clipboard"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-[var(--n9-accent,#965034)]/40 hover:text-foreground disabled:opacity-50"
          >
            {busy === "copy" ? <CircleNotch className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4 text-[var(--n9-accent,#965034)]" weight="bold" /> : <Copy className="h-4 w-4" />}
          </button>
        )}
        {onSaveToLibrary && (
          <button
            type="button"
            onClick={() => {
              onSaveToLibrary()
              setOpen(false)
            }}
            title="Save to data files library"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-[var(--n9-accent,#965034)]/40 hover:text-foreground"
          >
            <FloppyDisk className="h-4 w-4" />
          </button>
        )}
      </div>
    </>
  )

  // Inline: the rail's Export section already IS the export panel, so a button
  // that opens a second panel is one click and one surface too many.
  if (variant === "inline") {
    return <div className="text-sm">{panelBody}</div>
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          variant === "solid"
            ? "w-full justify-center bg-[var(--n9-accent,#965034)] px-3 py-2 text-sm text-white hover:opacity-90"
            : cn(
                "border border-border bg-background px-2.5 py-1.5 text-foreground hover:border-[var(--n9-accent,#965034)]/40 hover:bg-[var(--n9-accent,#965034)]/[0.06]",
                open && "border-[var(--n9-accent,#965034)]/50 bg-[var(--n9-accent,#965034)]/[0.06]",
              ),
        )}
      >
        <DownloadSimple className="h-4 w-4" /> Export
        <CaretDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="fixed z-[200] w-[300px] rounded-xl border border-border bg-popover/95 p-3 text-sm shadow-2xl backdrop-blur-md"
                style={{ left: pos.left, top: pos.top }}
              >
                {panelBody}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
