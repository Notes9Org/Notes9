"use client"

import { ContentChangeApprovalBar } from "@/components/content-change-approval-bar"

export interface ProtocolChangeApprovalProps {
  savedContent: string
  draftContent: string
  protocolId: string
  currentVersion: string
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
      onAccept={onAccept}
      onReject={onReject}
      isVisible={isVisible}
      extraDirty={extraDirty}
    />
  )
}
