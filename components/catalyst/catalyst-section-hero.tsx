"use client"

import { useState, useEffect, useTransition, useCallback, useRef, type FormEvent, type KeyboardEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowUp, Paperclip, Mic, X, FileText, ImageIcon, Globe } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { AnimatePresence, motion } from "framer-motion"
import { useProjectScope } from "@/contexts/project-scope-context"
import { useCatalystPanelState } from "@/contexts/catalyst-panel-state"
import { openCatalystPanel, type CatalystSectionScope, type CatalystLaunchAttachment } from "@/lib/catalyst-launch"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useAwsTranscribe } from "@/hooks/use-aws-transcribe"
import { VoiceWaveform } from "@/components/text-editor/voice-waveform"

export type { CatalystSectionScope } from "@/lib/catalyst-launch"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

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
  shrinkOnScroll?: boolean
}

export function CatalystSectionHero({
  size = "sm",
  scope = "lab",
  placeholder = "How can I help you today?",
  formPlacement = "inline",
  shrinkOnScroll = false,
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

  // Detect scroll on the nearest scrollable ancestor (<main> with overflow-auto)
  useEffect(() => {
    if (!shrinkOnScroll) return
    const el = containerRef.current
    if (!el) return
    // Walk up the DOM to find the nearest scrollable ancestor
    let scrollParent: HTMLElement | null = el.parentElement
    while (scrollParent) {
      const style = getComputedStyle(scrollParent)
      if (
        scrollParent.scrollHeight > scrollParent.clientHeight &&
        (style.overflowY === 'auto' || style.overflowY === 'scroll')
      ) {
        break
      }
      scrollParent = scrollParent.parentElement
    }
    const target = scrollParent || window
    const handler = () => {
      const scrollTop = scrollParent ? scrollParent.scrollTop : window.scrollY
      setIsScrolled(scrollTop > 40)
    }
    target.addEventListener('scroll', handler, { passive: true })
    handler() // check initial state
    return () => target.removeEventListener('scroll', handler)
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
    startTransition(() => {
      const launch = {
        query: query || undefined,
        scope,
        projectId: projectId ?? undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        webSearch: webSearchEnabled || undefined,
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

  const canSend = input.trim().length > 0 || attachments.length > 0
  const isUploading = uploadQueue.length > 0
  const shouldShrink = shrinkOnScroll && isScrolled && !isFocused && input.trim() === "" && !canSend && !isUploading
  const minBoxHeight = shouldShrink ? "min-h-[44px]" : (size === "lg" ? "min-h-[132px]" : "min-h-[112px]")
  const contentWidth = cn("mx-auto w-full transition-all duration-500 ease-in-out", size === "lg" ? "max-w-4xl" : "max-w-3xl", shouldShrink && "max-w-2xl")
  const effectivePlaceholder = projectName
    ? `How can I help with ${projectName} today?`
    : placeholder

  const composerForm = (
    <form
      onSubmit={handleSubmit}
      aria-label="Ask Catalyst"
      className={cn(
        composerShell, 
        "transition-all duration-500 ease-in-out",
        shouldShrink
          ? "min-h-0 p-2 bg-violet-50 dark:bg-[hsl(260,30%,14%)] border-violet-300 dark:border-violet-500/60"
          : cn(minBoxHeight, "p-3")
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
                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-100/60 px-2 py-0.5 text-xs text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300 max-w-[180px]"
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
              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-100/60 px-2 py-0.5 text-xs text-violet-600 dark:border-violet-500/30 dark:bg-violet-500/15 animate-pulse max-w-[180px]"
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
        onBlur={() => setIsFocused(false)}
        placeholder={effectivePlaceholder}
        rows={1}
        aria-label="Ask Catalyst"
        className={cn(
          "w-full resize-none border-0 bg-transparent px-1 pt-0.5 text-foreground outline-none ring-0",
          "placeholder:text-muted-foreground/80 transition-all duration-500 ease-in-out",
          size === "lg" ? "text-base" : "text-[15px]",
          shouldShrink ? "min-h-[36px] flex-none" : "min-h-[44px] flex-1"
        )}
      />

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

      <div className={cn(
        "flex items-center justify-between transition-all duration-500 ease-in-out",
        shouldShrink ? "mt-0" : "mt-2"
      )}>
        <div className="flex items-center gap-1.5">
          <Globe className={cn("size-3.5 shrink-0 transition-colors", webSearchEnabled ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground")} aria-hidden />
          <Switch
            checked={webSearchEnabled}
            onCheckedChange={setWebSearchEnabled}
            aria-label="Web search"
            className="data-[state=checked]:bg-violet-600"
          />
          <span className={cn("text-xs transition-colors select-none", webSearchEnabled ? "text-violet-700 dark:text-violet-300 font-medium" : "text-muted-foreground")}>
            Web
          </span>
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
                ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700 active:scale-[0.96]"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
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
      <div
        ref={containerRef}
        className={cn(
          "transition-all duration-500 ease-in-out",
          shrinkOnScroll && "sticky -top-3 sm:-top-4 md:-top-6 z-40 -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 py-2 md:py-4",
          shrinkOnScroll && (shouldShrink
            ? "bg-transparent border-transparent"
            : "bg-background/80 backdrop-blur-md border-b border-border/50")
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
              <div className={contentWidth}>{composerForm}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const stickyShell = cn(
    "sticky top-0 z-30 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6",
    "backdrop-blur-md bg-background/75 supports-[backdrop-filter]:bg-background/55",
  )

  return (
    <div ref={containerRef} className={stickyShell}>
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
