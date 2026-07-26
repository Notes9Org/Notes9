"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SquaresFour, Trash, Plus, CloudCheck, HardDrive, CircleNotch } from "@phosphor-icons/react/ssr"
import { cn } from "@/lib/utils"
import { BUILTIN_TEMPLATES, CATEGORY_STYLE, type AnalysisTemplate } from "@/lib/data-analysis/templates"

type SavedTemplate = { id: string; name: string; description?: string | null; config: Record<string, unknown>; phase?: string | null }
const LOCAL_KEY = "n9-data-templates"
const API = "/api/data-analysis/templates"

/* ── Category glyph ──────────────────────────────────────────────────────── */
function Glyph({ kind, color }: { kind: "curve" | "line" | "bars" | "custom"; color: string }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        {kind === "curve" && <path d="M3 19 C 9 19, 10 6, 21 5" />}
        {kind === "line" && <path d="M3 18 L8 11 L12 14 L21 5" />}
        {kind === "bars" && (
          <g stroke="none" fill={color}>
            <rect x="4" y="12" width="3.5" height="8" rx="1" />
            <rect x="10.25" y="6" width="3.5" height="14" rx="1" />
            <rect x="16.5" y="9" width="3.5" height="11" rx="1" />
          </g>
        )}
        {kind === "custom" && <path d="M12 3 L13.8 10.2 L21 12 L13.8 13.8 L12 21 L10.2 13.8 L3 12 L10.2 10.2 Z" fill={color} stroke="none" />}
      </svg>
    </div>
  )
}

export function TemplatesDialog({
  open,
  onOpenChange,
  onApplyBuiltin,
  onApplyConfig,
  getCurrentConfig,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onApplyBuiltin: (t: AnalysisTemplate) => void
  onApplyConfig: (config: Record<string, unknown>, phase: string) => void
  getCurrentConfig: () => { config: Record<string, unknown>; phase: string }
}) {
  const [saved, setSaved] = useState<SavedTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<"server" | "local">("server")
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)

  const readLocal = (): SavedTemplate[] => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]")
    } catch {
      return []
    }
  }
  const writeLocal = (list: SavedTemplate[]) => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
    } catch {
      /* ignore */
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(API)
      if (res.ok) {
        const d = await res.json()
        setSaved(d.templates ?? [])
        setMode("server")
      } else {
        // 503 (migration not applied) or error → browser-local fallback.
        setSaved(readLocal())
        setMode("local")
      }
    } catch {
      setSaved(readLocal())
      setMode("local")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const saveCurrent = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    const { config, phase } = getCurrentConfig()
    try {
      if (mode === "server") {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description: "Your saved analysis setup", config, phase }),
        })
        if (res.ok) {
          const d = await res.json()
          setSaved((prev) => [d.template, ...prev])
          setNewName("")
          toast.success(`Saved “${name}”`)
          return
        }
        // fall through to local on 503/error
        setMode("local")
      }
      const t: SavedTemplate = { id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `t${Date.now()}`, name, description: "Your saved analysis setup", config, phase }
      const next = [t, ...readLocal()]
      writeLocal(next)
      setSaved(next)
      setNewName("")
      toast.success(`Saved “${name}” (on this device)`)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (mode === "server") {
      setSaved((prev) => prev.filter((t) => t.id !== id))
      await fetch(`${API}/${id}`, { method: "DELETE" }).catch(() => {})
    } else {
      const next = readLocal().filter((t) => t.id !== id)
      writeLocal(next)
      setSaved(next)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0" showCloseButton>
        {/* Header band */}
        <div className="relative border-b border-border bg-[var(--n9-accent,#965034)]/[0.06] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--n9-accent,#965034)]/12 text-[var(--n9-accent,#965034)]">
              <SquaresFour className="h-5 w-5" weight="fill" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Analysis templates</h2>
              <p className="text-sm text-muted-foreground">Start from a bench-ready analysis, or reuse a setup you&rsquo;ve saved.</p>
            </div>
          </div>
        </div>

        <div className="max-h-[64vh] space-y-6 overflow-y-auto px-6 py-5">
          {/* Built-in gallery */}
          <section>
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Start from a template</div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {BUILTIN_TEMPLATES.map((t) => {
                const style = CATEGORY_STYLE[t.category] ?? CATEGORY_STYLE.Custom
                return (
                  // No opacity entrance here: a stalled fade (background tab, reduced
                  // motion, slow device) would leave these clickable cards invisible.
                  <motion.button
                    key={t.id}
                    whileHover={{ y: -2 }}
                    onClick={() => { onApplyBuiltin(t); onOpenChange(false) }}
                    className="group flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-3.5 text-left shadow-sm transition-colors hover:border-[var(--n9-accent,#965034)]/40 hover:bg-[var(--n9-accent,#965034)]/[0.04] hover:shadow-md"
                  >
                    <Glyph kind={style.kind} color={style.color} />
                    <div className="min-w-0 flex-1">
                      <div
                        className="mb-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: `color-mix(in srgb, ${style.color} 13%, transparent)`, color: style.color }}
                      >
                        {t.category}
                      </div>
                      <div className="text-sm font-semibold leading-tight text-foreground">{t.name}</div>
                      <p className="mt-1 text-xs leading-snug text-muted-foreground">{t.description}</p>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </section>

          {/* User templates */}
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Your templates</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {mode === "server" ? <><CloudCheck className="h-3 w-3" /> Synced</> : <><HardDrive className="h-3 w-3" /> This device</>}
              </span>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><CircleNotch className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : saved.length > 0 ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {saved.map((t) => (
                  <div key={t.id} className="group flex items-center gap-2 rounded-xl border border-border bg-card/60 p-2.5">
                    <Glyph kind="custom" color="var(--n9-accent, #965034)" />
                    <button onClick={() => { onApplyConfig(t.config, t.phase ?? "chart"); onOpenChange(false) }} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium">{t.name}</div>
                      <div className="truncate text-xs text-muted-foreground">Apply to current data</div>
                    </button>
                    <button onClick={() => remove(t.id)} title="Delete" className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-rose-500 group-hover:opacity-100">
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                No saved templates yet. Set up a chart the way you like it, then save it below to reuse on new data.
              </div>
            )}
          </section>
        </div>

        {/* Save current — footer */}
        <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-6 py-3">
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void saveCurrent() }}
            placeholder="Save the current setup as a template…"
            className="h-9 flex-1 border-0 bg-background shadow-sm"
          />
          <button
            onClick={() => void saveCurrent()}
            disabled={!newName.trim() || saving}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--n9-accent,#965034)] px-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <CircleNotch className="h-4 w-4 animate-spin" /> : <SquaresFour className="h-4 w-4" />} Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
