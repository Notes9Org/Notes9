"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import {
  listAnalysesForExperiment,
  listAnalysesForProject,
  type SavedAnalysis,
} from "@/lib/data-analysis/saved-analysis"

/**
 * Saved analyses, wherever the work lives (§3A.5).
 *
 * Until now the only thing an analysis left behind on an experiment was a PNG
 * saved into the data files — an image of a figure, with no spec, no rows, no
 * result and nothing to reopen. This lists the analyses themselves, and each
 * one opens back into the workspace it was made in.
 *
 * Scope comes from RLS, not from this component: `listAnalysesForExperiment`
 * and `listAnalysesForProject` filter on one id and the `analyses_select`
 * policy decides whether the caller may see the row at all. There is nothing to
 * widen here, and nothing to get wrong.
 */
export function SavedAnalysesList({
  experimentId,
  projectId,
  limit = 5,
  emptyText = "No saved analyses yet.",
  className,
}: {
  experimentId?: string
  projectId?: string
  limit?: number
  emptyText?: string
  className?: string
}) {
  const [analyses, setAnalyses] = useState<SavedAnalysis[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = experimentId
      ? listAnalysesForExperiment(experimentId)
      : projectId
        ? listAnalysesForProject(projectId)
        : Promise.resolve<SavedAnalysis[]>([])

    load
      .then((rows) => {
        if (!cancelled) setAnalyses(rows)
      })
      .catch((e: unknown) => {
        // A list that will not load must not take the page with it.
        if (!cancelled) {
          setAnalyses([])
          setError(e instanceof Error ? e.message : "Could not load saved analyses.")
        }
      })

    return () => {
      cancelled = true
    }
  }, [experimentId, projectId])

  if (analyses === null) {
    return <p className={cn("text-[12.5px] text-muted-foreground", className)}>Loading analyses…</p>
  }

  if (error) {
    return <p className={cn("text-[12.5px] text-muted-foreground", className)}>{error}</p>
  }

  if (analyses.length === 0) {
    return <p className={cn("text-[12.5px] text-muted-foreground", className)}>{emptyText}</p>
  }

  return (
    <ul className={cn("space-y-1.5", className)}>
      {analyses.slice(0, limit).map((a) => (
        <li key={a.id} className="min-w-0">
          <Link
            href={`/data-analysis?analysis=${a.id}`}
            className="group flex min-w-0 items-baseline gap-2 text-[12.5px] leading-snug text-foreground/85 underline-offset-2 hover:text-foreground hover:underline"
          >
            <span className="truncate">{a.name}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {a.currentRevisionNo > 0 ? `r${a.currentRevisionNo}` : "draft"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
