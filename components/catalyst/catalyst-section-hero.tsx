"use client"

import { useState, useTransition, type FormEvent, type KeyboardEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowUp, FlaskConical, ClipboardList, LineChart, FileText } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { useProjectScope } from "@/contexts/project-scope-context"
import { useCatalystPanelState } from "@/contexts/catalyst-panel-state"
import { openCatalystPanel, type CatalystSectionScope } from "@/lib/catalyst-launch"
import { cn } from "@/lib/utils"

const HERO_SUGGESTIONS: ReadonlyArray<{ icon: typeof FlaskConical; label: string; prompt: string }> = [
  { icon: FlaskConical, label: "Summarize my recent experiments", prompt: "Summarize my recent experiments and call out anything that looks unusual." },
  { icon: ClipboardList, label: "Draft a new protocol", prompt: "Help me draft a new protocol for…" },
  { icon: LineChart, label: "Analyze my latest data", prompt: "Walk me through analyzing the data from my latest experiment." },
  { icon: FileText, label: "Generate a report", prompt: "Generate an analysis report for this project that covers methods, results, and next steps." },
]

export type { CatalystSectionScope } from "@/lib/catalyst-launch"

const composerShell = cn(
  "flex items-center gap-2 overflow-hidden rounded-2xl border border-border/70 bg-card pl-5 pr-2",
  "shadow-[0_1px_2px_rgba(44,36,24,0.04),0_8px_28px_-8px_rgba(44,36,24,0.12)]",
  "transition-[border-color,box-shadow] duration-200",
  "focus-within:border-[color:color-mix(in_srgb,var(--n9-accent)_35%,var(--border))]",
  "focus-within:shadow-[0_1px_2px_rgba(44,36,24,0.05),0_12px_32px_-8px_rgba(44,36,24,0.14),0_0_0_3px_color-mix(in_srgb,var(--n9-accent)_12%,transparent)]",
)

type Props = {
  size?: "sm" | "lg"
  scope?: CatalystSectionScope
  placeholder?: string
}

export function CatalystSectionHero({
  size = "sm",
  scope = "lab",
  placeholder = "How can I help you today?",
}: Props) {
  const [input, setInput] = useState("")
  const [, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const { projectId, projectName } = useProjectScope()
  // When the right Catalyst panel is open, the persistent thread owns the
  // conversation — collapse the scoped hero so the user isn't looking at two
  // composers side-by-side. The hero restores itself when the panel closes.
  const { isOpen: catalystPanelOpen } = useCatalystPanelState()

  function dispatchAsk(text: string) {
    const query = text.trim()
    if (!query) return
    startTransition(() => {
      const launch = { query, scope, projectId: projectId ?? undefined }
      if (pathname?.startsWith("/catalyst")) {
        const params = new URLSearchParams({ q: query })
        if (scope) params.set("scope", scope)
        if (projectId) params.set("project", projectId)
        router.push(`/catalyst?${params.toString()}`)
        return
      }
      openCatalystPanel(launch)
    })
    setInput("")
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    dispatchAsk(input)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      dispatchAsk(input)
    }
  }

  const canSend = input.trim().length > 0
  const rowHeight = size === "lg" ? "h-14" : "h-12"

  // Sticky outer wrapper keeps the hero anchored at the top of the scroll
  // container as the user scans long lists — the AI-native workspace feel.
  // The negative margins + matching padding break out of the parent's gap so
  // the blurred backdrop covers the full row, not just the composer width.
  // top-0 is relative to the <main> scroll container in app-layout.
  return (
    <div
      className={cn(
        "sticky top-0 z-30 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6",
        "backdrop-blur-md bg-background/75 supports-[backdrop-filter]:bg-background/55",
        // No bottom border when collapsed so the gap doesn't visually persist.
        catalystPanelOpen ? "border-b-0" : "border-b border-border/40",
      )}
    >
      <AnimatePresence initial={false} mode="wait">
        {catalystPanelOpen ? null : (
          <motion.div
            key="catalyst-hero"
            initial={{ height: 0, opacity: 0, marginTop: 0, marginBottom: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              marginTop: "0.5rem",
              marginBottom: "0.5rem",
            }}
            exit={{ height: 0, opacity: 0, marginTop: 0, marginBottom: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            style={{ overflow: "hidden" }}
          >
            <div className={cn("mx-auto w-full", size === "lg" ? "max-w-4xl" : "max-w-3xl")}>
              <form
                onSubmit={handleSubmit}
                aria-label="Ask Catalyst"
                className={cn(composerShell, rowHeight)}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  aria-label="Ask Catalyst"
                  className={cn(
                    "min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none ring-0",
                    "placeholder:text-muted-foreground/80",
                    size === "lg" ? "text-base" : "text-[15px]",
                  )}
                />

                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label={
                    projectName
                      ? `Send to Catalyst (scoped to ${projectName})`
                      : "Send to Catalyst"
                  }
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-all",
                    canSend
                      ? "bg-foreground text-background shadow-sm hover:bg-foreground/90 active:scale-[0.96]"
                      : "bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                >
                  <ArrowUp className="size-4" strokeWidth={2.25} aria-hidden />
                </button>
              </form>
              {input.length === 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5" role="list" aria-label="Catalyst suggestions">
                  {HERO_SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Icon className="size-3.5 opacity-70" aria-hidden />
                      <span className="truncate max-w-[180px]">{label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
