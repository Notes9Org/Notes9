"use client"

import { useState, useEffect, useTransition, useCallback, useRef, type FormEvent, type KeyboardEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowUp, Paperclip, Microphone as Mic, X, FileText, Image as ImageIcon, Globe } from "@phosphor-icons/react/ssr"
import { Switch } from "@/components/ui/switch"
import { AnimatePresence, motion } from "framer-motion"
import { useProjectScope } from "@/contexts/project-scope-context"
import { useCatalystPanelState } from "@/contexts/catalyst-panel-state"
import { openCatalystPanel, type CatalystSectionScope, type CatalystLaunchAttachment } from "@/lib/catalyst-launch"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { isComposerBlocked } from "@/lib/catalyst/composer-gate"
import { useAwsTranscribe } from "@/hooks/use-aws-transcribe"
import { VoiceWaveform } from "@/components/text-editor/voice-waveform"

export type { CatalystSectionScope } from "@/lib/catalyst-launch"

import { ALLOWED_MIME_TYPES, ATTACHMENT_MAX_FILE_SIZE } from "@/lib/attachment-types"

const MAX_FILE_SIZE = ATTACHMENT_MAX_FILE_SIZE
const ALLOWED_TYPES: readonly string[] = ALLOWED_MIME_TYPES

// The unified glass composer (`.n9-composer`, globals.css) with the Catalyst
// AI identity modifier (sienna ring + apricot glow) and the moving neon
// outline (`.n9-neon-ring`). Glass at rest, solidifies on focus so typed
// text stays readable.
const composerShell = cn("n9-composer n9-composer-ai n9-neon-ring flex flex-col overflow-hidden p-3")

type Props = {
  size?: "sm" | "lg"
  scope?: CatalystSectionScope
  placeholder?: string
  /** When "inline", the composer scrolls with the page instead of sticking. */
  formPlacement?: "sticky" | "inline"
  shrinkOnScroll?: boolean
  /**
   * Why this composer cannot accept a question yet, or null when it can.
   *
   * The Data page sets it: a statistical question with no dataset is
   * unanswerable, and the honest place to say so is here, before the request
   * leaves the page — not as a model reply apologising for having nothing to
   * work with. Attaching a file clears it, because an attachment IS a dataset;
   * the requirement is "at least one dataset", not "a populated sheet".
   */
  requiresDataReason?: string | null
}

