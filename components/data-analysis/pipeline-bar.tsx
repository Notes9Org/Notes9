"use client"

import { Plus, X } from "@phosphor-icons/react/ssr"
import type { Exclusion, RowFilter, Transform } from "@/lib/data-analysis/spec/analysis-spec"
import {
  exclusionChipLabel,
  filterChipLabel,
  transformChipLabel,
} from "@/lib/data-analysis/workspace/pipeline-chips"
import type { PrepOffer } from "@/lib/data-analysis/workspace/prep-offers"

/**
 * P5, the pipeline bar.
 *
 * A row of chips for what is currently filtered, transformed away or
 * excluded, the AI-authored pipeline (P3) surfaced where a researcher can see
 * it and undo it, one chip at a time. Alongside them, the preparation the
 * engine's own measurements warrant but nobody has applied yet: an offer chip
 * quotes the number that motivated it, so the suggestion is auditable rather
 * than a guess, and accepting one dispatches the same ordinary mutation the
 * assistant would have proposed.
 *
 * Props in, callbacks out, no internal state. Every removal is the caller's
 * job to route through the existing mutation appliers
 * (`lib/data-analysis/spec/mutations.ts`), the same code path a typed patch
 * or a dragged control uses, so there is exactly one meaning for "remove
 * this," not a second one spliced together in here.
 */

export interface PipelineBarProps {
  filters: RowFilter[]
  transforms: Transform[]
  exclusions: Exclusion[]
  /** Measured, not yet applied. Empty when the numbers warrant nothing. */
  offers?: PrepOffer[]
  onSetFilters: (filters: RowFilter[]) => void
  onRemoveTransform: (index: number) => void
  onRestoreRow: (rowId: string) => void
  onAcceptOffer?: (offer: PrepOffer) => void
}

const CHIP_CLASS =
  "inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-1 pl-2.5 pr-1.5 text-[12px] text-foreground/90"

const REMOVE_CLASS =
  "flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--n9-accent,#965034)]/40"

/**
 * Dashed, because an offer is not part of the pipeline until it is taken. The
 * solid chips above describe what the data HAS had done to it; these describe
 * what it has not.
 */
const OFFER_CLASS =
  "inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-transparent py-1 pl-2 pr-2.5 text-left text-[12px] text-muted-foreground outline-none transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--n9-accent,#965034)]/40"

export function PipelineBar({
  filters,
  transforms,
  exclusions,
  offers = [],
  onSetFilters,
  onRemoveTransform,
  onRestoreRow,
  onAcceptOffer,
}: PipelineBarProps) {
  // Visually unchanged until the AI (or a manual edit) puts something in the
  // pipeline, or the profile finds something worth offering; an empty bar would
  // just be a strip of dead space.
  const showOffers = offers.length > 0 && onAcceptOffer !== undefined
  if (filters.length === 0 && transforms.length === 0 && exclusions.length === 0 && !showOffers) {
    return null
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-3 py-2"
      aria-label="Active filters, transforms and exclusions"
    >
      {filters.map((filter, i) => {
        const label = filterChipLabel(filter)
        return (
          <span key={`filter-${i}`} className={CHIP_CLASS}>
            {label}
            <button
              type="button"
              className={REMOVE_CLASS}
              aria-label={`Remove filter: ${label}`}
              onClick={() => onSetFilters(filters.filter((_, j) => j !== i))}
            >
              <X className="size-2.5" weight="bold" aria-hidden />
            </button>
          </span>
        )
      })}
      {transforms.map((transform, i) => {
        const label = transformChipLabel(transform)
        return (
          <span key={`transform-${i}`} className={CHIP_CLASS}>
            {label}
            <button
              type="button"
              className={REMOVE_CLASS}
              aria-label={`Remove transform: ${label}`}
              onClick={() => onRemoveTransform(i)}
            >
              <X className="size-2.5" weight="bold" aria-hidden />
            </button>
          </span>
        )
      })}
      {exclusions.map((exclusion) => {
        const label = exclusionChipLabel(exclusion)
        return (
          <span key={`exclusion-${exclusion.rowId}`} className={CHIP_CLASS}>
            {label}
            <button
              type="button"
              className={REMOVE_CLASS}
              aria-label={`Restore row: ${label}`}
              onClick={() => onRestoreRow(exclusion.rowId)}
            >
              <X className="size-2.5" weight="bold" aria-hidden />
            </button>
          </span>
        )
      })}
      {showOffers &&
        offers.map((offer) => (
          <button
            key={offer.id}
            type="button"
            className={OFFER_CLASS}
            title={offer.evidence}
            aria-label={`Apply: ${offer.summary}`}
            onClick={() => onAcceptOffer?.(offer)}
          >
            <Plus className="size-3 shrink-0" weight="bold" aria-hidden />
            {offer.summary}
          </button>
        ))}
    </div>
  )
}
