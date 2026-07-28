"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import type { FigureSpec } from "@/types/analysis"

/**
 * CodeMirror is loaded on demand — it is a large tree and the workspace is only
 * one of several analysis surfaces.
 */
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
})

type CodeMirrorExtensions = NonNullable<
  React.ComponentProps<typeof import("@uiw/react-codemirror").default>["extensions"]
>

/** Commit no sooner than this after the last keystroke. */
const DEBOUNCE_MS = 400

/**
 * The four keys `FigureSpec.to_dict()` emits. Anything else at the top level is
 * a typo, not an extension point — reject it loudly. Keys *inside* `layout`,
 * `data` and `config` are passed through untouched: Plotly's surface is huge
 * and mirroring it here would just go stale.
 */
const TOP_LEVEL_KEYS = ["data", "layout", "config", "meta"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

type ParseResult = { ok: true; spec: FigureSpec } | { ok: false; error: string }

/** Exported for tests — the validation rules are the contract, not the UI. */
export function parseFigureSpecText(text: string, current: FigureSpec): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" }
  }

  if (!isRecord(parsed)) return { ok: false, error: "The figure spec must be a JSON object." }

  const unknown = Object.keys(parsed).filter(
    (key) => !(TOP_LEVEL_KEYS as readonly string[]).includes(key),
  )
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown top-level ${unknown.length > 1 ? "keys" : "key"} ${unknown
        .map((key) => `"${key}"`)
        .join(", ")}. Only ${TOP_LEVEL_KEYS.join(", ")} are part of the figure spec.`,
    }
  }

  if (!Array.isArray(parsed.data) || !parsed.data.every(isRecord)) {
    return { ok: false, error: '"data" must be an array of trace objects.' }
  }
  if (!isRecord(parsed.layout)) return { ok: false, error: '"layout" must be an object.' }
  if (parsed.config !== undefined && !isRecord(parsed.config)) {
    return { ok: false, error: '"config" must be an object.' }
  }
  if (parsed.meta !== undefined && !isRecord(parsed.meta)) {
    return { ok: false, error: '"meta" must be an object.' }
  }

  return {
    ok: true,
    spec: {
      data: parsed.data,
      layout: parsed.layout,
      // Omitting these is forgiving rather than fatal — the caption metadata is
      // not something anyone edits by hand.
      config: (parsed.config ?? current.config) as FigureSpec["config"],
      meta: (parsed.meta ?? current.meta) as FigureSpec["meta"],
    },
  }
}

const serialise = (spec: FigureSpec) => JSON.stringify(spec, null, 2)

export interface FigureJsonPanelProps {
  spec: FigureSpec
  /** Called with a valid spec, debounced. Never called for invalid text. */
  onCommit: (spec: FigureSpec) => void
  /** Controlled focus so the workspace can lock the Format panel while typing. */
  focused: boolean
  onFocusChange: (focused: boolean) => void
  className?: string
}

/**
 * Raw Plotly JSON for the current figure.
 *
 * THE CRITICAL BEHAVIOUR: while the editor has focus it is effectively
 * UNCONTROLLED — nothing pushes `spec` back into the document. Three writers
 * share this store, and if a canvas relayout or a Format-panel colour change
 * re-serialised the spec into the editor, the caret would jump to the top of
 * the document mid-word. The text re-syncs on blur instead.
 */
export function FigureJsonPanel({
  spec,
  onCommit,
  focused,
  onFocusChange,
  className,
}: FigureJsonPanelProps) {
  const [text, setText] = React.useState(() => serialise(spec))
  const [error, setError] = React.useState<string | null>(null)
  const [extensions, setExtensions] = React.useState<CodeMirrorExtensions>([])
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const { resolvedTheme } = useTheme()

  // Kept out of the shared bundle alongside CodeMirror itself.
  React.useEffect(() => {
    let cancelled = false
    void import("@codemirror/lang-json").then((mod) => {
      if (!cancelled) setExtensions([mod.json()])
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Only ever writes into the editor while it is NOT focused. On blur this
  // fires and snaps the text back to whatever the store actually holds.
  React.useEffect(() => {
    if (focused) return
    setText(serialise(spec))
    setError(null)
  }, [spec, focused])

  React.useEffect(() => () => clearTimeout(timerRef.current), [])

  // Debounce lives in the handler, not an effect on `text` — an effect would
  // also fire for the blur re-sync above and commit the spec back to itself.
  const handleChange = React.useCallback(
    (value: string) => {
      setText(value)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const result = parseFigureSpecText(value, spec)
        // Invalid text leaves the canvas showing the last good render.
        if (result.ok) {
          setError(null)
          onCommit(result.spec)
        } else {
          setError(result.error)
        }
      }, DEBOUNCE_MS)
    },
    [onCommit, spec],
  )

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[color:var(--glass-border)]">
        <CodeMirror
          value={text}
          height="100%"
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          extensions={extensions}
          onChange={handleChange}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="mt-2 shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
