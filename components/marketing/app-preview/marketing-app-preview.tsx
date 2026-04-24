"use client"

import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import { MarketingPreviewAppShell, MarketingPreviewCtaRow } from "@/components/marketing/app-preview/preview-app-shell"
import { coerceLegacyNoteBodyToHtml } from "@/lib/marketing/preview-note-content"
import { createInitialSessionFlags } from "@/lib/marketing/preview-workflow"
import { previewReducer } from "./preview-reducer"
import type { PreviewAction } from "./preview-reducer"
import {
  DashboardPanel,
  ExperimentDetailPanel,
  ExperimentsPanel,
  LabNotesPanel,
  LiteraturePanel,
  ProjectDetailPanel,
  ProjectsPanel,
  ResearchMapPanel,
  SamplesPanel,
  StubPanel,
  WritingPanel,
} from "./preview-panels"

const STORAGE_KEY = "notes9_marketing_preview_v1"

type Msg = { role: "user" | "assistant"; text: string }

export function MarketingAppPreview() {
  const [state, dispatch] = useReducer(previewReducer, createInitialSessionFlags())
  const [messages, setMessages] = useState<Msg[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      const init = createInitialSessionFlags()
      const raw = window.sessionStorage.getItem(STORAGE_KEY)
      const p = raw ? (JSON.parse(raw) as { noteTitle?: string; noteBody?: string }) : null
      const rawBody = p?.noteBody ?? ""
      dispatch({
        type: "HYDRATE",
        payload: {
          noteTitle: p?.noteTitle ?? init.noteTitle,
          noteBody: rawBody ? coerceLegacyNoteBodyToHtml(rawBody) : "",
          introAcknowledged: true,
          everDashboard: true,
        },
      })
    } catch {
      // ignore
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ noteTitle: state.noteTitle, noteBody: state.noteBody }),
      )
    } catch {
      // ignore
    }
  }, [state.noteTitle, state.noteBody, hydrated])

  const dispatchWrap = useCallback((a: PreviewAction) => dispatch(a), [dispatch])

  const mainPanel = useMemo(() => {
    const r = state.route
    const d = dispatchWrap
    switch (r) {
      case "dashboard":
        return <DashboardPanel state={state} dispatch={d} />
      case "projects":
        return <ProjectsPanel dispatch={d} />
      case "project":
        return <ProjectDetailPanel dispatch={d} />
      case "experiments":
        return <ExperimentsPanel state={state} dispatch={d} />
      case "experiment":
        return <ExperimentDetailPanel state={state} dispatch={d} />
      case "samples":
        return <SamplesPanel />
      case "lab-notes":
        return <LabNotesPanel state={state} dispatch={d} />
      case "literature":
        return <LiteraturePanel state={state} dispatch={d} />
      case "research-map":
        return <ResearchMapPanel />
      case "writing":
        return <WritingPanel />
      case "equipment":
        return <StubPanel title="Equipment" />
      case "protocols":
        return <StubPanel title="Protocols" />
      case "reports":
        return <StubPanel title="Reports" />
      default:
        return <DashboardPanel state={state} dispatch={d} />
    }
  }, [state, dispatchWrap])

  if (!hydrated) {
    return (
      <div className="flex h-[min(78vh,720px)] min-h-[420px] w-full items-center justify-center rounded-2xl border border-border/50 bg-muted/20" aria-hidden>
        <p className="text-sm text-muted-foreground">Loading preview…</p>
      </div>
    )
  }

  return (
    <div
      // `transform`/`isolate` so `position: fixed` inside `Sidebar` is positioned against this
      // pane, not the viewport (same pattern as a modal; avoids sidebar spanning the whole page).
      className="isolate flex h-[min(78vh,720px)] min-h-[420px] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-background [transform:translateZ(0)] shadow-[0_24px_80px_-32px_rgba(44,36,24,0.2)] dark:shadow-[0_24px_80px_-32px_rgba(0,0,0,0.55)]"
      role="region"
      aria-label="Notes9 interactive preview"
    >
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MarketingPreviewAppShell
          state={state}
          dispatch={dispatch}
          mainPanel={mainPanel}
          messages={messages}
          setMessages={setMessages}
        />
        <MarketingPreviewCtaRow />
      </div>
    </div>
  )
}
