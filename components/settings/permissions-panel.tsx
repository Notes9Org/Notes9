"use client"

/**
 * Settings → Permissions panel.
 *
 * One control governing whether Catalyst may read the user's PRIVATE lab data
 * (their records via SQL, their notes/documents via RAG, attached files, and
 * agent memory). Three modes:
 *   - ask    (default) — Catalyst asks in chat before reading private data
 *   - always           — allow silently
 *   - never            — Catalyst never reads private data (answers from context only)
 *
 * Persists to public.user_ai_permissions (owner-RLS) via the browser Supabase
 * client, mirroring the profile-save pattern. Degrades gracefully if migration
 * 097 has not been applied yet (treats a missing row/table as 'ask').
 */

import { useEffect, useState } from "react"
import { Loader2, ShieldCheck, Database, FileText, FolderOpen, Brain } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { cn } from "@/lib/utils"

type PermissionMode = "ask" | "always" | "never"

const OPTIONS: Array<{ value: PermissionMode; title: string; description: string }> = [
  {
    value: "ask",
    title: "Ask every time",
    description:
      "Catalyst asks for your permission in chat before it reads your private data. Recommended.",
  },
  {
    value: "always",
    title: "Always allow",
    description:
      "Catalyst reads your private data whenever it needs to, without asking.",
  },
  {
    value: "never",
    title: "Never allow",
    description:
      "Catalyst never reads your private data. It answers only from what you share in the conversation.",
  },
]

export function PermissionsPanel() {
  const user = useAuthUser()
  const supabase = createClient()
  const [mode, setMode] = useState<PermissionMode>("ask")
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!user?.id) return
      try {
        const { data, error } = await supabase
          .from("user_ai_permissions")
          .select("internal_data_access")
          .eq("user_id", user.id)
          .maybeSingle()
        if (cancelled) return
        if (!error) {
          const v = (data?.internal_data_access as string) || "ask"
          if (v === "ask" || v === "always" || v === "never") setMode(v)
        }
      } catch {
        /* table may not exist yet — keep default 'ask' */
      } finally {
        if (!cancelled) setStatus("ready")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [supabase, user?.id])

  const handleSelect = async (next: PermissionMode) => {
    if (next === mode || !user?.id) return
    const prev = mode
    setMode(next)
    setStatus("saving")
    try {
      const { error } = await supabase.from("user_ai_permissions").upsert(
        {
          user_id: user.id,
          internal_data_access: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      if (error) setMode(prev) // revert on failure
    } catch {
      setMode(prev)
    } finally {
      setStatus("ready")
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading permissions…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Access to your private data</p>
          <p>
            This controls whether Catalyst may look into your own lab data to answer you.
            It covers your records and database, your notes and documents, file attachments,
            and Catalyst&rsquo;s memory. The public web is never affected.
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs">
            <span className="inline-flex items-center gap-1"><Database className="h-3.5 w-3.5" aria-hidden /> Records</span>
            <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" aria-hidden /> Documents</span>
            <span className="inline-flex items-center gap-1"><FolderOpen className="h-3.5 w-3.5" aria-hidden /> Files</span>
            <span className="inline-flex items-center gap-1"><Brain className="h-3.5 w-3.5" aria-hidden /> Memory</span>
          </div>
        </div>
      </div>

      <div className="space-y-2" role="radiogroup" aria-label="Private data access">
        {OPTIONS.map((opt) => {
          const selected = mode === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={status === "saving"}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:bg-muted/50",
                status === "saving" && "opacity-70",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-primary" : "border-muted-foreground/50",
                )}
                aria-hidden
              >
                {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-medium text-foreground">{opt.title}</span>
                <span className="block text-xs text-muted-foreground">{opt.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
