# Table Features - Installation & Setup

## 📋 Prerequisites

Ensure you have the following packages installed:

```json
{
  "@tiptap/react": "^3.17.1",
  "@tiptap/starter-kit": "^3.17.1",
  "@tiptap/extension-table": "^3.17.1",
  "@tiptap/extension-table-row": "^3.17.1",
  "@tiptap/extension-table-header": "^3.17.1",
  "@tiptap/extension-table-cell": "^3.17.1",
  "@tiptap/extension-placeholder": "^3.17.1"
}
```

## ✅ Installation Status

The table features are **already installed and configured** in your project. No additional setup is needed!

### Existing Packages
```bash
✓ @tiptap/react
✓ @tiptap/starter-kit
✓ @tiptap/extension-table
✓ @tiptap/extension-table-row
✓ @tiptap/extension-table-header
✓ @tiptap/extension-table-cell
✓ @tiptap/extension-placeholder
✓ lucide-react (for icons)
✓ tailwindcss (for styling)
```

## 📁 File Structure

### New Files Added
```
components/
└── text-editor/
    └── table-controls.tsx          ← Advanced table manipulation UI

lib/
└── table-extension.ts              ← Custom Tiptap extensions

styles/
└── rich-text-editor.css            ← Updated with table styles

docs/
├── TABLE_README.md                 ← Main documentation
├── TABLE_FEATURES.md               ← Detailed features
├── TABLE_QUICK_REFERENCE.md        ← Quick lookup
├── TABLE_UI_LAYOUT.md              ← Visual guide
├── TABLE_CODE_EXAMPLES.md          ← Code samples
├── TABLE_IMPLEMENTATION_SUMMARY.md ← Technical summary
└── TABLE_INSTALLATION.md           ← This file
```

### Modified Files
```
components/
└── rich-text-editor.tsx            ← Integrated TableControls

styles/
└── rich-text-editor.css            ← Enhanced table styling
```

## 🚀 Quick Start

### 1. Import the Component
```tsx
import { RichTextEditor } from '@/components/rich-text-editor'
```

### 2. Use in Your Application
```tsx
export function MyComponent() {
  const [content, setContent] = useState('')

  return (
    <RichTextEditor
      content={content}
      onChange={setContent}
      placeholder="Start typing..."
    />
  )
}
```

### 3. Tables Are Ready to Use!
- Click the table icon in the toolbar to insert a table
- Hover over table edges to resize
- Use the blue + buttons to add rows/columns
- Use the red × buttons to delete rows/columns

## 🔧 Configuration

### Table Extensions Configuration

The editor is configured with:

```tsx
Table.configure({
  resizable: true,  // Enables resizing (handled by our controls)
}),
```

### CSS Import

The following CSS is automatically imported:
```tsx
import '@/styles/rich-text-editor.css'
```

This includes:
- Table base styles
- Table controls styling
- Dark mode support
- Animation definitions
- Responsive behavior

## 🎨 Customization

### Change Table Dimensions
```tsx
// In rich-text-editor.tsx, modify the insertTable call:
editor.chain().focus().insertTable({ 
  rows: 5,      // Change this
  cols: 4,      // Change this
  withHeaderRow: true 
}).run()
```

### Change Button Colors
```css
/* In rich-text-editor.css */

/* Resize handles - change #3b82f6 to your color */
.column-resize-handle {
  background-color: #3b82f6 !important;  /* Blue */
}

/* Delete buttons - change to your color */
button {
  background-color: #ef4444 !important;  /* Red */
}
```

### Change Minimum Sizes
```tsx
// In table-controls.tsx, modify these lines:
const newSize = Math.max(60, resizeState.startSize + delta)  // 60 = min width
const newHeight = Math.max(60, resizeState.startSize + delta) // 60 = min height
```

### Custom Table Styling
```css
/* In rich-text-editor.css */

.rich-text-editor .ProseMirror table {
  /* Modify these properties */
  border-radius: 8px !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
  margin: 1rem 0 !important;
}
```

## 🔄 Integration Points

### With State Management

```tsx
// Redux/Zustand integration
import { useSelector, useDispatch } from 'react-redux'

export function EditorContainer() {
  const content = useSelector(state => state.document.content)
  const dispatch = useDispatch()

  return (
    <RichTextEditor
      content={content}
      onChange={(newContent) => 
        dispatch(updateDocumentContent(newContent))
      }
    />
  )
}
```

### With Database

```tsx
import { useEffect } from 'react'

export function DocumentEditor({ docId }) {
  const [content, setContent] = useState('')

  useEffect(() => {
    // Fetch from database
    fetchDocument(docId).then(doc => setContent(doc.content))
  }, [docId])

  const handleSave = async (newContent) => {
    setContent(newContent)
    // Save to database
    await saveDocument(docId, { content: newContent })
  }

  return (
    <RichTextEditor
      content={content}
      onChange={handleSave}
    />
  )
}
```

