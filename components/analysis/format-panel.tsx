"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { FigureSpec } from "@/types/analysis"

import type { FigureDispatch, FigurePatchOp } from "./use-figure-spec"

/**
 * Okabe–Ito: the colourblind-safe qualitative palette journals ask for. Order
 * matches `figure_builder.py`'s default so swatch 1 is "what it already was".
 */
export const OKABE_ITO = [
  "#0072B2",
  "#D55E00",
  "#009E73",
  "#CC79A7",
  "#E69F00",
  "#56B4E9",
  "#F0E442",
] as const

/** Single-column and double-column figure widths, in mm. */
const WIDTH_PRESETS: { label: string; mm: number }[] = [
  { label: "Single (85 mm)", mm: 85 },
  { label: "Double (180 mm)", mm: 180 },
]

const MM_TO_PX = 96 / 25.4

type LegendPosition = "top-right" | "top-left" | "right" | "bottom"

const LEGEND_LAYOUTS: Record<LegendPosition, Record<string, unknown>> = {
  "top-right": { orientation: "v", x: 1, y: 1, xanchor: "right", yanchor: "top" },
  "top-left": { orientation: "v", x: 0, y: 1, xanchor: "left", yanchor: "top" },
  right: { orientation: "v", x: 1.02, y: 1, xanchor: "left", yanchor: "top" },
  bottom: { orientation: "h", x: 0.5, y: -0.2, xanchor: "center", yanchor: "top" },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Safe nested read — the spec is user-editable JSON, so nothing is guaranteed. */
function at(root: unknown, ...keys: string[]): unknown {
  let node: unknown = root
  for (const key of keys) {
    if (!isRecord(node)) return undefined
    node = node[key]
  }
  return node
}

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback

const asNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

/**
 * Bars carry their colour on `marker.color`, fitted lines on `line.color`.
 * Write back to whichever the trace already uses so we never paint a bar
 * outline instead of the bar.
 */
function colorContainer(trace: unknown): "marker" | "line" {
  return typeof at(trace, "line", "color") === "string" ? "line" : "marker"
}

function traceColor(trace: unknown): string {
  return asString(at(trace, colorContainer(trace), "color"))
}

function traceLabel(trace: unknown, index: number): string {
  const name = at(trace, "name")
  return typeof name === "string" && name.trim() ? name : `Trace ${index + 1}`
}

function legendPosition(layout: Record<string, unknown>): LegendPosition {
  const legend = at(layout, "legend")
  if (asString(at(legend, "orientation")) === "h") return "bottom"
  const x = asNumber(at(legend, "x"), 1)
  if (x > 1) return "right"
  if (x <= 0.1) return "top-left"
  return "top-right"
}

export interface FormatPanelProps {
  spec: FigureSpec
  dispatch: FigureDispatch
  /** True while another writer (the JSON editor) owns the spec. */
  disabled?: boolean
  disabledReason?: string
  className?: string
}

/**
 * Publication-formatting controls for the current figure. Every change is a
 * local spec patch applied on the spot — this component never touches the
 * network, and re-running the analysis is somebody else's button.
 */
export function FormatPanel({
  spec,
  dispatch,
  disabled = false,
  disabledReason,
  className,
}: FormatPanelProps) {
  const set = React.useCallback(
    (path: string, value: unknown) => dispatch({ type: "SET_PATH", path, value }),
    [dispatch],
  )
  const patch = React.useCallback(
    (ops: FigurePatchOp[]) => {
      if (ops.length > 0) dispatch({ type: "APPLY_PATCH", ops })
    },
    [dispatch],
  )

  const layout = spec.layout
  const showLegend = at(layout, "showlegend") !== false
  const yLog = asString(at(layout, "yaxis", "type")) === "log"
  const fontPt = asNumber(spec.meta.font_pt, asNumber(at(layout, "font", "size"), 7))
  const widthMm = asNumber(spec.meta.width_mm, 85)

  const errorBarTraces = spec.data.flatMap((trace, index) =>
    isRecord(trace.error_y) ? [index] : [],
  )
  const errorBarsVisible =
    errorBarTraces.length > 0 &&
    errorBarTraces.some((index) => at(spec.data[index], "error_y", "visible") !== false)

  const shapes = Array.isArray(layout.shapes) ? layout.shapes : []
  const annotations = Array.isArray(layout.annotations) ? layout.annotations : []
  const hasBrackets = (spec.meta.significance?.length ?? 0) > 0 && shapes.length > 0
  const bracketsVisible = hasBrackets && at(shapes[0], "visible") !== false

  const setFontPt = (pt: number) => {
    if (!Number.isFinite(pt) || pt <= 0) return
    patch([
      { op: "replace", path: "/meta/font_pt", value: pt },
      { op: "replace", path: "/layout/font/size", value: pt },
    ])
  }

  const setWidthMm = (mm: number) => {
    if (!Number.isFinite(mm) || mm <= 0) return
    patch([
      { op: "replace", path: "/meta/width_mm", value: mm },
      { op: "replace", path: "/layout/width", value: Math.round(mm * MM_TO_PX) },
    ])
  }

  const setErrorBars = (visible: boolean) =>
    patch(
      errorBarTraces.map((index) => ({
        op: "replace" as const,
        path: `/data/${index}/error_y/visible`,
        value: visible,
      })),
    )

  const setBrackets = (visible: boolean) =>
    patch([
      ...shapes.map((_, i) => ({
        op: "replace" as const,
        path: `/layout/shapes/${i}/visible`,
        value: visible,
      })),
      ...annotations.map((_, i) => ({
        op: "replace" as const,
        path: `/layout/annotations/${i}/visible`,
        value: visible,
      })),
    ])

  return (
    <fieldset
      disabled={disabled}
      className={cn("min-w-0 space-y-6 disabled:opacity-60", className)}
    >
      {disabled && disabledReason && (
        <p className="rounded-md border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] px-3 py-2 text-xs text-muted-foreground">
          {disabledReason}
        </p>
      )}

      <Section title="Traces">
        {spec.data.map((trace, index) => {
          const key = colorContainer(trace)
          const current = traceColor(trace)
          const path = `/data/${index}/${key}/color`
          return (
            <div key={index} className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {traceLabel(trace, index)}
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {OKABE_ITO.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => set(path, hex)}
                    aria-label={`Set ${traceLabel(trace, index)} to ${hex}`}
                    aria-pressed={current.toLowerCase() === hex.toLowerCase()}
                    style={{ backgroundColor: hex }}
                    className={cn(
                      "size-6 rounded-md border transition-transform hover:scale-110",
                      current.toLowerCase() === hex.toLowerCase()
                        ? "border-foreground ring-2 ring-ring/50"
                        : "border-black/10",
                    )}
                  />
                ))}
                {/* ponytail: native colour picker instead of a picker library. */}
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#0072B2"}
                  onChange={(event) => set(path, event.target.value)}
                  aria-label={`Custom colour for ${traceLabel(trace, index)}`}
                  className="size-6 cursor-pointer rounded-md border border-black/10 bg-transparent p-0"
                />
              </div>
            </div>
          )
        })}
      </Section>

      <Section title="Axes">
        <Field label="X axis title" htmlFor="fmt-x-title">
          <Input
            id="fmt-x-title"
            value={asString(at(layout, "xaxis", "title", "text"))}
            onChange={(event) => set("/layout/xaxis/title/text", event.target.value)}
          />
        </Field>
        <Field label="Y axis title" htmlFor="fmt-y-title">
          <Input
            id="fmt-y-title"
            value={asString(at(layout, "yaxis", "title", "text"))}
            onChange={(event) => set("/layout/yaxis/title/text", event.target.value)}
          />
        </Field>
        <Field label="Y scale" htmlFor="fmt-y-scale">
          <Select
            value={yLog ? "log" : "linear"}
            onValueChange={(value) => set("/layout/yaxis/type", value)}
          >
            <SelectTrigger id="fmt-y-scale" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="log">Log</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Legend">
        <Toggle
          id="fmt-legend"
          label="Show legend"
          checked={showLegend}
          onChange={(value) => set("/layout/showlegend", value)}
        />
        <Field label="Position" htmlFor="fmt-legend-pos">
          <Select
            value={legendPosition(layout)}
            onValueChange={(value) =>
              set("/layout/legend", LEGEND_LAYOUTS[value as LegendPosition])
            }
          >
            <SelectTrigger id="fmt-legend-pos" className="w-full" disabled={!showLegend}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top-right">Top right</SelectItem>
              <SelectItem value="top-left">Top left</SelectItem>
              <SelectItem value="right">Outside right</SelectItem>
              <SelectItem value="bottom">Below</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      {(errorBarTraces.length > 0 || hasBrackets) && (
        <Section title="Annotations">
          {errorBarTraces.length > 0 && (
            <Toggle
              id="fmt-error-bars"
              label={`Error bars (${asString(spec.meta.error_bar, "sem").toUpperCase()})`}
              checked={errorBarsVisible}
              onChange={setErrorBars}
            />
          )}
          {hasBrackets && (
            <Toggle
              id="fmt-brackets"
              label="Significance brackets"
              checked={bracketsVisible}
              onChange={setBrackets}
            />
          )}
        </Section>
      )}

      <Section title="Size & type">
        <Field label="Font size (pt)" htmlFor="fmt-font">
          <Input
            id="fmt-font"
            type="number"
            min={4}
            max={24}
            step={0.5}
            value={fontPt}
            onChange={(event) => setFontPt(event.target.valueAsNumber)}
          />
        </Field>
        <Field label="Width (mm)" htmlFor="fmt-width">
          <div className="flex items-center gap-2">
            <Input
              id="fmt-width"
              type="number"
              min={40}
              max={300}
              step={1}
              value={widthMm}
              onChange={(event) => setWidthMm(event.target.valueAsNumber)}
            />
            {WIDTH_PRESETS.map((preset) => (
              <Button
                key={preset.mm}
                type="button"
                size="sm"
                variant={widthMm === preset.mm ? "default" : "outline"}
                onClick={() => setWidthMm(preset.mm)}
              >
                {preset.mm}
              </Button>
            ))}
          </div>
        </Field>
      </Section>
    </fieldset>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
