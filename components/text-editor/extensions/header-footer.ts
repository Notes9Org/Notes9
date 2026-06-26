import { Extension, Node, mergeAttributes } from "@tiptap/core"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    headerFooter: {
      toggleDocHeader: () => ReturnType
      toggleDocFooter: () => ReturnType
    }
  }
}

const headerFooterNode = (name: string, klass: string, placeholder: string, inlineStyle: string) =>
  Node.create({
    name,
    group: "block",
    content: "inline*",
    defining: true,
    selectable: false,

    addAttributes() {
      return {
        "data-placeholder": { default: placeholder, rendered: false },
      }
    },

    parseHTML() {
      return [{ tag: `div[data-type="${name}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-type": name,
          class: klass,
          "data-placeholder": placeholder,
          // Inline band styling so the header/footer reads as a distinct region
          // in exports (PDF/HTML/Word) where the editor stylesheet isn't present.
          style: inlineStyle,
        }),
        0,
      ]
    },
  })

/** Document header band, pinned to the top of the note. Theme-safe inline styles
 * (alpha border + opacity, no fixed text colour) so it reads well on screen in
 * light/dark and still carries into exports without the editor stylesheet. */
export const DocHeader = headerFooterNode(
  "docHeader",
  "n9-doc-header",
  "Header — title, author, date…",
  "border-bottom:1px solid rgba(148,163,184,0.5); padding:6px 4px 8px; margin-bottom:14px; font-size:0.9em; opacity:0.85;",
)

/** Document footer band, pinned to the bottom of the note. */
export const DocFooter = headerFooterNode(
  "docFooter",
  "n9-doc-footer",
  "Footer — page number, notes…",
  "border-top:1px solid rgba(148,163,184,0.5); padding:8px 4px 6px; margin-top:14px; font-size:0.9em; opacity:0.85;",
)

/**
 * Commands to add/remove the header and footer bands. They live at the very
 * start/end of the document so they persist with the note and appear in
 * print/PDF export.
 */
export const HeaderFooter = Extension.create({
  name: "headerFooter",
  addCommands() {
    const findNode = (doc: any, typeName: string): { pos: number; size: number } | null => {
      let found: { pos: number; size: number } | null = null
      doc.descendants((node: any, pos: number) => {
        if (node.type.name === typeName) {
          found = { pos, size: node.nodeSize }
          return false
        }
        return true
      })
      return found
    }

    return {
      toggleDocHeader:
        () =>
        ({ state, tr, dispatch, editor }) => {
          const existing = findNode(state.doc, "docHeader")
          if (existing) {
            tr.delete(existing.pos, existing.pos + existing.size)
          } else {
            const node = editor.schema.nodes.docHeader.create()
            tr.insert(0, node)
          }
          if (dispatch) dispatch(tr.scrollIntoView())
          return true
        },
      toggleDocFooter:
        () =>
        ({ state, tr, dispatch, editor }) => {
          const existing = findNode(state.doc, "docFooter")
          if (existing) {
            tr.delete(existing.pos, existing.pos + existing.size)
          } else {
            const node = editor.schema.nodes.docFooter.create()
            tr.insert(state.doc.content.size, node)
          }
          if (dispatch) dispatch(tr.scrollIntoView())
          return true
        },
    }
  },
})

export default HeaderFooter
