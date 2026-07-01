import { Extension } from "@tiptap/core"

export interface LineHeightOptions {
  types: string[]
  defaultHeight: string
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (height: string) => ReturnType
      unsetLineHeight: () => ReturnType
    }
  }
}

/**
 * Word-style line spacing. Stores a `line-height` on block nodes (paragraphs,
 * headings, list items) so spacing survives save/load and export.
 */
export const LineHeight = Extension.create<LineHeightOptions>({
  name: "lineHeight",

  addOptions() {
    return {
      types: ["paragraph", "heading", "listItem", "taskItem"],
      defaultHeight: "",
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: this.options.defaultHeight,
            parseHTML: (element: HTMLElement) => element.style.lineHeight || this.options.defaultHeight,
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = attributes.lineHeight
              if (!value || value === this.options.defaultHeight) return {}
              return { style: `line-height: ${value}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLineHeight:
        (height: string) =>
        ({ state, tr, dispatch }) => {
          const { from, to } = state.selection
          let changed = false
          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight: height })
              changed = true
            }
          })
          if (changed && dispatch) dispatch(tr)
          return changed
        },
      unsetLineHeight:
        () =>
        ({ state, tr, dispatch }) => {
          const { from, to } = state.selection
          let changed = false
          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight: "" })
              changed = true
            }
          })
          if (changed && dispatch) dispatch(tr)
          return changed
        },
    }
  },
})

export default LineHeight
