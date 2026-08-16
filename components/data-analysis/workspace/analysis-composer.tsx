"use client"

import { useRef, useState, type RefObject } from "react"
import { Sparkle } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  approvalBlockedReason,
  canApprovePlan,
  isReadableTurn,
  type AnalysisAssistantTurn,
  type AnalysisTurn,
} from "@/lib/data-analysis/ai/analysis-thread"
import { SPEC_AUTHOR_PROMPT_MAX_CHARS } from "@/lib/data-analysis/ai/spec-author"
import type { AiGate } from "@/lib/data-analysis/workspace/ai-gate"

/**
 * The one input on the Data Analysis page, and the conversation above it.
 *
 * This is the whole AI surface for an analysis: the researcher asks, the
 * assistant answers with a plan, and the plan is applied only if they approve it
 * (ADR-014). The Catalyst rail is a different product surface and is not
 * involved — nothing here dispatches `notes9:open-catalyst`.
 *
 * The component holds no analysis state. It renders turns and reports intent;
 * the workspace owns the spec, applies approved plans through the same
 * `commitEdits` path a hand edit takes, and decides what the transcript says.
 *
 * Send eligibility and the reason for refusal both come from `gate` (ADR-023):
 * `gate.canCapture` alone decides whether Send is enabled — a pre-data intent
 * turn is a legitimate send — and `gate.reason`, never a literal chosen here,
 * is the only text ever shown for why sending (or proposing) is unavailable.
 */

export interface AnalysisComposerProps {
  turns: AnalysisTurn[]
  /** Hash of the spec as it is right now — decides whether a plan is still live. */
  currentSpecHash: string
  gate: AiGate
  busy: boolean
  onSend: (prompt: string) => void
  onApprove: (turnId: string) => void
  onDiscard: (turnId: string) => void
  /** The dataset this conversation is about. Null before one is attached. */
  datasetName: string | null
  /** The attach control — a file picker in the empty state, a chip once loaded. */
  attachSlot?: React.ReactNode
  /**
   * `empty` is the first screen of a new analysis: centred, nothing above it
   * (ADR-015). `rail` is the bare input row that `AnalysisConsole` docks below
   * the transcript in the right rail (ADR-024); `docked`/`inline` are retired
   * with ADR-019 — the console, not the composer, now owns the transcript.
   */
  variant: "empty" | "rail"
}

export interface AnalysisTranscriptProps {
  turns: AnalysisTurn[]
  currentSpecHash: string
  onApprove: (turnId: string) => void
  onDiscard: (turnId: string) => void
  /** Overrides the scroll cap; `AnalysisConsole` clears it for full-height rail flow. */
  className?: string
  /** Attaches the scroll container so `AnalysisConsole` can drive pinned auto-scroll. */
  scrollRef?: RefObject<HTMLDivElement | null>
  onScroll?: () => void
}

/**
 * The transcript, on its own: every turn, oldest first, scrolling internally
 * once it outgrows its box. Extracted so `AnalysisConsole` can own the scroll
 * container — attaching `scrollRef`/`onScroll` for pinned auto-scroll — instead
 * of this component managing its own overlay geometry, which is the bug
 * ADR-024 exists to fix.
 */
export function AnalysisTranscript({
  turns,
  currentSpecHash,
  onApprove,
  onDiscard,
  className,
  scrollRef,
  onScroll,
}: AnalysisTranscriptProps) {
  if (turns.length === 0) return null
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      data-testid="analysis-transcript-scroll"
      className={cn(
        "flex max-h-72 flex-col gap-3 overflow-y-auto rounded-2xl border border-border/60 bg-card/40 px-3 py-2",
        className,
      )}
    >
      {turns.map((turn) => (
        <Turn
          key={turn.id}
          turn={turn}
          currentSpecHash={currentSpecHash}
          onApprove={onApprove}
          onDiscard={onDiscard}
        />
      ))}
    </div>
  )
}

/** Show the counter late. A counter on an empty box is noise, not help. */
const COUNTER_VISIBLE_FROM = SPEC_AUTHOR_PROMPT_MAX_CHARS - 500

