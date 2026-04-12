"use client"

import { ContentChangeApprovalBar } from "@/components/content-change-approval-bar"

export interface LabNoteChangeApprovalProps {
  savedContent: string
  draftContent: string
  /** Required for history + diff log; omit while note not yet persisted. */
  noteId: string | null
  onAccept: (newContent: string) => Promise<void>
  onReject: () => void
  isVisible?: boolean
}

export function LabNoteChangeApprovalBar({
  savedContent,
  draftContent,
  noteId,
  onAccept,
  onReject,
  isVisible = true,
}: LabNoteChangeApprovalProps) {
  return (
    <ContentChangeApprovalBar
      variant="lab_note"
      savedContent={savedContent}
      draftContent={draftContent}
      noteId={noteId}
      onAccept={onAccept}
      onReject={onReject}
      isVisible={isVisible}
    />
  )
}
