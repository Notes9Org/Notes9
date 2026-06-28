import { TextSelection } from "@tiptap/pm/state"
import type { Editor } from "@tiptap/react"

/**
 * Move the top-level block that currently contains the selection up or down by
 * one position. Reliable, keyboard/click-friendly alternative to drag-and-drop
 * for repositioning tables, images, equations and paragraphs.
 */
export function moveTopLevelBlock(editor: Editor | null | undefined, dir: -1 | 1): boolean {
  if (!editor) return false
  const { state, view } = editor
  const index = state.selection.$from.index(0)
  const doc = state.doc
  const target = index + dir
  if (target < 0 || target >= doc.childCount) return false
  const node = doc.child(index)
  let start = 0
  for (let i = 0; i < index; i++) start += doc.child(i).nodeSize
  const end = start + node.nodeSize
  let tr = state.tr.delete(start, end)
  let insertPos: number
  if (dir < 0) {
    let s = 0
    for (let i = 0; i < index - 1; i++) s += doc.child(i).nodeSize
    insertPos = s
  } else {
    const next = doc.child(index + 1)
    insertPos = start + next.nodeSize
  }
  tr = tr.insert(insertPos, node)
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(insertPos + 1, tr.doc.content.size))))
  view.dispatch(tr.scrollIntoView())
  view.focus()
  return true
}
