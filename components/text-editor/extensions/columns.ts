import { Node } from "@tiptap/core"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columns: {
      /** Wrap the current block(s) in a multi-column container. */
      setColumns: (count: number) => ReturnType
      /** Change the column count of the surrounding container. */
      setColumnCount: (count: number) => ReturnType
      /** Unwrap the surrounding column container back to a single column. */
      unsetColumns: () => ReturnType
    }
  }
}

/**
 * Word-style text columns. A block container that flows its children across N
 * CSS columns. Uses CSS multi-column so text balances automatically and prints
 * correctly, while remaining a single editable region.
 */
export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (element) => {
          const n = Number.parseInt(element.getAttribute("data-count") || "2", 10)
          return Number.isFinite(n) && n >= 1 && n <= 4 ? n : 2
        },
        renderHTML: (attributes) => ({
          "data-count": String(attributes.count ?? 2),
          style: `column-count: ${attributes.count ?? 2}; column-gap: 2rem;`,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-type": "columns", class: "n9-columns" }, 0]
  },

  addCommands() {
    return {
      setColumns:
        (count: number) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { count }),
      setColumnCount:
        (count: number) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { count }),
      unsetColumns:
        () =>
        ({ tr, dispatch, state }) => {
          const { $from } = state.selection
          let depth = 0
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === this.name) {
              depth = d
              break
            }
          }
          if (depth === 0) return false

          if (dispatch) {
            const pos = $from.before(depth)
            const node = tr.doc.nodeAt(pos)
            if (node) {
              tr.replaceWith(pos, pos + node.nodeSize, node.content)
            }
          }
          return true
        },
    }
  },
})

export default Columns
