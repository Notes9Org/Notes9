"use client"

import { useState } from "react"
import { NotebookPen } from "lucide-react"

import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SaveStatusIndicator } from "@/components/ui/save-status"
import { PREVIEW_HERO_EXPERIMENT } from "@/lib/marketing/preview-mock-data"
import type { PreviewSessionFlags } from "@/lib/marketing/preview-workflow"

import type { PreviewAction } from "./preview-reducer"

/**
 * Marketing preview: same Tiptap shell as experiment → Lab notes (toolbar, scroll, @ protocols).
 * AI Cite / bibliography is off to avoid real API calls; the right rail holds the preview assistant.
 */
export function PreviewLabNotesEditor({
  state,
  dispatch,
}: {
  state: PreviewSessionFlags
  dispatch: (a: PreviewAction) => void
}) {
  const [lastTouched, setLastTouched] = useState<Date | null>(null)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Same TipTap editor as the workspace. Sample context: {PREVIEW_HERO_EXPERIMENT}. Use the assistant on the right for
        limited preview actions.
      </p>
      <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="shrink-0 space-y-0 border-b border-border/50 px-4 pb-3 pt-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <NotebookPen className="size-5 shrink-0 text-primary" aria-hidden />
              <Input
                value={state.noteTitle}
                onChange={(e) => dispatch({ type: "SET_NOTE", title: e.target.value })}
                className="h-10 min-w-0 border-none bg-transparent px-0 text-lg font-semibold leading-none text-foreground shadow-none focus-visible:ring-0"
                placeholder="Note title"
                aria-label="Note title"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary" className="text-[10px] font-medium">
                Preview session
              </Badge>
              <SaveStatusIndicator
                status="saved"
                lastSaved={lastTouched}
                variant="icon"
                disabled
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
          <div className="flex min-h-[min(48vh,480px)] flex-1 flex-col">
            <TiptapEditor
              content={state.noteBody}
              onChange={(html) => {
                dispatch({ type: "SET_NOTE", body: html })
                setLastTouched(new Date())
              }}
              placeholder="Write your lab notes here... Use @ to tag protocols"
              title={state.noteTitle || "Lab note"}
              minHeight="100%"
              fillParentHeight
              className="min-h-0 flex-1 !rounded-md !border-0 !bg-transparent !shadow-none"
              showAITools={false}
              showAiWritingDropdown={false}
              enableMath
              protocols={[{ id: "preview-proto-1", name: "Cardiac cell assay", version: "2.1" }]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