### With Next.js Server Components

```tsx
'use client'

import { RichTextEditor } from '@/components/rich-text-editor'

export function ClientEditor({ initialContent }) {
  const [content, setContent] = useState(initialContent)

  return (
    <RichTextEditor
      content={content}
      onChange={setContent}
    />
  )
}
```

## 🧪 Testing

### Run Type Checking
```bash
# Ensure no TypeScript errors
npm run type-check
# or
npx tsc --noEmit
```

### Build the Project
```bash
npm run build
```

### Test in Development
```bash
npm run dev
```

Then navigate to a page with the RichTextEditor and:
1. ✅ Insert a table
2. ✅ Resize columns and rows
3. ✅ Add rows/columns
4. ✅ Delete rows/columns
5. ✅ Test dark mode toggle
6. ✅ Test on mobile browser

## 📦 Dependencies Verification

Run this to verify all dependencies:
```bash
npm ls @tiptap/extension-table
npm ls @tiptap/extension-table-row
npm ls @tiptap/extension-table-header
npm ls @tiptap/extension-table-cell
npm ls lucide-react
npm ls tailwindcss
```

All should show installed versions.

## 🐛 Troubleshooting

### Tables Not Appearing
1. Check that `@tiptap/extension-table` is installed
2. Verify CSS is imported: `import '@/styles/rich-text-editor.css'`
3. Check browser console for errors

### Controls Not Showing
1. Click on a table cell to select the table
2. Check that `TableControls` is imported in rich-text-editor.tsx
3. Verify Tailwind CSS is working

### Styling Issues
1. Clear browser cache (Ctrl+Shift+Delete)
2. Ensure PostCSS is configured for Tailwind
3. Check that postcss.config.mjs exists

### TypeScript Errors
1. Run `npm run type-check` to identify issues
2. Check that all imports are correct
3. Verify @tiptap package versions match

## 🔐 Browser DevTools

### Test in DevTools Console

```javascript
// Check if editor is working
const tables = document.querySelectorAll('table')
console.log('Number of tables:', tables.length)

// Test table operations
editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run()

// Get all table HTML
document.querySelector('table')?.outerHTML
```

## 📱 Mobile Testing

Test on mobile devices:

```bash
# Get your local IP
ipconfig getifaddr en0  # macOS
# or
hostname -I  # Linux

# Access from mobile browser
http://<your-ip>:3000
```

Verify:
- ✓ Touch events work
- ✓ Resize handles are touchable
- ✓ Buttons are clickable
- ✓ Controls appear on tap

## 🎯 Performance Checks

### DevTools Performance

1. Open DevTools (F12)
2. Go to Performance tab
3. Start recording
4. Resize a table column
5. Stop recording
6. Check that resize operations complete in <100ms

### Memory Checks

1. Open DevTools Memory tab
2. Take heap snapshot
3. Perform various table operations
4. Take another snapshot
5. Compare - should show no major leaks

## 📊 Browser Compatibility Test

Test on these browsers:

- [ ] Chrome (Desktop)
- [ ] Firefox (Desktop)
- [ ] Safari (Desktop)
- [ ] Edge (Desktop)
- [ ] Chrome (Mobile)
- [ ] Safari (iOS)
- [ ] Firefox (Mobile)

All should work correctly.

## ✅ Final Checklist

- [x] All files created/modified
- [x] No TypeScript errors
- [x] CSS imported and working
- [x] TableControls component functional
- [x] Table insertion working
- [x] Column/row resize working
- [x] Add row/column buttons working
- [x] Delete buttons working
- [x] Dark mode working
- [x] Mobile responsive
- [x] Documentation complete
- [x] Code examples provided

## 🎉 You're Ready!

The advanced table features are fully installed and ready to use. Start building!

### Next Steps

1. Review the [Quick Reference](./TABLE_QUICK_REFERENCE.md)
2. Check out [Code Examples](./TABLE_CODE_EXAMPLES.md)
3. Explore [UI Layout](./TABLE_UI_LAYOUT.md)
4. Read [Full Features](./TABLE_FEATURES.md)

---

## 📞 Support Resources

All documentation is in `/docs/`:
- TABLE_README.md - Main guide
- TABLE_FEATURES.md - Feature details
- TABLE_QUICK_REFERENCE.md - Quick lookup
- TABLE_UI_LAYOUT.md - Visual guide
- TABLE_CODE_EXAMPLES.md - Code samples
- TABLE_IMPLEMENTATION_SUMMARY.md - Technical details

Happy editing! 🚀
