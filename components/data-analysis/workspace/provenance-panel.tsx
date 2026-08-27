"use client"

import { X, User } from "@phosphor-icons/react/ssr"
import { FlareIcon } from "@/components/ui/flare-icon"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import type { AppliedMutation } from "@/lib/data-analysis/spec/mutations"
import {
  buildProvenanceCard,
  type EditAuditRecord,
  type ProvenanceEntry,
} from "@/lib/data-analysis/provenance"
import { EASE_OUT, SlideOver } from "./motion"

/**
 * The provenance card (§10.5): "always one click away from any figure, source,
 * version, exclusions with reasons, transforms, test and options, engine
 * version, edit history."
 *
 * Presented as a slide-over rather than a modal because it is a reference
 * surface: the researcher reads it while looking at the figure, and a modal
 * would hide the thing being explained.
 *
 * The sections stagger in by 24ms each. That is slow enough to read as
 * deliberate and fast enough that the whole panel has settled before the eye
 * reaches the bottom.
 */

function Section({
  title,
  entries,
  index,
}: {
  title: string
  entries: ProvenanceEntry[]
  index: number
}) {
  const reduce = useReducedMotion()
  if (entries.length === 0) return null
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE_OUT, delay: index * 0.024 }}
      className="border-b border-border/50 px-5 py-4 last:border-0"
    >
      <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      <dl className="mt-2.5 grid gap-1.5">
        {entries.map((e) => (
          <div key={`${e.label}-${e.value}`} className="grid grid-cols-[9rem_1fr] items-start gap-3">
            <dt className="text-[12.5px] text-muted-foreground">{e.label}</dt>
            <dd
              className={cn(
                "min-w-0 break-words text-[12.5px]",
                e.emphasis ? "font-medium text-amber-700 dark:text-amber-400" : "text-foreground/85"
              )}
            >
              {e.value}
            </dd>
          </div>
        ))}
      </dl>
    </motion.section>
  )
}

export function ProvenancePanel({
  open,
  onClose,
  spec,
  result,
  history,
  auditLog,
  revisionNo,
  isFrozen,
  sourceDetached,
  author,
  savedAt,
}: {
  open: boolean
  onClose: () => void
  spec: AnalysisSpec
  result: EngineResult | null
  /** Legacy: the edits with no reverted flag. Prefer `auditLog`. */
  history?: AppliedMutation[]
  /** The append-only audit log, live or read back off the revision. */
  auditLog?: EditAuditRecord[]
  revisionNo?: number
  isFrozen?: boolean
  sourceDetached?: boolean
  /** From the revision row, so who/when survives a reload (L8). */
  author?: { id: string | null; label?: string | null } | null
  savedAt?: string | null
}) {
  const card = buildProvenanceCard(spec, result, {
    history,
    auditLog,
    revisionNo,
    isFrozen,
    sourceDetached,
    author,
    savedAt,
  })

  return (
    <SlideOver open={open} onClose={onClose} labelledBy="provenance-title">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 id="provenance-title" className="text-[14px] font-semibold text-foreground">
            Provenance
          </h2>
          <p className="text-[12px] text-muted-foreground">
            How this figure was made, and from what.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close provenance"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Source" entries={card.source} index={0} />
        <Section title="Data" entries={card.data} index={1} />
        <Section title="Analysis" entries={card.analysis} index={2} />

        {card.exclusions.count > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT, delay: 0.072 }}
            className="border-b border-border/50 px-5 py-4"
          >
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Exclusions ({card.exclusions.count})
            </h3>
            <ul className="mt-2.5 grid gap-2">
              {card.exclusions.rows.map((row) => (
                <li
                  key={row.rowId}
                  className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2"
                >
                  <p className="text-[12.5px] font-medium text-foreground">Row {row.rowId}</p>
                  <p className="mt-0.5 text-[12.5px] text-foreground/80">{row.reason}</p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    {row.by} · {new Date(row.at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        <Section title="Engine" entries={card.engine} index={4} />

        {card.history.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT, delay: 0.12 }}
            className="px-5 py-4"
          >
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Edit history
            </h3>
            {/* Readable descriptions, not timestamps (§3A.4). The origin icon
                distinguishes what the researcher did from what the assistant
                proposed, which is part of the record. */}
            <ol className="mt-2.5 grid gap-1.5">
              {[...card.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex items-start gap-2">
                  {h.origin === "ai" ? (
                    <FlareIcon
                      className="mt-0.5 size-3 shrink-0 text-[var(--n9-accent)]"
                      weight="fill"
                    />
                  ) : (
                    <User className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    {/* A reverted edit stays on the card, struck through and
                        labelled. Removing it would make the history read
                        tidier than it was, and "we tried this and took it
                        back" is a fact a reviewer is entitled to. */}
                    <span
                      className={cn(
                        "block text-[12.5px] leading-snug",
                        h.reverted
                          ? "text-muted-foreground line-through decoration-muted-foreground/50"
                          : "text-foreground/85"
                      )}
                    >
                      {h.description}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {new Date(h.at).toLocaleTimeString()}
                      {h.reverted && (
                        <span className="ml-1.5 rounded border border-border px-1 py-px text-[10px] uppercase tracking-wide">
                          reverted
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </motion.section>
        )}
      </div>
    </SlideOver>
  )
}
