"use client"

import { ContentChangeApprovalBar } from "@/components/content-change-approval-bar"

export interface ProtocolChangeApprovalProps {
  savedContent: string
  draftContent: string
  protocolId: string
  currentVersion: string
  /** Protocol name — enriches stored structure hints like lab note change history. */
  documentTitle?: string | null
  onAccept: (newContent: string, newVersion: string) => Promise<void>
  onReject: () => void
  /** @deprecated Kept for compatibility; the bar stays mounted — use draft vs saved only. */
  isVisible?: boolean
  extraDirty?: boolean
}

export function ProtocolChangeApprovalBar({
  savedContent,
  draftContent,
  protocolId,
  currentVersion,
  documentTitle,
  onAccept,
  onReject,
  isVisible = true,
  extraDirty = false,
}: ProtocolChangeApprovalProps) {
  return (
    <ContentChangeApprovalBar
      variant="protocol"
      savedContent={savedContent}
      draftContent={draftContent}
      protocolId={protocolId}
      currentVersion={currentVersion}
      documentTitle={documentTitle}
      onAccept={onAccept}
      onReject={onReject}
      isVisible={isVisible}
      extraDirty={extraDirty}
    />
  )
}