function PlanCard({
  turn,
  currentSpecHash,
  onApprove,
  onDiscard,
}: {
  turn: AnalysisAssistantTurn
  currentSpecHash: string
  onApprove: (turnId: string) => void
  onDiscard: (turnId: string) => void
}) {
  const plan = turn.plan
  if (!plan) return null

  const approvable = canApprovePlan(turn, currentSpecHash)
  const blocked = approvalBlockedReason(turn, currentSpecHash)
  const settled = plan.status === "approved" || plan.status === "discarded"

  return (
    <div
      className={cn(
        "mt-2 rounded-xl border px-3 py-2 text-[12.5px] leading-relaxed",
        plan.status === "approved"
          ? "border-[var(--n9-accent,#965034)]/30 bg-[var(--n9-accent,#965034)]/[0.05]"
          : "border-border/70 bg-background/60",
        plan.status === "stale" && "opacity-70",
      )}
    >
      {plan.steps.length > 0 && (
        <>
          <p className="font-medium text-foreground/90">
            {settled || plan.status === "stale" ? "Proposed" : "Here is what I would change"}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {plan.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </>
      )}

      {plan.clarificationNeeded && (
        // A question, not an error. Whatever else it proposed still stands; this
        // is the assistant asking for the one thing it lacks — and it is why
        // Approve is withheld rather than offered on a guess.
        <p className="mt-2 rounded-lg border border-[var(--n9-accent,#965034)]/25 bg-[var(--n9-accent,#965034)]/[0.06] px-2.5 py-1.5 text-foreground/90">
          {plan.clarificationNeeded}
        </p>
      )}

      {plan.rejected.length > 0 && (
        // A rejection is information: something was proposed, left out, and the
        // reason is worth reading. It is not a failure.
        <div className="mt-2 text-muted-foreground">
          <span className="font-medium text-foreground/80">Left out:</span>
          <ul className="list-disc space-y-0.5 pl-4">
            {plan.rejected.map((r, i) => (
              <li key={i}>{r.reason || "No reason given."}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        {approvable && (
          <Button type="button" variant="outline" size="sm" onClick={() => onApprove(turn.id)}>
            Approve
          </Button>
        )}
        {plan.status === "proposed" && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onDiscard(turn.id)}>
            Discard
          </Button>
        )}
        {/* Never a disabled button with no explanation — that reads as a bug. */}
        {!approvable && blocked && (
          <span className="text-[11.5px] text-muted-foreground">{blocked}</span>
        )}
      </div>
    </div>
  )
}

function Turn({
  turn,
  currentSpecHash,
  onApprove,
  onDiscard,
}: {
  turn: AnalysisTurn
  currentSpecHash: string
  onApprove: (turnId: string) => void
  onDiscard: (turnId: string) => void
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl bg-muted px-3 py-1.5 text-[13px] text-foreground/90">
          {turn.content}
        </p>
      </div>
    )
  }

  // A turn from a format this build does not know renders as text and offers
  // nothing to act on. Never replay mutations from a shape you cannot validate.
  if (!isReadableTurn(turn)) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        {turn.content || "This turn was saved by a newer version of Notes9."}
      </p>
    )
  }

  return (
    <div className="text-[12.5px] leading-relaxed">
      {turn.error ? (
        <p className="text-muted-foreground">{turn.error}</p>
      ) : (
        turn.content && <p className="text-foreground/90">{turn.content}</p>
      )}
      <PlanCard
        turn={turn}
        currentSpecHash={currentSpecHash}
        onApprove={onApprove}
        onDiscard={onDiscard}
      />
      {turn.historyDropped ? (
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Earlier turns were left out of this answer to stay within the assistant&rsquo;s
          context ({turn.historyDropped} dropped).
        </p>
      ) : null}
    </div>
  )
}

export function AnalysisComposer({
  gate,
  busy,
  onSend,
  datasetName,
  attachSlot,
  variant,
}: AnalysisComposerProps) {
  const [prompt, setPrompt] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ADR-023: capturing intent needs nothing, proposing needs a dataset. Send
  // is gated on `canCapture` alone — a pre-data intent turn is legitimate even
  // while `canPropose` is false — and `canPropose` never enters this check.
  const canSend = gate.canCapture && !busy && prompt.trim().length > 0

  function submit() {
    if (!canSend) return
    onSend(prompt.trim())
    setPrompt("")
    textareaRef.current?.focus()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit()
  }

  // Enter sends, Shift+Enter inserts a newline — the standard chat-composer
  // convention, and the reason this is a <textarea> rather than <Input>.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const composer = (
    <form
      onSubmit={handleSubmit}
      aria-label="Ask about this data"
      className={cn(
        "rounded-2xl border border-border bg-card/80 shadow-sm backdrop-blur-sm",
        variant === "empty" && "shadow-md",
      )}
    >
      <div className="flex items-end gap-2 px-3 py-2">
        <Sparkle
          className="mb-1.5 h-4 w-4 shrink-0 text-[var(--n9-accent,#965034)]"
          weight="fill"
          aria-hidden
        />
        <Textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          // The cap is the backend's, imported rather than retyped: a local copy
          // passes every test here and drifts the moment the route changes.
          maxLength={SPEC_AUTHOR_PROMPT_MAX_CHARS}
          aria-label="Ask about this data"
          // The placeholder never authors its own copy for why sending is
          // unavailable — `gate.reason` is rendered verbatim, or, when nothing
          // blocks capture, the ordinary prompt.
          placeholder={
            !gate.canCapture && gate.reason
              ? gate.reason
              : "Ask a question, or describe a change — “log the Y axis”, “compare the groups”"
          }
          className="min-h-8 max-h-32 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-1 text-[13px] shadow-none focus-visible:ring-0"
        />
        {prompt.length >= COUNTER_VISIBLE_FROM && (
          <span className="mb-1.5 shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {SPEC_AUTHOR_PROMPT_MAX_CHARS - prompt.length}
          </span>
        )}
        {/* "Ask", not "Apply": this asks. Applying happens on Approve. */}
        <Button type="submit" variant="outline" size="sm" disabled={!canSend} className="shrink-0">
          {busy ? "Thinking…" : "Ask"}
        </Button>
      </div>

      {(attachSlot || datasetName || gate.reason) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-1.5 text-[11.5px] text-muted-foreground">
          {attachSlot}
          {datasetName && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-foreground/80">
              {datasetName}
            </span>
          )}
          {/* Verbatim, always — the reason is derived by the gate, never a
              literal chosen here (ADR-015's lying-gate failure). */}
          {gate.reason && <span>{gate.reason}</span>}
        </div>
      )}
    </form>
  )

  if (variant === "empty") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-stretch gap-3 py-16">
        <div className="text-center">
          <h2 className="text-base font-medium text-foreground/90">Start an analysis</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Attach a data file and ask a question. Nothing changes until you approve the
            plan.
          </p>
        </div>
        {composer}
      </div>
    )
  }

  // `rail`: the bare input row. `AnalysisConsole` owns the transcript above it
  // and the scroll container it lives in.
  return composer
}
