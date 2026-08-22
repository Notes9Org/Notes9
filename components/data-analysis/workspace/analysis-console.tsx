"use client"

import { useRef } from "react"

import { Button } from "@/components/ui/button"
import { usePinnedAutoScroll } from "@/hooks/use-pinned-auto-scroll"
import type { AnalysisTurn } from "@/lib/data-analysis/ai/analysis-thread"
import type { AiGate } from "@/lib/data-analysis/workspace/ai-gate"
import { AnalysisComposer, AnalysisTranscript } from "@/components/data-analysis/workspace/analysis-composer"
import type { SpecAuthorPhase } from "@/lib/data-analysis/ai/spec-author-client"
import { PhaseList } from "@/components/data-analysis/workspace/phase-list"

/**
 * The conversation, in the right rail (ADR-024).
 *
 * This supersedes the ADR-019 bottom-dock console: no `absolute`/`bottom-full`
 * overlay, no 40vh cap, no collapse state that can hide a pending plan. The
 * transcript renders in ordinary full-height flow — `variant="rail"` fills
 * whatever height its parent (the rail tab, slice 03) gives it — and stays
 * pinned to the bottom on new turns via `use-pinned-auto-scroll`, without
 * yanking a researcher who has scrolled up to reread an earlier turn.
 *
 * `empty` (no analysis mounted yet) renders `AnalysisComposer`'s existing
 * centred, first-screen composer (ADR-015) unchanged — nothing here competes
 * with it.
 *
 * This component holds no analysis state of its own; `gate`, `turns` and
 * `busy` all come from the parent (ADR-026: they move as one unit per
 * analysis).
 */

export interface AnalysisConsoleProps {
  turns: AnalysisTurn[]
  /** Hash of the spec as it is right now — decides whether a plan is still live. */
  currentSpecHash: string
  busy: boolean
  gate: AiGate
  onSend: (prompt: string) => void
  onApprove: (turnId: string) => void
  onDiscard: (turnId: string) => void
  /** The dataset this conversation is about. Null before one is attached. */
  datasetName: string | null
  /**
   * `empty` is the first screen of a new analysis: centred, nothing above it.
   * `rail` is the working state: full-height transcript + composer, sized by
   * whatever docks it (slice 03).
   */
  variant: "empty" | "rail"
  /** Empty-state only: the attach control (file picker / import buttons). */
  attachSlot?: React.ReactNode
  /**
   * Live progress for the turn in flight. Progress only — a phase never
   * carries content, because the patch is delivered whole after validation
   * (§3.2 Law 2).
   */
  phases?: SpecAuthorPhase[]
}

export function AnalysisConsole({ variant, attachSlot, ...rest }: AnalysisConsoleProps) {
  if (variant === "empty") {
    return <AnalysisComposer {...rest} attachSlot={attachSlot} variant="empty" />
  }
  return <RailConsole {...rest} />
}

type RailConsoleProps = Omit<AnalysisConsoleProps, "variant" | "attachSlot">

function RailConsole({
  turns,
  currentSpecHash,
  busy,
  gate,
  onSend,
  onApprove,
  onDiscard,
  datasetName,
  phases,
}: RailConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { onScroll, scrollToBottom, showJumpBottom } = usePinnedAutoScroll(scrollRef, [turns])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="relative min-h-0 flex-1">
        <AnalysisTranscript
          turns={turns}
          currentSpecHash={currentSpecHash}
          onApprove={onApprove}
          onDiscard={onDiscard}
          scrollRef={scrollRef}
          onScroll={onScroll}
          className="h-full max-h-none min-h-0 rounded-none border-0 bg-transparent px-0"
        />
        {showJumpBottom && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute inset-x-0 bottom-2 mx-auto w-fit"
            onClick={scrollToBottom}
          >
            Jump to latest
          </Button>
        )}
      </div>

      {/* Only while the turn is in flight. Once it lands, the record of what
          happened lives in the turn itself and on the provenance card; leaving
          a spent checklist above the composer would just be clutter that grows
          with every question asked. */}
      {busy && phases && phases.length > 0 && (
        <PhaseList phases={phases} className="px-1 pb-0.5" />
      )}

      <AnalysisComposer
        turns={turns}
        currentSpecHash={currentSpecHash}
        busy={busy}
        gate={gate}
        onSend={onSend}
        onApprove={onApprove}
        onDiscard={onDiscard}
        datasetName={datasetName}
        variant="rail"
      />
    </div>
  )
}
