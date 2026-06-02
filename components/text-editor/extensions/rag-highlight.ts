import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { fuzzyFindExcerpt } from '@/lib/fuzzy-text-match'

export interface RagHighlightOptions {
  types: string[]
}

const ragHighlightKey = new PluginKey('ragHighlight')

/** Advisory char offsets (into the stripped source text) for the supporting
 * span. A precision bonus over the fuzzy `excerpt` match — only used when the
 * offsets map cleanly onto the live editor text. */
export interface RagHighlightCharRange {
  start: number
  end: number
}

interface RagHighlightState {
  excerpt: string | null
  decorations: DecorationSet
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ragHighlight: {
      setRagHighlight: (excerpt: string, charRange?: RagHighlightCharRange | null) => ReturnType
      clearRagHighlight: () => ReturnType
    }
  }
}

/**
 * TipTap extension that temporarily highlights a RAG chunk excerpt inside the
 * editor. Activated via `editor.commands.setRagHighlight(excerpt)` and cleared
 * via `editor.commands.clearRagHighlight()`.
 */
export const RagHighlight = Extension.create<RagHighlightOptions>({
  name: 'ragHighlight',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'tableCell', 'listItem', 'blockquote', 'codeBlock'],
    }
  },

  addCommands() {
    return {
      setRagHighlight:
        (excerpt: string, charRange?: RagHighlightCharRange | null) =>
        ({ tr, dispatch }: { tr: Transaction; dispatch?: (tr: Transaction) => void }) => {
          if (dispatch) {
            tr.setMeta(ragHighlightKey, { action: 'set', excerpt, charRange: charRange ?? null })
          }
          return true
        },
      clearRagHighlight:
        () =>
        ({ tr, dispatch }: { tr: Transaction; dispatch?: (tr: Transaction) => void }) => {
          if (dispatch) {
            tr.setMeta(ragHighlightKey, { action: 'clear' })
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<RagHighlightState>({
        key: ragHighlightKey,
        state: {
          init(): RagHighlightState {
            return { excerpt: null, decorations: DecorationSet.empty }
          },
          apply(tr, prev): RagHighlightState {
            const meta = tr.getMeta(ragHighlightKey) as
              | { action: 'set'; excerpt: string; charRange?: RagHighlightCharRange | null }
              | { action: 'clear' }
              | undefined

            if (meta?.action === 'clear') {
              return { excerpt: null, decorations: DecorationSet.empty }
            }

            if (meta?.action === 'set') {
              const excerpt = meta.excerpt
              const doc = tr.doc

              // Collect all text nodes with their document positions
              const textParts: { text: string; from: number }[] = []
              doc.descendants((node, pos) => {
                if (node.isText && node.text) {
                  textParts.push({ text: node.text, from: pos })
                }
              })

              if (textParts.length === 0) {
                return { excerpt, decorations: DecorationSet.empty }
              }

              // Build a flat char→docPos map across ALL text nodes (with a separator
              // space between nodes so that text across paragraphs stays searchable).
              let fullText = ''
              const posMap: Array<{ docPos: number } | null> = []

              for (const part of textParts) {
                if (fullText.length > 0) {
                  // Separator: not mapped to any real position
                  posMap.push(null)
                  fullText += ' '
                }
                for (let i = 0; i < part.text.length; i++) {
                  posMap.push({ docPos: part.from + i })
                }
                fullText += part.text
              }

              // PRIMARY path: fuzzy-match the excerpt (which prefers the exact
              // per-claim cited_text) against the live editor text. The backend
              // char offsets are into a DIFFERENT string (its own stripped
              // plaintext: different stripping, different node-boundary spaces),
              // so applying them as ProseMirror positions can land on the wrong
              // span. Fuzzy search on the real editor text is the reliable path.
              let match: { start: number; end: number } | null = null
              const charRange = meta.charRange
              if (
                charRange &&
                charRange.start >= 0 &&
                charRange.end > charRange.start &&
                charRange.end <= fullText.length
              ) {
                const slice = fullText.slice(charRange.start, charRange.end)
                // Only trust the raw offsets when the text at those positions
                // STRONGLY corroborates the excerpt (≥0.65). A weak overlap is
                // not enough to risk a confidently-wrong highlight — anything
                // below the bar falls through to the full-document fuzzy search.
                const corroboration = fuzzyFindExcerpt(slice, excerpt, { threshold: 0.65 })
                if (corroboration) {
                  match = { start: charRange.start, end: charRange.end }
                }
              }

              if (!match) {
                // Fall back to (or use as primary) the full-document fuzzy search.
                // Never highlight the raw offsets when they failed to corroborate.
                match = fuzzyFindExcerpt(fullText, excerpt, { threshold: 0.3 })
              }
              if (!match) {
                return { excerpt, decorations: DecorationSet.empty }
              }

              // Resolve the matched range to real document positions, skipping
              // separator slots (null entries).
              const realPositions: number[] = []
              for (let ci = match.start; ci < match.end && ci < posMap.length; ci++) {
                const entry = posMap[ci]
                if (entry) realPositions.push(entry.docPos)
              }
              if (realPositions.length === 0) {
                return { excerpt, decorations: DecorationSet.empty }
              }

              const rangeFrom = realPositions[0]
              const rangeTo = realPositions[realPositions.length - 1] + 1

              // Create one Decoration.inline per text node that overlaps the range.
              // A single decoration spanning block boundaries is not supported by
              // ProseMirror, so we must split per text-node run.
              const decs: Decoration[] = []
              for (const part of textParts) {
                const nodeFrom = part.from
                const nodeTo = part.from + part.text.length
                if (nodeTo <= rangeFrom || nodeFrom >= rangeTo) continue
                const decFrom = Math.max(nodeFrom, rangeFrom)
                const decTo = Math.min(nodeTo, rangeTo)
                if (decFrom < decTo) {
                  decs.push(
                    Decoration.inline(decFrom, decTo, {
                      class: 'rag-chunk-highlight',
                      'data-rag-highlight': 'true',
                    }),
                  )
                }
              }

              if (decs.length === 0) {
                return { excerpt, decorations: DecorationSet.empty }
              }

              return {
                excerpt,
                decorations: DecorationSet.create(doc, decs),
              }
            }

            if (prev.decorations !== DecorationSet.empty && tr.docChanged) {
              return {
                ...prev,
                decorations: prev.decorations.map(tr.mapping, tr.doc),
              }
            }

            return prev
          },
        },
        props: {
          decorations(state) {
            return ragHighlightKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