export function CatalystSectionHero({
  size = "sm",
  scope = "lab",
  placeholder,
  formPlacement = "inline",
  shrinkOnScroll = false,
  requiresDataReason = null,
}: Props) {
  const [input, setInput] = useState("")
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [attachments, setAttachments] = useState<CatalystLaunchAttachment[]>([])
  const [uploadQueue, setUploadQueue] = useState<string[]>([])
  const [isFocused, setIsFocused] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const { projectId, projectName } = useProjectScope()
  const { isOpen: catalystPanelOpen } = useCatalystPanelState()

  // Detect scroll on the nearest scrollable ancestor (the app layout's <main>
  // with overflow-auto). We identify it by its overflow STYLE alone, not by
  // `scrollHeight > clientHeight`, which depends on the current window size and
  // whether content has loaded yet. Gating on that made the lookup fall back to
  // `window` on short pages or large windows, so the shrink effect only worked
  // on the (tall) dashboard and broke when the window was resized.
  useEffect(() => {
    if (!shrinkOnScroll) return
    const el = containerRef.current
    if (!el) return

    const findScrollParent = (): HTMLElement | null => {
      let node: HTMLElement | null = el.parentElement
      while (node) {
        const overflowY = getComputedStyle(node).overflowY
        if (overflowY === 'auto' || overflowY === 'scroll') return node
        node = node.parentElement
      }
      return null
    }

    let scrollParent = findScrollParent()
    let target: HTMLElement | Window = scrollParent ?? window

    const handler = () => {
      const scrollTop = scrollParent ? scrollParent.scrollTop : window.scrollY
      setIsScrolled(scrollTop > 40)
    }

    // The layout's scroll container can change across breakpoints (e.g. when the
    // window is resized between mobile/desktop), so re-resolve it on resize and
    // re-evaluate the scrolled state.
    const onResize = () => {
      const next = findScrollParent()
      if (next !== scrollParent) {
        target.removeEventListener('scroll', handler)
        scrollParent = next
        target = scrollParent ?? window
        target.addEventListener('scroll', handler, { passive: true })
      }
      handler()
    }

    target.addEventListener('scroll', handler, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    handler() // check initial state
    return () => {
      target.removeEventListener('scroll', handler)
      window.removeEventListener('resize', onResize)
    }
  }, [shrinkOnScroll])

  const { start: startMic, stop: stopMic, isListening, getWaveformData } = useAwsTranscribe({
    onFinal: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text).trimStart()),
    onInterim: () => {},
    onError: (err) => toast.error(err),
  })

  const uploadFile = useCallback(async (file: File): Promise<CatalystLaunchAttachment | null> => {
    if (file.size > MAX_FILE_SIZE) { toast.error(`${file.name} is too large (max 10 MB)`); return null }
    if (!ALLOWED_TYPES.includes(file.type)) { toast.error(`${file.name} type not supported`); return null }
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/files/upload", { method: "POST", body: fd })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Upload failed") }
      const d = await res.json()
      return { url: d.url, name: d.pathname, contentType: d.contentType, size: d.size }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
      return null
    }
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploadQueue(files.map((f) => f.name))
    const results = await Promise.all(files.map(uploadFile))
    setAttachments((prev) => [...prev, ...results.filter((r): r is CatalystLaunchAttachment => r !== null)])
    setUploadQueue([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [uploadFile])

  function dispatchAsk(text: string) {
    const query = text.trim()
    if (!query && attachments.length === 0 && uploadQueue.length === 0) return
    // The disabled Send button covers the click; this covers Enter, which
    // bypasses it. Refusing loudly rather than returning silently — a composer
    // that swallows a keystroke reads as broken, not as a requirement.
    if (blockedForData) {
      toast.error(requiresDataReason ?? "Add a dataset first.")
      return
    }
    startTransition(() => {
      const launch = {
        query: query || undefined,
        scope,
        projectId: projectId ?? undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        webSearch: webSearchEnabled || undefined,
        // The user already pressed Send here, the sidebar should submit the
        // prompt automatically rather than make them click Send a second time.
        autoSend: true,
      }
      if (pathname?.startsWith("/catalyst")) {
        const params = new URLSearchParams()
        if (query) params.set("q", query)
        if (scope) params.set("scope", scope)
        if (projectId) params.set("project", projectId)
        router.push(`/catalyst?${params.toString()}`)
        return
      }
      openCatalystPanel(launch)
    })
    setInput("")
    setAttachments([])
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

  // An attachment satisfies the data requirement on its own — a CSV in the
  // composer is a dataset Catalyst can read, so the block lifts the moment one
  // is queued rather than waiting for the sheet to be populated.
  const blockedForData = isComposerBlocked(requiresDataReason, attachments.length, uploadQueue.length)

  const canSend = !blockedForData && (input.trim().length > 0 || attachments.length > 0)
  const isUploading = uploadQueue.length > 0
  // One line at rest on every page; the composer expands (height AND width,
  // sprung) only while the user is actually in it, focused, typing, or with
  // attachments in flight.
  const expanded = isFocused || input.trim().length > 0 || attachments.length > 0 || isUploading
  // A placeholder passed by the caller describes what THIS page's composer is
  // for, and outranks the project greeting: on the Data page the difference is
  // between "ask about your data" and a generic prompt that tells a researcher
  // nothing about the analysis seam sitting under it. The greeting is the
  // fallback for pages that don't name their own job.
  // While blocked, the placeholder carries the reason. It is the one piece of
  // text a researcher is already reading when they go to type, so the
  // requirement arrives before the wasted keystrokes rather than after them.
  const effectivePlaceholder = blockedForData
    ? requiresDataReason!
    : placeholder ??
      (projectName ? `How can I help with ${projectName} today?` : "How can I help you today?")

  // One shared, gently-damped spring for every part of the expand gesture so
  // width, height and the controls row land together, no FLIP `layout`
  // animation here (it visibly stretched the textarea/placeholder mid-flight).
  const composerSpring = { type: "spring" as const, stiffness: 280, damping: 32, mass: 0.9 }

  const composerForm = (
    <motion.form
      animate={{ minHeight: expanded ? (size === "lg" ? 132 : 112) : 0 }}
      transition={composerSpring}
      onSubmit={handleSubmit}
      aria-label="Ask Catalyst"
      className={cn(
        composerShell,
        "relative transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        expanded ? "p-3" : "p-2",
      )}
    >
      {/* Attachment chips */}
      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachments.map((att, i) => {
            const isImage = att.contentType?.startsWith("image/")
            return (
              <span
                key={att.url}
                className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary dark:border-primary/30 dark:bg-primary/15 max-w-[180px]"
              >
                {isImage ? <ImageIcon className="size-3 shrink-0" /> : <FileText className="size-3 shrink-0" />}
                <span className="truncate">{att.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="ml-0.5 shrink-0 opacity-60 hover:opacity-100"
                  aria-label={`Remove ${att.name}`}
                >
                  <X className="size-2.5" />
                </button>
              </span>
            )
          })}
          {uploadQueue.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary/80 dark:border-primary/30 dark:bg-primary/15 animate-pulse max-w-[180px]"
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{name}</span>
            </span>
          ))}
        </div>
      )}

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          // Keep the composer expanded while focus moves WITHIN it (mic,
          // paperclip, send), otherwise the row collapses under the pointer
          // before the button's click can land.
          const form = e.currentTarget.form
          if (form && e.relatedTarget instanceof Node && form.contains(e.relatedTarget)) return
          setIsFocused(false)
        }}
        placeholder={effectivePlaceholder}
        rows={1}
        aria-label="Ask Catalyst"
        className={cn(
          "w-full resize-none border-0 bg-transparent px-1 pt-0.5 text-foreground outline-none ring-0",
          "placeholder:text-muted-foreground/80 transition-[min-height,height,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          size === "lg" ? "text-base" : "text-[15px]",
          expanded ? "min-h-[44px] flex-1" : "h-9 min-h-0 flex-none py-1.5 pr-10",
        )}
      />

      {/* Compact one-liner keeps a quiet send affordance at the right edge
          (absolute, fades without touching layout). */}
      <AnimatePresence initial={false}>
        {!expanded && (
          <motion.button
            key="compact-send"
            type="submit"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            disabled={!canSend || isUploading}
            aria-label="Send to Catalyst"
            className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <ArrowUp className="size-3.5" strokeWidth={2.25} aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={handleFileSelect}
        disabled={isUploading}
      />

      {/* Controls row, mounts/unmounts with a real exit animation; the top
          spacing lives INSIDE the collapsing container so the height reaches
          exactly zero (an outer margin left an 8px jump at the end). */}
      <AnimatePresence initial={false}>
      {expanded && (
      <motion.div
        key="composer-controls"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={composerSpring}
        className="overflow-hidden"
      >
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-1.5">
          <Globe className={cn("size-3.5 shrink-0 transition-colors", webSearchEnabled ? "text-primary" : "text-muted-foreground")} aria-hidden />
          <Switch
            checked={webSearchEnabled}
            onCheckedChange={setWebSearchEnabled}
            aria-label="Web search"
            title={webSearchEnabled ? "Web search on" : "Web search off"}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        <div className="flex items-center gap-1">
          {/* Mic button + waveform */}
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => isListening ? stopMic() : startMic()}
              aria-label={isListening ? "Stop dictation" : "Dictate message"}
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-all",
                isListening
                  ? "bg-red-100 text-red-500 dark:bg-red-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Mic className="size-3.5" aria-hidden />
            </button>
            {isListening && <VoiceWaveform getWaveformData={getWaveformData} />}
          </div>

          {/* Paperclip */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            aria-label="Attach file"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:text-foreground hover:bg-muted disabled:opacity-40"
          >
            <Paperclip className="size-3.5" aria-hidden />
          </button>

          {/* Send */}
          <button
            type="submit"
            disabled={!canSend || isUploading}
            aria-label={
              projectName ? `Send to Catalyst (scoped to ${projectName})` : "Send to Catalyst"
            }
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-all",
              canSend && !isUploading
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-[var(--n9-accent-hover)] active:scale-[0.96]"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>
      </motion.div>
      )}
      </AnimatePresence>
    </motion.form>
  )

  // Width follows the same gesture: a narrow one-liner at rest, easing wider
  // while the user is composing.
  const composerWithWidth = (
    <motion.div
      className="mx-auto w-full"
      animate={{ maxWidth: expanded ? (size === "lg" ? "48rem" : "42rem") : "34rem" }}
      transition={composerSpring}
    >
      {composerForm}
    </motion.div>
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
    // Inline: fade only, NO height/overflow-hidden animation. The earlier
    // height:"auto" + overflow:hidden collapse settled shorter than the
    // composer's content and clipped the bottom toolbar (Catalyst badge +
    // send button). A plain opacity fade has no such measurement hazard.
    return (
      <div
        ref={containerRef}
        className={cn(
          "transition-all duration-500 ease-in-out",
          shrinkOnScroll && "sticky -top-3 sm:-top-4 md:-top-6 z-40 -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 py-2 md:py-4",
          // Same at-rest fix as the sticky shell: only wash while scrolled.
          shrinkOnScroll && (isScrolled && expanded
            ? "bg-background/80 backdrop-blur-md"
            : "bg-transparent")
        )}
      >
        <AnimatePresence initial={false}>
          {!catalystPanelOpen && (
            <motion.div
              key="catalyst-composer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {composerWithWidth}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const stickyShell = cn(
    "sticky top-0 z-30 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 transition-colors duration-300",
    // The wash exists so content scrolling UNDER the stuck composer stays
    // readable, at rest it just painted a page-wide light bar behind the
    // (narrower) composer, so it now appears only once the page scrolls.
    isScrolled
      ? "backdrop-blur-md bg-background/75 supports-[backdrop-filter]:bg-background/55"
      : "bg-transparent",
  )

  return (
    <div ref={containerRef} className={stickyShell}>
      <AnimatePresence initial={false} mode="wait">
        {catalystPanelOpen ? null : (
          <motion.div key="catalyst-hero" {...collapseMotion}>
            {composerWithWidth}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
