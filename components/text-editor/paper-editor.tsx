"use client"

import { TiptapEditor } from "./tiptap-editor"
import "@/styles/paper-numbering.css"

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
  autoSave?: boolean
  onAutoSave?: (content: string) => Promise<void>
  onEditorReady?: (editor: any) => void
  /** HTML content to show as an inline diff widget at the cursor */
  inlineDiffHtml?: string | null
  /** Called when user accepts the inline diff */
  onAcceptInlineDiff?: () => void
  /** Called when user dismisses the inline diff */
  onDismissInlineDiff?: () => void
  /** Inline fullscreen title (when page title is covered) — same pattern as protocol design. */
  onDocumentTitleChange?: (value: string) => void
  onDocumentTitleCommit?: () => void | Promise<void>
}

export function PaperEditor({
  content,
  onChange,
  className,
  editable = true,
  minHeight = "600px",
  title,
  autoSave,
  onAutoSave,
  onEditorReady,
  inlineDiffHtml,
  onAcceptInlineDiff,
  onDismissInlineDiff,
  onDocumentTitleChange,
  onDocumentTitleCommit,
}: PaperEditorProps) {
  const initialContent = content && content.trim().length > 0 ? content : DEFAULT_PAPER_TEMPLATE

  return (
    <TiptapEditor
      content={initialContent}
      onChange={onChange}
      className={className}
      editable={editable}
      minHeight={minHeight}
      showAITools={true}
      showAiWritingToolbarLabel
      enableMath={true}
      paperMode={true}
      fillParentHeight
      title={title}
      onDocumentTitleChange={onDocumentTitleChange}
      onDocumentTitleCommit={onDocumentTitleCommit}
      autoSave={autoSave}
      onAutoSave={onAutoSave}
      onEditorReady={onEditorReady}
      placeholder="Start writing your paper..."
      inlineDiffHtml={inlineDiffHtml}
      onAcceptInlineDiff={onAcceptInlineDiff}
      onDismissInlineDiff={onDismissInlineDiff}
    />
  )
}

export { DEFAULT_PAPER_TEMPLATE }
