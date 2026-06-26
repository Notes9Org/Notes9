import { Node, mergeAttributes } from "@tiptap/core"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType
    }
  }
}

/**
 * A hard page break. Shows a labelled divider on screen and forces a new page
 * when the note is printed or exported to PDF (`break-after: page`).
 */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page-break",
        class: "n9-page-break",
        contenteditable: "false",
        // Inline so the break survives export (PDF/HTML) where the stylesheet
        // class isn't loaded. The on-screen divider/label come from the class.
        style: "page-break-after: always; break-after: page;",
      }),
    ]
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    }
  },
})

export default PageBreak
