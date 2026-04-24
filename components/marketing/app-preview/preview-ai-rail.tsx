"use client"

import Image from "next/image"
import { useState } from "react"
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  Globe,
  History,
  Maximize2,
  MessageSquare,
  Paperclip,
  Plus,
  X,
} from "lucide-react"

import { Notes9LoaderGif } from "@/components/brand/notes9-loader-gif"
import { MarkdownRenderer } from "@/components/catalyst/markdown-renderer"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { getPreviewAiReply, type PreviewAiIntent, intentLabel, previewAiIntents } from "@/lib/marketing/preview-ai-responses"
import type { PreviewRouteId, PreviewSessionFlags } from "@/lib/marketing/preview-workflow"

import type { PreviewAction } from "./preview-reducer"

const MAX_CHAT_CHARS = 4096

type Msg = { role: "user" | "assistant"; text: string }

/**
 * Marketing preview: matches Catalyst “General” mode chrome from {@link RightSidebar}
 * (header, empty state, message bubbles, bottom composer) — limited to preview actions on Lab notes.
 */
export function MarketingPreviewAiRail({
  route,
  state,
  dispatch,
  messages,
  setMessages,
  onGoToLabNotes,
  onClose,
}: {
  route: PreviewRouteId
  state: PreviewSessionFlags
  dispatch: (a: PreviewAction) => void
  messages: Msg[]
  setMessages: (m: Msg[] | ((prev: Msg[]) => Msg[])) => void
  onGoToLabNotes: () => void
  onClose: () => void
}) {
  const [composerValue] = useState("")
  const labNotesActive = route === "lab-notes"
  /** Only show the chat transcript on Lab notes; other routes use the Catalyst empty state + CTA. */
  const hasThread = labNotesActive && messages.length > 0

  const sendIntent = (intent: PreviewAiIntent) => {
    const userText = `(${intentLabel(intent)})`
    setMessages((prev) => [...prev, { role: "user", text: userText }])
    const body = getPreviewAiReply(intent, state.noteBody)
    setMessages((prev) => [...prev, { role: "assistant", text: body }])
    dispatch({ type: "AI_REPLY" })
  }

  const emptyDescription = labNotesActive
    ? "Your intelligent research assistant. In this public preview, use the action buttons below the composer to try a safe, local reply using your note text."
    : "Your intelligent research assistant. Ask anything about your lab notes, experiments, or protocols. In this preview, open Lab notes to use the limited assistant with your session note."

  const showComposer = true

  const composer = (
    <div className="group/input relative flex w-full flex-col">
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card/50 shadow-sm transition-all",
          "focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50",
        )}
        id="tour-ai-chat"
      >
        <textarea
          value={composerValue}
          readOnly
          tabIndex={-1}
          placeholder="Plan, @ for context, / for commands"
          className="w-full min-h-[68px] cursor-not-allowed resize-none bg-transparent px-4 py-2.5 text-sm text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none scrollbar-hide"
          aria-label="Catalyst input (read-only in preview — use action chips on Lab notes)"
        />
        <div className="mt-1 flex min-h-9 items-center justify-between gap-2 px-2 pb-2">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
            <DropdownMenu>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1.5 rounded-md bg-muted/50 px-2 text-xs font-medium text-muted-foreground hover:bg-muted"
                      >
                        <MessageSquare className="size-3.5" />
                        General
                        <ChevronDown className="size-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>General mode (same as full app)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent align="start" className="w-[200px]">
                <DropdownMenuItem disabled className="gap-2 text-xs">
                  <MessageSquare className="size-3.5" />
                  General
                </DropdownMenuItem>
                <p className="px-2 pb-1.5 text-[10px] text-muted-foreground">Other agent modes in the full app.</p>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="ml-1 flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-border/50 pl-2">
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </TooltipTrigger>
                  <TooltipContent>Web search</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Switch checked={false} disabled className="shrink-0 scale-90" aria-label="Web search (full app only)" />
            </div>
          </div>
          <div className="flex h-9 shrink-0 items-center justify-end gap-1">
            <span className="mr-1 hidden text-[11px] text-muted-foreground sm:inline">
              {composerValue.length}/{MAX_CHAT_CHARS}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground"
              disabled
              aria-label="Attach files (full app only)"
            >
              <Paperclip className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground"
              disabled
              aria-label="Send (use preview actions on Lab notes)"
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>
      {labNotesActive && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Preview actions</p>
          <div className="flex flex-wrap gap-1.5">
            {previewAiIntents.map((intent) => (
              <Button
                key={intent}
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 text-[10px] leading-tight"
                onClick={() => sendIntent(intent)}
              >
                {intentLabel(intent as PreviewAiIntent)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <aside
      aria-label="Catalyst AI (preview)"
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-t border-border/45 bg-background",
        "shadow-[-2px_0_18px_-16px_rgba(44,36,24,0.22)] dark:shadow-[-2px_0_18px_-16px_rgba(0,0,0,0.45)]",
        "md:max-w-[min(100%,400px)] md:border-t-0 md:border-l",
      )}
    >
      <header className="z-10 flex h-12 shrink-0 select-none items-center justify-between border-b border-border/40 bg-[color:var(--n9-header-bg)]/80 px-2 text-xs backdrop-blur-md sm:h-14 sm:px-4">
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          <ScrollArea className="scrollbar-hide w-full max-w-full whitespace-nowrap">
            <div className="flex max-w-full items-center gap-1">
              <DropdownMenu>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground sm:size-9"
                          aria-label="Chat history (preview)"
                        >
                          <History className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Chat history in the full app</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="start" className="flex w-[min(290px,calc(100vw-2rem))] max-w-full flex-col overflow-hidden p-0" sideOffset={4}>
                  <div className="shrink-0 border-b p-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">History</div>
                  <div className="p-2 text-center text-xs text-muted-foreground">No history in this preview.</div>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                variant="secondary"
                className="h-8 shrink-0 text-muted-foreground sm:h-9"
                disabled
                aria-label="New chat (full app only)"
              >
                <Plus className="size-4" />
                <span>New Chat</span>
              </Button>
            </div>
          </ScrollArea>
        </div>
        <div className="flex shrink-0 items-center gap-1 pl-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground sm:size-9"
            disabled
            aria-label="Expand (full app only)"
            title="Full workspace in the app"
          >
            <Maximize2 className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground sm:size-9"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!hasThread ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overflow-x-hidden px-4">
              <div className="relative mb-3">
                <Notes9LoaderGif alt="Catalyst AI loader" widthPx={64} />
              </div>
              <h2 className="bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-lg font-bold tracking-tight text-transparent">
                Catalyst AI
              </h2>
              <p className="max-w-xs text-center text-sm text-muted-foreground">{emptyDescription}</p>
              {!labNotesActive && (
                <Button type="button" className="mt-4" variant="secondary" onClick={onGoToLabNotes}>
                  <BookOpen className="mr-2 size-4" />
                  Open lab notes
                </Button>
              )}
            </div>
            {showComposer && (
              <div className="z-20 flex-shrink-0 border-t bg-background/95 p-4 backdrop-blur">
                <div className="mx-auto min-w-0 max-w-3xl">{composer}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
              role="log"
              aria-label="Chat messages"
            >
              <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6 p-4 pb-4 pt-5">
                {messages.map((m, index) => (
                  <div
                    key={index}
                    className={cn("group/message flex w-full gap-4", m.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {m.role === "assistant" && (
                      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-[rgba(124,82,52,0.05)] shadow-sm dark:border-border dark:bg-background">
                        <div className="relative size-[18px] shrink-0" aria-hidden>
                          <Image
                            src="/notes9-logo-mark-transparent.png"
                            alt=""
                            width={18}
                            height={18}
                            className="object-contain dark:invert dark:brightness-125"
                          />
                        </div>
                      </div>
                    )}
                    <div
                      className={cn(
                        "flex min-w-0 max-w-[85%] flex-col",
                        m.role === "user" ? "items-end" : "items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "text-sm leading-[1.45] break-words",
                          m.role === "user"
                            ? "rounded-2xl rounded-tr-sm bg-primary/5 px-4 py-2.5 text-foreground whitespace-pre-wrap"
                            : "min-w-0 whitespace-normal text-foreground",
                        )}
                      >
                        {m.role === "assistant" ? (
                          <MarkdownRenderer
                            content={m.text}
                            className="text-sm break-words text-foreground [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:whitespace-pre [&_code]:break-all"
                          />
                        ) : (
                          m.text
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="h-2 shrink-0" aria-hidden />
              </div>
            </div>
            {showComposer && (
              <div className="z-20 flex-shrink-0 border-t bg-background/95 p-4 backdrop-blur">
                <div className="mx-auto min-w-0 max-w-3xl">{composer}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
