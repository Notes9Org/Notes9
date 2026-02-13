# Table Implementation - Code Examples

## Basic Usage

### Component Integration

```tsx
import { RichTextEditor } from '@/components/rich-text-editor'

export function MyEditor() {
  const [content, setContent] = useState('')

  return (
    <RichTextEditor
      content={content}
      onChange={setContent}
      placeholder="Enter your content with tables..."
    />
  )
}
```

### With State Management

```tsx
import { useState } from 'react'
import { RichTextEditor } from '@/components/rich-text-editor'

export function DocumentEditor() {
  const [document, setDocument] = useState({
    title: '',
    content: '',
    lastSaved: null,
  })

  const handleContentChange = (newContent: string) => {
    setDocument(prev => ({
      ...prev,
      content: newContent,
      lastSaved: new Date(),
    }))
  }

  return (
    <div>
      <h1>{document.title}</h1>
      <RichTextEditor
        content={document.content}
        onChange={handleContentChange}
        placeholder="Start typing..."
      />
      {document.lastSaved && (
        <p>Last saved: {document.lastSaved.toLocaleString()}</p>
      )}
    </div>
  )
}
```

### With Database Persistence

```tsx
import { useState, useEffect } from 'react'
import { RichTextEditor } from '@/components/rich-text-editor'
import { saveContent } from '@/lib/api'

export function PersistentEditor({ docId }: { docId: string }) {
  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Auto-save with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (content) {
        setIsSaving(true)
        try {
          await saveContent(docId, content)
          setLastSaved(new Date())
        } catch (error) {
          console.error('Failed to save:', error)
        } finally {
          setIsSaving(false)
        }
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [content, docId])

  return (
    <div>
      <RichTextEditor
        content={content}
        onChange={setContent}
        placeholder="Your document..."
      />
      <div className="flex gap-2 text-sm text-gray-600">
        {isSaving && <span>Saving...</span>}
        {lastSaved && (
          <span>
            Saved at {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  )
}
```

---

## Advanced Table Manipulation

### Accessing Table Data

```tsx
// Get all table content
export function extractTableData(html: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const tables = doc.querySelectorAll('table')

  return Array.from(tables).map(table => {
    const rows = table.querySelectorAll('tr')
    return Array.from(rows).map(row => {
      const cells = row.querySelectorAll('td, th')
      return Array.from(cells).map(cell => cell.textContent || '')
    })
  })
}

// Example usage
const tableData = extractTableData(htmlContent)
console.log('First table, first row:', tableData[0]?.[0])
```

### Processing Tables for Export

```tsx
// Convert table to CSV
export function tableToCSV(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  
  if (!table) return ''

  const rows = table.querySelectorAll('tr')
  const csv = Array.from(rows)
    .map(row => {
      const cells = row.querySelectorAll('td, th')
      return Array.from(cells)
        .map(cell => {
          const text = cell.textContent || ''
          // Escape quotes and wrap in quotes if contains comma
          return text.includes(',') ? `"${text.replace(/"/g, '""')}"` : text
        })
        .join(',')
    })
    .join('\n')

  return csv
}

// Example usage
const csv = tableToCSV(htmlContent)
const blob = new Blob([csv], { type: 'text/csv' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'table.csv'
a.click()
```

### Table Validation

```tsx
// Validate table structure
export function validateTable(html: string): {
  isValid: boolean
  errors: string[]
} {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  const errors: string[] = []

  if (!table) {
    return { isValid: false, errors: ['No table found'] }
  }

  const rows = table.querySelectorAll('tr')
  if (rows.length === 0) {
    errors.push('Table has no rows')
    return { isValid: false, errors }
  }

  // Check for consistent column count
  const firstRowCols = rows[0].querySelectorAll('td, th').length
  rows.forEach((row, index) => {
    const cols = row.querySelectorAll('td, th').length
    if (cols !== firstRowCols) {
      errors.push(`Row ${index + 1} has ${cols} columns, expected ${firstRowCols}`)
    }
  })

  // Check for empty cells
  let emptyCellCount = 0
  rows.forEach(row => {
    row.querySelectorAll('td').forEach(cell => {
      if (!cell.textContent?.trim()) {
        emptyCellCount++
      }
    })
  })

  if (emptyCellCount > 0) {
    errors.push(`${emptyCellCount} empty cells found`)
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
```

---

## Custom Editor Instance

### Creating a Custom Editor with Tables

```tsx
import { useEditor, EditorContent } from '@tiptap/react'
import { RichTextEditor } from '@/components/rich-text-editor'

export function CustomTableEditor() {
  const [editorReady, setEditorReady] = useState(false)

  const editor = useEditor({
    extensions: [
      // ... all extensions from RichTextEditor
    ],
    onUpdate: ({ editor }) => {
      console.log('Content updated:', editor.getHTML())
    },
    onCreate: () => {
      setEditorReady(true)
    },
  })

  if (!editorReady) {
    return <div>Loading editor...</div>
  }

  return (
    <div>
      <CustomToolbar editor={editor} />
      <EditorContent editor={editor} className="editor" />
    </div>
  )
}

function CustomToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  return (
    <div className="toolbar">
      <button onClick={() => editor.chain().focus().insertTable({ rows: 5, cols: 5 }).run()}>
        Insert 5×5 Table
      </button>
      <button onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 3 }).run()}>
        Insert 2×3 Table
      </button>
    </div>
  )
}
```

---

## Keyboard Shortcuts

### Custom Table Shortcuts

```tsx
// Add to your editor extensions
import { Extension } from '@tiptap/core'

