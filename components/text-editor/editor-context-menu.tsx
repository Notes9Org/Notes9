"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import type { Editor } from "@tiptap/react"
import { NodeSelection, TextSelection, type EditorState } from "@tiptap/pm/state"
import { loadSpeller, ignoreWord, isWordIgnored, type Speller } from "@/lib/spellcheck"
import { checkGrammar, warmGrammar } from "@/lib/grammar"
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
  SpellCheck,
  Plus,
  Wand2,
  PenLine,
} from "lucide-react"
import { moveTopLevelBlock } from "./editor-block-utils"

/**
 * Best-effort word (+ its document range) under a click position, used to offer
 * spelling corrections. Exact for plain prose; inline atoms may shift it, so it
 * is treated as advisory only.
 */
function wordAtPos(
  state: EditorState,
  pos: number,
): { word: string; from: number; to: number } | null {
  try {
    const $pos = state.doc.resolve(pos)
    if (!$pos.parent.isTextblock) return null
    const text = $pos.parent.textContent
    if (!text) return null
    const start = $pos.start()
    let offset = pos - start
    if (offset < 0) offset = 0
    if (offset > text.length) offset = text.length
    const isWord = (c: string | undefined) => !!c && /[A-Za-zÀ-ɏ'’]/.test(c)
    let a = offset
    let b = offset
    while (a > 0 && isWord(text[a - 1])) a--
    while (b < text.length && isWord(text[b])) b++
    if (a >= b) return null
    const word = text.slice(a, b).replace(/^['’]+|['’]+$/g, "")
    if (word.length < 2 || /\d/.test(word)) return null
    return { word, from: start + a, to: start + b }
  } catch {
    return null
  }
}

/**
 * The textblock (paragraph) under a position + its document start offset, so
 * grammar-issue character offsets can be mapped back to document positions.
 */
function paragraphAtPos(
  state: EditorState,
  pos: number,
): { text: string; start: number } | null {
  try {
    const $pos = state.doc.resolve(pos)
    if (!$pos.parent.isTextblock) return null
    const text = $pos.parent.textContent
    if (!text || !text.trim()) return null
    return { text, start: $pos.start() }
  } catch {
    return null
  }
}

type GrammarMenuIssue = { reason: string; from: number; to: number; expected: string[]; fixable: boolean }

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
  const [spell, setSpell] = useState<{ word: string; from: number; to: number; suggestions: string[] } | null>(null)
  const [grammar, setGrammar] = useState<GrammarMenuIssue[] | null>(null)
  const spellerRef = useRef<Speller | null>(null)

  // Warm the dictionary + grammar engines up front so right-click checks are instant.
  useEffect(() => {
    let alive = true
    void loadSpeller().then((s) => {
      if (alive) spellerRef.current = s
    })
    warmGrammar()
    return () => {
      alive = false
    }
  }, [])

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

      // Spelling (word under cursor) + grammar (paragraph under cursor) — only
      // when nothing is selected (a selection means the user wants the actions menu).
      if (coords && editor.state.selection.empty && !editor.isActive("image")) {
        const hit = wordAtPos(editor.state, coords.pos)
        if (hit) {
          const apply = (sp: Speller | null) => {
            if (!sp || isWordIgnored(hit.word) || sp.correct(hit.word)) {
              setSpell(null)
              return
            }
            setSpell({ ...hit, suggestions: sp.suggest(hit.word).slice(0, 7) })
          }
          if (spellerRef.current) apply(spellerRef.current)
          else void loadSpeller().then(apply)
        } else {
          setSpell(null)
        }

        const para = paragraphAtPos(editor.state, coords.pos)
        if (para) {
          void checkGrammar(para.text).then((found) => {
            setGrammar(
              found.length === 0
                ? null
                : found.slice(0, 6).map((g) => ({
                    reason: g.reason,
                    from: para.start + g.start,
                    to: para.start + g.end,
                    expected: g.expected,
                    fixable: g.fixable,
                  })),
            )
          })
        } else {
          setGrammar(null)
        }
      } else {
        setSpell(null)
        setGrammar(null)
      }
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
        {spell && (
          <>
            <ContextMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">Spelling</ContextMenuLabel>
            {spell.suggestions.length > 0 ? (
              spell.suggestions.map((s) => (
                <ContextMenuItem
                  key={s}
                  onSelect={() => editor.chain().focus().insertContentAt({ from: spell.from, to: spell.to }, s).run()}
                >
                  <SpellCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{s}</span>
                </ContextMenuItem>
              ))
            ) : (
              <ContextMenuItem disabled>
                <SpellCheck className="mr-2 h-4 w-4" /> No suggestions
              </ContextMenuItem>
            )}
            <ContextMenuItem onSelect={() => { ignoreWord(spell.word); setSpell(null) }}>
              <Plus className="mr-2 h-4 w-4" /> Ignore “{spell.word}”
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {grammar && grammar.length > 0 && (
          <>
            <ContextMenuLabel className="text-2xs uppercase tracking-wide text-muted-foreground">Grammar</ContextMenuLabel>
            {grammar.map((g, i) =>
              g.fixable ? (
                <ContextMenuItem
                  key={i}
                  className="items-start gap-2"
                  onSelect={() => editor.chain().focus().insertContentAt({ from: g.from, to: g.to }, g.expected[0]).run()}
                >
                  <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span className="min-w-0 whitespace-normal text-xs leading-snug">{g.reason}</span>
                </ContextMenuItem>
              ) : (
                <ContextMenuItem key={i} disabled className="items-start gap-2">
                  <PenLine className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 whitespace-normal text-xs leading-snug">{g.reason}</span>
                </ContextMenuItem>
              ),
            )}
            <ContextMenuSeparator />
          </>
        )}
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
