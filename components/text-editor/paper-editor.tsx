"use client"

import type { ReactNode, RefObject } from "react"
import { TiptapEditor } from "./tiptap-editor"
import "@/styles/paper-numbering.css"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type * as Y from "yjs"

const DEFAULT_PAPER_TEMPLATE = `
<h1>Title</h1>
<p></p>

<h2>Abstract</h2>
<p></p>

<h2>Introduction</h2>
<p></p>

<h2>Literature Review</h2>
<p></p>

<h2>Methodology</h2>
<h3>Study Design</h3>
<p></p>
<h3>Materials</h3>
<p></p>
<h3>Procedures</h3>
<p></p>

<h2>Results</h2>
<p></p>

<h2>Discussion</h2>
<p></p>

<h2>Conclusion</h2>
<p></p>

<h2>Acknowledgements</h2>
<p></p>

<h2>References</h2>
<p></p>
`.trim()

interface PaperEditorProps {
  content?: string
  onChange?: (content: string) => void
  className?: string
  editable?: boolean
  minHeight?: string
  title?: string
  onEditorReady?: (editor: any) => void
  /** HTML content to show as an inline diff widget at the cursor */
  inlineDiffHtml?: string | null
  /** Called when user accepts the inline diff */
  onAcceptInlineDiff?: () => void
  /** Called when user dismisses the inline diff */
  onDismissInlineDiff?: () => void
  /** Inline fullscreen title (when page title is covered), same pattern as protocol design. */
  onDocumentTitleChange?: (value: string) => void
  onDocumentTitleCommit?: () => void | Promise<void>
  /** Yjs document instance for collaborative editing */
  ydoc?: Y.Doc | null
  /** Hocuspocus provider instance for WebSocket sync */
  provider?: HocuspocusProvider | null
  /** Whether collaboration mode is active */
  collaborationEnabled?: boolean
  /** Display name for the local user's cursor */
  userName?: string
  /** Color for the local user's cursor */
  userColor?: string
  /** Wrapping element (list + editor) that editor fullscreen should expand. */
  fullscreenWorkspaceRef?: RefObject<HTMLElement | null>
  /** Prepended to the editor toolbar (e.g. the list-sidebar toggle), stays
   *  visible in fullscreen since it lives in the editor's own toolbar. */
  leadingToolbarSlot?: ReactNode
  /** Appended after the fullscreen control (doc actions), same as lab notes/protocols. */
  trailingToolbarSlot?: ReactNode
  /** Fires when editor region fullscreen is toggled (Esc or button). */
  onEditorFullscreenChange?: (open: boolean) => void
  /** @-mention candidates, forwarded to the editor (which adds the type discriminant). */
  protocols?: { id: string; name: string; version?: string | null }[]
  samples?: { id: string; name: string; sample_code?: string | null }[]
}

export function PaperEditor({
  content,
  onChange,
  className,
  editable = true,
  minHeight = "600px",
  title,
  onEditorReady,
  inlineDiffHtml,
  onAcceptInlineDiff,
  onDismissInlineDiff,
  onDocumentTitleChange,
  onDocumentTitleCommit,
  ydoc,
  provider,
  collaborationEnabled,
  userName,
  userColor,
  fullscreenWorkspaceRef,
  leadingToolbarSlot,
  trailingToolbarSlot,
  onEditorFullscreenChange,
  protocols,
  samples,
}: PaperEditorProps) {
  const initialContent = collaborationEnabled
    ? undefined
    : (content && content.trim().length > 0 ? content : DEFAULT_PAPER_TEMPLATE)

  return (
    <TiptapEditor
      content={initialContent}
      fullscreenWorkspaceRef={fullscreenWorkspaceRef}
      leadingToolbarSlot={leadingToolbarSlot}
      trailingToolbarSlot={trailingToolbarSlot}
      onEditorFullscreenChange={onEditorFullscreenChange}
      protocols={protocols}
      samples={samples}
      onChange={onChange}
      className={className}
      editable={editable}
      minHeight={minHeight}
      showCitationTools
      enableMath={true}
      paperMode={true}
      fillParentHeight
      title={title}
      onDocumentTitleChange={onDocumentTitleChange}
      onDocumentTitleCommit={onDocumentTitleCommit}
      onEditorReady={onEditorReady}
      placeholder="Write your paper here... Use @ to tag protocols or samples"
      inlineDiffHtml={inlineDiffHtml}
      onAcceptInlineDiff={onAcceptInlineDiff}
      onDismissInlineDiff={onDismissInlineDiff}
      ydoc={ydoc}
      provider={provider}
      collaborationEnabled={collaborationEnabled}
      userName={userName}
      userColor={userColor}
    />
  )
}

export { DEFAULT_PAPER_TEMPLATE }
