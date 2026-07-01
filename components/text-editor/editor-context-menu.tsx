"use client"

import { useCallback, useState, type ReactNode } from "react"
import type { Editor } from "@tiptap/react"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuShortcut,
} from "@/components/ui/context-menu"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Scissors,
  Copy,
  ClipboardPaste,
  Link2,
  ImagePlus,
  Table as TableIcon,
  Sigma,
  ArrowUp,
  ArrowDown,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  WrapText,
  Quote,
  MessageSquarePlus,
} from "lucide-react"
import { moveTopLevelBlock } from "./editor-block-utils"

export type EditorContextMenuActions = {
  insertLink?: () => void
  insertImage?: () => void
  insertTable?: () => void
  insertEquation?: () => void
  citeFromRepository?: () => void
  addComment?: () => void
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? "⌘" : "Ctrl"

/**
 * Word-style right-click menu for the editor. Wraps the editor content and shows
 * context-aware actions: clipboard + basic formatting always, table tools while
 * inside a table, image tools while an image is selected.
 */
export function EditorContextMenu({
  editor,
  actions,
  children,
}: {
  editor: Editor | null
  actions?: EditorContextMenuActions
  children: ReactNode
}) {
  const [flags, setFlags] = useState({ inTable: false, onImage: false, hasSelection: false })

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!editor) return
      const view = editor.view
      const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (coords) {
        const { state } = view
        const insidePos = coords.inside
        const node = insidePos >= 0 ? state.doc.nodeAt(insidePos) : null
        try {
          if (node && node.type.name === "image" && insidePos >= 0) {
            // Right-clicking an image selects it so image actions apply.
            view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, insidePos)))
          } else if (state.selection.empty) {
            // Otherwise drop the caret where the user clicked for accurate context.
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, coords.pos)))
          }
        } catch {
          /* selection sync is best-effort */
        }
      }
      setFlags({
        inTable: editor.isActive("table"),
        onImage: editor.isActive("image"),
        hasSelection: !editor.state.selection.empty,
      })
    },
    [editor],
  )

  if (!editor) return <>{children}</>

  const copy = () => document.execCommand("copy")
  const cut = () => document.execCommand("cut")
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) editor.chain().focus().insertContent(text).run()
    } catch {
      /* clipboard read may be blocked; ignore */
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div onContextMenu={onContextMenu}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem disabled={!flags.hasSelection} onSelect={cut}>
          <Scissors className="mr-2 h-4 w-4" /> Cut
          <ContextMenuShortcut>{mod}+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!flags.hasSelection} onSelect={copy}>
          <Copy className="mr-2 h-4 w-4" /> Copy
          <ContextMenuShortcut>{mod}+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void paste()}>
          <ClipboardPaste className="mr-2 h-4 w-4" /> Paste
          <ContextMenuShortcut>{mod}+V</ContextMenuShortcut>
        </ContextMenuItem>

        {flags.onImage ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">Image</ContextMenuLabel>
            <ContextMenuItem onSelect={() => editor.chain().focus().setImageAlign("left").run()}>
              <AlignLeft className="mr-2 h-4 w-4" /> Align left
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().setImageAlign("center").run()}>
              <AlignCenter className="mr-2 h-4 w-4" /> Align center
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().setImageAlign("right").run()}>
              <AlignRight className="mr-2 h-4 w-4" /> Align right
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().setImageFloat("left").run()}>
              <WrapText className="mr-2 h-4 w-4" /> Wrap text left
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().setImageFloat("right").run()}>
              <WrapText className="mr-2 h-4 w-4 -scale-x-100" /> Wrap text right
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().deleteSelection().run()} variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete image
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="mr-2 h-4 w-4" /> Bold
              <ContextMenuShortcut>{mod}+B</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="mr-2 h-4 w-4" /> Italic
              <ContextMenuShortcut>{mod}+I</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().toggleUnderline().run()}>
              <UnderlineIcon className="mr-2 h-4 w-4" /> Underline
              <ContextMenuShortcut>{mod}+U</ContextMenuShortcut>
            </ContextMenuItem>
            {actions?.insertLink ? (
              <ContextMenuItem onSelect={actions.insertLink}>
                <Link2 className="mr-2 h-4 w-4" /> Link…
              </ContextMenuItem>
            ) : null}
          </>
        )}

        {(actions?.addComment || actions?.citeFromRepository) && (
          <>
            <ContextMenuSeparator />
            {actions?.addComment ? (
              <ContextMenuItem onSelect={actions.addComment}>
                <MessageSquarePlus className="mr-2 h-4 w-4" /> Add comment
              </ContextMenuItem>
            ) : null}
            {actions?.citeFromRepository ? (
              <ContextMenuItem onSelect={actions.citeFromRepository}>
                <Quote className="mr-2 h-4 w-4" /> Cite from repository
              </ContextMenuItem>
            ) : null}
          </>
        )}

        {flags.inTable ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">Table</ContextMenuLabel>
            <ContextMenuItem onSelect={() => editor.chain().focus().addRowAfter().run()}>Insert row below</ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().addColumnAfter().run()}>Insert column right</ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().deleteRow().run()}>Delete row</ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().deleteColumn().run()}>Delete column</ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().deleteTable().run()} variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete table
            </ContextMenuItem>
          </>
        ) : null}

        <ContextMenuSeparator />
        <ContextMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">Move</ContextMenuLabel>
        <ContextMenuItem onSelect={() => moveTopLevelBlock(editor, -1)}>
          <ArrowUp className="mr-2 h-4 w-4" /> Move block up
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => moveTopLevelBlock(editor, 1)}>
          <ArrowDown className="mr-2 h-4 w-4" /> Move block down
        </ContextMenuItem>

        {actions?.insertImage || actions?.insertTable || actions?.insertEquation ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">Insert</ContextMenuLabel>
            {actions?.insertImage ? (
              <ContextMenuItem onSelect={actions.insertImage}>
                <ImagePlus className="mr-2 h-4 w-4" /> Image…
              </ContextMenuItem>
            ) : null}
            {actions?.insertTable ? (
              <ContextMenuItem onSelect={actions.insertTable}>
                <TableIcon className="mr-2 h-4 w-4" /> Table
              </ContextMenuItem>
            ) : null}
            {actions?.insertEquation ? (
              <ContextMenuItem onSelect={actions.insertEquation}>
                <Sigma className="mr-2 h-4 w-4" /> Equation…
              </ContextMenuItem>
            ) : null}
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
