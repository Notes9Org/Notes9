import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import type { Node as PMNode } from "@tiptap/pm/model"
import { loadSpeller, isWordIgnored, type Speller } from "@/lib/spellcheck"
import { checkGrammar } from "@/lib/grammar"

// Grammarly-style live proofreading: misspelled words get a red wavy underline,
// grammar/usage/structure issues get an orange one. Both run fully offline and
// are recomputed (debounced) as the document changes; the right-click menu turns
// an underline into a concrete fix.

export const proofreadPluginKey = new PluginKey<DecorationSet>("n9-proofread")

// Word tokens (with their offset in `text`), skipping numbers and 1-char tokens.
function* words(text: string): Generator<{ word: string; index: number }> {
  const re = /[A-Za-zÀ-ɏ’']+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const raw = m[0]
    const lead = raw.length - raw.replace(/^[’']+/, "").length
    const word = raw.replace(/^[’']+|[’']+$/g, "")
    if (word.length >= 2 && !/\d/.test(word)) {
      yield { word, index: m.index + lead }
    }
  }
}

async function computeDecorations(doc: PMNode, speller: Speller | null): Promise<Decoration[]> {
  const spellDecos: Decoration[] = []
  const grammarJobs: Array<Promise<Decoration[]>> = []

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return
    const text = node.textContent
    if (!text || !text.trim()) return
    // Skip code blocks — spelling/grammar rules don't apply to code.
    if (node.type.name === "codeBlock" || node.type.name === "code_block") return
    const base = pos + 1 // content start of the textblock

    if (speller) {
      for (const { word, index } of words(text)) {
        if (isWordIgnored(word) || speller.correct(word)) continue
        const from = base + index
        spellDecos.push(Decoration.inline(from, from + word.length, { class: "n9-spell-underline" }))
      }
    }

    grammarJobs.push(
      checkGrammar(text).then((issues) =>
        issues.map((g) =>
          Decoration.inline(base + g.start, base + g.end, {
            class: "n9-grammar-underline",
            title: g.reason,
          }),
        ),
      ),
    )
  })

  const grammarDecos = (await Promise.all(grammarJobs)).flat()
  return [...spellDecos, ...grammarDecos]
}

export const ProofreadExtension = Extension.create({
  name: "n9Proofread",

  addProseMirrorPlugins() {
    let debounce: ReturnType<typeof setTimeout> | null = null
    let speller: Speller | null = null
    let loadedSpeller = false
    let running = false
    let rerun = false

    const schedule = (view: EditorView, delay: number) => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => void run(view), delay)
    }

    async function run(view: EditorView) {
      if (running) {
        rerun = true
        return
      }
      running = true
      try {
        if (!loadedSpeller) {
          speller = await loadSpeller()
          loadedSpeller = true
        }
        const doc = view.state.doc
        const decos = await computeDecorations(doc, speller)
        // Apply only if the document hasn't changed while we were computing;
        // otherwise recompute against the newer document.
        if (view.state.doc === doc) {
          view.dispatch(view.state.tr.setMeta(proofreadPluginKey, DecorationSet.create(view.state.doc, decos)))
        } else {
          rerun = true
        }
      } catch (e) {
        console.warn("Proofread pass failed:", e)
      } finally {
        running = false
        if (rerun) {
          rerun = false
          schedule(view, 250)
        }
      }
    }

    return [
      new Plugin<DecorationSet>({
        key: proofreadPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(proofreadPluginKey)
            if (meta instanceof DecorationSet) return meta
            // Keep decorations aligned with edits until the next pass lands.
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return proofreadPluginKey.getState(state)
          },
        },
        view(view) {
          schedule(view, 500) // initial pass once mounted
          return {
            update(v, prev) {
              if (!v.state.doc.eq(prev.doc)) schedule(v, 700)
            },
            destroy() {
              if (debounce) clearTimeout(debounce)
            },
          }
        },
      }),
    ]
  },
})