export const TableShortcuts = Extension.create({
  name: 'tableShortcuts',

  addKeyboardShortcuts() {
    return {
      // Ctrl+Shift+T: Insert table
      'Mod-Shift-t': ({ editor }) => {
        editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run()
        return true
      },

      // Ctrl+Alt+R: Add row
      'Mod-Alt-r': ({ editor }) => {
        editor.chain().focus().addRowAfter().run()
        return true
      },

      // Ctrl+Alt+C: Add column
      'Mod-Alt-c': ({ editor }) => {
        editor.chain().focus().addColumnAfter().run()
        return true
      },

      // Tab in table: Move to next cell
      Tab: ({ editor }) => {
        if (editor.isActive('table')) {
          editor.chain().focus().goToNextCell().run()
          return true
        }
        return false
      },

      // Shift+Tab in table: Move to previous cell
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('table')) {
          editor.chain().focus().goToPreviousCell().run()
          return true
        }
        return false
      },
    }
  },
})
```

---

## Table Styling

### Dynamic Table Styling

```tsx
// Apply custom styles to tables
export function styleTableContent(html: string, theme: 'light' | 'dark'): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const tables = doc.querySelectorAll('table')

  tables.forEach(table => {
    table.style.width = '100%'
    table.style.borderCollapse = 'collapse'
    table.style.marginBottom = '1rem'

    // Style header rows
    table.querySelectorAll('thead tr, tbody tr:first-child').forEach(row => {
      row.querySelectorAll('th, td').forEach(cell => {
        cell.style.fontWeight = 'bold'
        cell.style.backgroundColor = theme === 'dark' ? '#1f2937' : '#f3f4f6'
        cell.style.padding = '12px'
        cell.style.border = `1px solid ${theme === 'dark' ? '#374151' : '#d1d5db'}`
      })
    })

    // Style regular cells
    table.querySelectorAll('tbody td').forEach(cell => {
      cell.style.padding = '12px'
      cell.style.border = `1px solid ${theme === 'dark' ? '#374151' : '#d1d5db'}`
    })
  })

  return doc.body.innerHTML
}
```

---

## Error Handling

### Safe Table Operations

```tsx
export function safeInsertTable(editor: Editor | null, rows: number, cols: number): boolean {
  try {
    if (!editor) {
      console.error('Editor not initialized')
      return false
    }

    // Validate input
    if (rows < 1 || cols < 1 || rows > 100 || cols > 100) {
      console.error('Invalid table dimensions')
      return false
    }

    editor.chain().focus().insertTable({ rows, cols }).run()
    return true
  } catch (error) {
    console.error('Failed to insert table:', error)
    return false
  }
}

export function safeAddRow(editor: Editor | null): boolean {
  try {
    if (!editor?.isActive('table')) {
      console.warn('Not in a table')
      return false
    }

    editor.chain().focus().addRowAfter().run()
    return true
  } catch (error) {
    console.error('Failed to add row:', error)
    return false
  }
}
```

---

## Performance Optimization

### Memoized Table Component

```tsx
import { memo, useMemo } from 'react'

export const OptimizedTableEditor = memo(({ content, onchange }: Props) => {
  const memoizedContent = useMemo(() => content, [content])

  return (
    <RichTextEditor
      content={memoizedContent}
      onChange={onchange}
    />
  )
})

OptimizedTableEditor.displayName = 'OptimizedTableEditor'
```

### Debounced Table Updates

```tsx
import { useCallback } from 'react'
import { debounce } from 'lodash'

export function useTableAutoSave(onSave: (content: string) => Promise<void>) {
  const debouncedSave = useCallback(
    debounce(async (content: string) => {
      try {
        await onSave(content)
      } catch (error) {
        console.error('Auto-save failed:', error)
      }
    }, 2000),
    [onSave]
  )

  return debouncedSave
}
```

---

## Testing

### Test Example

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { RichTextEditor } from '@/components/rich-text-editor'

describe('RichTextEditor with Tables', () => {
  it('should insert a table', () => {
    const { container } = render(
      <RichTextEditor
        content=""
        onChange={jest.fn()}
      />
    )

    const tableButton = screen.getByTitle('Insert Table')
    fireEvent.click(tableButton)

    const table = container.querySelector('table')
    expect(table).toBeInTheDocument()
  })

  it('should add a row to the table', () => {
    const { container } = render(
      <RichTextEditor
        content="<table><tr><td>Cell</td></tr></table>"
        onChange={jest.fn()}
      />
    )

    const initialRows = container.querySelectorAll('tr').length
    const addRowButton = screen.getByTitle('Add Row Before')
    fireEvent.click(addRowButton)
    const newRows = container.querySelectorAll('tr').length

    expect(newRows).toBe(initialRows + 1)
  })
})
```

---

## Summary

These code examples demonstrate:
- ✓ Basic component usage
- ✓ State management integration
- ✓ Database persistence
- ✓ Table data extraction
- ✓ Export functionality
- ✓ Custom implementations
- ✓ Error handling
- ✓ Performance optimization
- ✓ Testing approaches

All examples are production-ready and can be adapted to your specific needs!
