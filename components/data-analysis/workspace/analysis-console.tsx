"use client"

import { useEffect, useRef, useState } from "react"
import { CaretDown, CaretUp } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import {
  approvalBlockedReason,
  canApprovePlan,
  type AnalysisAssistantTurn,
  type AnalysisTurn,
} from "@/lib/data-analysis/ai/analysis-thread"
import { AnalysisComposer, AnalysisTranscript } from "@/components/data-analysis/workspace/analysis-composer"
import { Collapse } from "@/components/data-analysis/workspace/motion"

/**
 * The conversation, docked to the bottom of the analysis pane (ADR-019).
 *
 * `AnalysisComposer` used to render the transcript directly above the form, in
 * normal document flow — three turns and the sheet was below the fold, because
 * in the working state the sheet and the chart are the subject and the
 * conversation is a tool acting on them, not the other way round. This
 * component is the fix: a single ~44px bar at rest, with the transcript
 * expanding upward as an OVERLAY (`position: absolute`, `bottom-full`) only
 * while it is being read, so it never pushes or reflows the work underneath.
 *
 * Three rules, in order of how often they get violated:
 *   1. Collapsed is the default and the resting state. A panel that stays open
 *      is the bug being fixed here.
 *   2. It never exceeds 40vh and it overlays rather than pushes — the chart
 *      does not reflow when a reply arrives.
 *   3. A pending plan survives collapse: the collapsed bar still shows the
 *      count and, for the most recent proposal, an Approve button. A plan the
 *      researcher cannot see is a plan they will not approve.
 *
 * `empty` (no dataset yet) is unchanged from `AnalysisComposer`'s existing
 * centred, first-screen composer (ADR-015) — nothing here competes with it,
 * so it is rendered as-is rather than reimplemented.
 *
 * This component holds no analysis state beyond its own expand/collapse,
 * which is intentionally NOT persisted: a layout preference that survived a
 * reload would fight rule 1 above every time the page is revisited.
 */

export interface AnalysisConsoleProps {
  turns: AnalysisTurn[]
  /** Hash of the spec as it is right now — decides whether a plan is still live. */
  currentSpecHash: string
  busy: boolean
  /** null means "send is available". A string is the reason it is not, shown as-is. */
  blockedReason: string | null
  onSend: (prompt: string) => void
  onApprove: (turnId: string) => void
  onDiscard: (turnId: string) => void
  /** The dataset this conversation is about. Null before one is attached. */
  datasetName: string | null
  /**
   * `empty` is the first screen of a new analysis: centred, nothing above it.
   * `docked` is the working state: the bottom console described above.
   */
  variant: "empty" | "docked"
  /** Empty-state only: the attach control (file picker / import buttons). */
  attachSlot?: React.ReactNode
}

function isAssistantTurn(turn: AnalysisTurn): turn is AnalysisAssistantTurn {
  return turn.role === "assistant"
}

export function AnalysisConsole({ variant, attachSlot, ...rest }: AnalysisConsoleProps) {
  if (variant === "empty") {
    return <AnalysisComposer {...rest} attachSlot={attachSlot} variant="empty" />
  }
  return <DockedConsole {...rest} />
}

type DockedConsoleProps = Omit<AnalysisConsoleProps, "variant" | "attachSlot">

