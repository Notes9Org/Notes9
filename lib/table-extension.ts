import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'

/**
 * Enhanced Table extension with advanced features
 */
export const EnhancedTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      resizable: {
        default: true,
      },
    }
  },

  addStorage() {
    return {
      ...this.parent?.(),
      tableMetadata: new Map(),
    }
  },
})

/**
 * Enhanced TableCell extension to support column widths
 */
export const EnhancedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.style.width
          return width ? parseInt(width) : null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) {
            return {}
          }
          return {
            style: `width: ${attributes.width}px`,
          }
        },
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ['td', HTMLAttributes, 0]
  },
})
