"use client"

import { useState, useTransition, type FormEvent, type KeyboardEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowUp, Sparkles } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { useProjectScope } from "@/contexts/project-scope-context"
import { useCatalystPanelState } from "@/contexts/catalyst-panel-state"
import { openCatalystPanel, type CatalystSectionScope } from "@/lib/catalyst-launch"
import { cn } from "@/lib/utils"

export type { CatalystSectionScope } from "@/lib/catalyst-launch"

// Purple "AI" treatment so the composer reads unmistakably as the Catalyst AI
// feature (distinct from the app's burnt-sienna brand).
const composerShell = cn(
  "flex flex-col overflow-hidden rounded-2xl border-2 p-3",
  "border-violet-300/70 bg-violet-50/50 dark:border-violet-500/40 dark:bg-violet-500/10",
  "shadow-[0_1px_2px_rgba(80,50,150,0.05),0_8px_28px_-8px_rgba(124,92,255,0.18)]",
  "transition-[border-color,box-shadow] duration-200",
  "focus-within:border-violet-400 dark:focus-within:border-violet-400",
  "focus-within:shadow-[0_8px_28px_-8px_rgba(124,92,255,0.28),0_0_0_3px_rgba(124,92,255,0.18)]",
)

type Props = {
  size?: "sm" | "lg"
  scope?: CatalystSectionScope
  placeholder?: string
  /** When "inline", the composer scrolls with the page instead of sticking. */
  formPlacement?: "sticky" | "inline"
}

export function CatalystSectionHero({
  size = "sm",
  scope = "lab",
  placeholder = "How can I help you today?",
  formPlacement = "inline",
}: Props) {
  const [input, setInput] = useState("")
  const [, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const { projectId, projectName } = useProjectScope()
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

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      dispatchAsk(input)
    }
  }

  const canSend = input.trim().length > 0
  const minBoxHeight = size === "lg" ? "min-h-[132px]" : "min-h-[112px]"
  const contentWidth = cn("mx-auto w-full", size === "lg" ? "max-w-4xl" : "max-w-3xl")
  const effectivePlaceholder = projectName
    ? `How can I help with ${projectName} today?`
    : placeholder

  const composerForm = (
    <form
      onSubmit={handleSubmit}
      aria-label="Ask Catalyst"
      className={cn(composerShell, minBoxHeight)}
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={effectivePlaceholder}
        rows={1}
        aria-label="Ask Catalyst"
        className={cn(
          "min-h-[44px] w-full flex-1 resize-none border-0 bg-transparent px-1 pt-0.5 text-foreground outline-none ring-0",
          "placeholder:text-muted-foreground/80",
          size === "lg" ? "text-base" : "text-[15px]",
        )}
      />

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm"
          >
            <Sparkles className="size-4" strokeWidth={2} />
          </span>
          <span className="font-display text-sm font-semibold text-violet-700 dark:text-violet-300">
            Catalyst
          </span>
        </div>

        <button
          type="submit"
          disabled={!canSend}
          aria-label={
            projectName ? `Send to Catalyst (scoped to ${projectName})` : "Send to Catalyst"
          }
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-all",
            canSend
              ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700 active:scale-[0.96]"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </form>
  )

  const collapseMotion = {
    initial: { height: 0, opacity: 0, marginTop: 0, marginBottom: 0 },
    animate: {
      height: "auto" as const,
      opacity: 1,
      marginTop: formPlacement === "inline" ? 0 : "0.5rem",
      marginBottom: "0.5rem",
    },
    exit: { height: 0, opacity: 0, marginTop: 0, marginBottom: 0 },
    transition: { type: "spring" as const, stiffness: 220, damping: 26 },
    style: { overflow: "hidden" as const },
  }

  if (formPlacement === "inline") {
    // Inline: fade only — NO height/overflow-hidden animation. The earlier
    // height:"auto" + overflow:hidden collapse settled shorter than the
    // composer's content and clipped the bottom toolbar (Catalyst badge +
    // send button). A plain opacity fade has no such measurement hazard.
    return (
      <AnimatePresence initial={false}>
        {!catalystPanelOpen && (
          <motion.div
            key="catalyst-composer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className={contentWidth}>{composerForm}</div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  const stickyShell = cn(
    "sticky top-0 z-30 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6",
    "backdrop-blur-md bg-background/75 supports-[backdrop-filter]:bg-background/55",
  )

  return (
    <div className={stickyShell}>
      <AnimatePresence initial={false} mode="wait">
        {catalystPanelOpen ? null : (
          <motion.div key="catalyst-hero" {...collapseMotion}>
            <div className={contentWidth}>{composerForm}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