function DockedConsole({
  turns,
  currentSpecHash,
  busy,
  blockedReason,
  onSend,
  onApprove,
  onDiscard,
  datasetName,
}: DockedConsoleProps) {
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // "send → expanded" and "reply arrives → expanded" are the same event from
  // here: the last turn in the array changed identity. Keyed off `id` rather
  // than `length` so a discard/replace that keeps the count steady still
  // counts, and a re-render with the SAME turns (no new one) never re-expands
  // an analysis the researcher already collapsed by hand.
  const lastTurnId = turns.length > 0 ? turns[turns.length - 1].id : null
  const previousLastTurnId = useRef(lastTurnId)
  useEffect(() => {
    if (lastTurnId !== previousLastTurnId.current) {
      setExpanded(true)
      previousLastTurnId.current = lastTurnId
    }
  }, [lastTurnId])

  // "focus moves to the sheet → collapsed". The console has no view of the
  // sheet itself (it is not this component's file to own), so the general
  // form of that rule is used instead: focus leaving the console collapses
  // it, wherever it lands. A `focusin` listener on `document` catches this
  // regardless of internal DOM structure, unlike a plain `onBlur`, whose
  // `relatedTarget` is not reliable across browsers and test environments.
  useEffect(() => {
    if (!expanded) return
    function handleFocusIn(e: FocusEvent) {
      const root = rootRef.current
      if (!root) return
      if (e.target instanceof Node && !root.contains(e.target)) {
        setExpanded(false)
      }
    }
    document.addEventListener("focusin", handleFocusIn)
    return () => document.removeEventListener("focusin", handleFocusIn)
  }, [expanded])

  function handleSend(prompt: string) {
    setExpanded(true)
    onSend(prompt)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Escape collapses without discarding — the plan, if there is one, is
    // still there, just not being read right now.
    if (e.key === "Escape" && expanded) {
      setExpanded(false)
    }
  }

  // The exact formula this slice's interface promises slice 03: every
  // assistant turn still carrying a freshly proposed (not yet approved,
  // discarded, or staled-out) plan.
  const pendingCount = turns.filter((t) => t.role === "assistant" && t.plan?.status === "proposed").length

  // Only the MOST RECENT proposal is offered an Approve button down here.
  // Older ones are superseded by definition (a later question moved the
  // conversation on) and stay reachable by expanding the transcript, where
  // each one still carries its own Approve/Discard via `AnalysisTranscript`.
  const latestProposed = [...turns].reverse().find((t) => isAssistantTurn(t) && t.plan?.status === "proposed") as
    | AnalysisAssistantTurn
    | undefined
  const latestApprovable = latestProposed ? canApprovePlan(latestProposed, currentSpecHash) : false
  const latestBlockedReason = latestProposed ? approvalBlockedReason(latestProposed, currentSpecHash) : null

  return (
    <div ref={rootRef} onKeyDown={handleKeyDown} className="relative">
      {turns.length > 0 && (
        <div className="absolute inset-x-0 bottom-full z-10 mb-2 max-h-[40vh] overflow-y-auto rounded-2xl border border-border bg-card/95 shadow-lg backdrop-blur-sm">
          <Collapse open={expanded}>
            <AnalysisTranscript
              turns={turns}
              currentSpecHash={currentSpecHash}
              onApprove={onApprove}
              onDiscard={onDiscard}
              className="max-h-none overflow-visible border-0 bg-transparent"
            />
          </Collapse>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <AnalysisComposer
            turns={turns}
            currentSpecHash={currentSpecHash}
            busy={busy}
            blockedReason={blockedReason}
            onSend={handleSend}
            onApprove={onApprove}
            onDiscard={onDiscard}
            datasetName={datasetName}
            variant="docked"
          />
        </div>

        {/* Rule 3: a pending plan survives collapse. Hidden once expanded —
            the same plan is right there in the transcript, with its own
            Approve/Discard, and showing it twice invites approving twice. */}
        {!expanded && latestProposed && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              aria-label={`${pendingCount} pending ${pendingCount === 1 ? "plan" : "plans"}`}
              className="rounded-full bg-[var(--n9-accent,#965034)]/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--n9-accent,#965034)]"
            >
              {pendingCount}
            </span>
            {latestApprovable ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onApprove(latestProposed.id)}>
                Approve
              </Button>
            ) : (
              // Never a disabled button with no explanation — that reads as a bug.
              latestBlockedReason && (
                <span className="text-[11px] text-muted-foreground">{latestBlockedReason}</span>
              )
            )}
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse the conversation" : "Expand the conversation"}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? <CaretDown aria-hidden /> : <CaretUp aria-hidden />}
        </Button>
      </div>
    </div>
  )
}
