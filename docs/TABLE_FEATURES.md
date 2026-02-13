# Advanced Table Features Documentation

## Overview

The rich text editor now includes a polished and modern table manipulation system with the following features:

### ✨ Features

#### 1. **Column Resize by Hovering**
- Hover over the top border of any table column
- A blue resize handle appears above the column
- Click and drag the handle left/right to resize the column
- All cells in the column resize proportionally
- Minimum column width: 60px

#### 2. **Row Resize by Hovering**
- Hover over the left border of any table row
- A blue resize handle appears to the left of the row
- Click and drag the handle up/down to resize the row height
- All cells in the row resize their height
- Minimum row height: 60px

#### 3. **Quick Add Buttons**
- **Add Row Button**: Located at the bottom-right corner of the table
  - Click to add a new row at the end of the table
  - Animated with hover effects (scales up on hover)
  - Blue floating action button with shadow

- **Add Column Button**: Located at the right side of the table (vertically centered)
  - Click to add a new column to the right of the table
  - Same animated design as the add row button

#### 4. **Delete Controls**
- **Delete Column**: When hovering over a column header, a red delete button appears
  - Click to remove that column from the table
  - All data in that column is removed

- **Delete Row**: When hovering over a row header, a red delete button appears
  - Click to remove that row from the table
  - All data in that row is removed

#### 5. **Toolbar Controls** (Legacy, still available)
- Insert Table (3x3 with header row by default)
- Add Column/Row Before
- Delete Column/Row/Table

### 🎨 UI Design

#### Color Scheme
- **Blue (#3b82f6)**: Used for resize handles and add buttons
- **Red (#ef4444)**: Used for delete buttons
- **Dark Mode**: Fully supported with appropriate color adjustments

#### Interactive Elements
- Resize handles: Appear on hover, smooth transitions
- Delete buttons: Appear on hover, positioned intuitively
- Add buttons: Always visible as floating action buttons
- Smooth animations: All interactions have smooth transitions

#### Table Styling
- Clean borders with subtle shadows
- Header row with distinct background color
- Hover effects on table cells
- Rounded corners for a modern look
- Responsive to light/dark theme changes

### 📱 Responsive Behavior

The table controls are positioned using absolute positioning relative to the table container. They adapt to:
- Table size changes
- Dynamic row/column additions
- Different table positions on the page
- Both light and dark themes

### 🚀 Usage Example

1. **Insert a table**: Click the table icon in the toolbar
2. **Resize columns**: Hover over the column header, drag the blue line
3. **Resize rows**: Hover over the row header, drag the blue line
4. **Add rows/columns**: Click the blue "+" buttons at the edges
5. **Delete rows/columns**: Hover over the row/column header, click the red "×" button
6. **Delete entire table**: Select a cell in the table and click "Delete Table" in the toolbar

### 🔧 Technical Implementation

#### Components
- **[RichTextEditor](../../components/rich-text-editor.tsx)**: Main editor component with table support
- **[TableControls](./table-controls.tsx)**: Advanced table manipulation UI
- **[EnhancedTable Extension](../../lib/table-extension.ts)**: Custom Tiptap extensions

#### Files Modified
- `components/rich-text-editor.tsx`: Integrated TableControls component
- `components/text-editor/table-controls.tsx`: New component for table manipulation
- `styles/rich-text-editor.css`: Modern styling for tables and controls
- `lib/table-extension.ts`: Custom table extensions with width support

#### Key Features Implementation
- **Resize tracking**: Uses mouse event listeners for drag operations
- **State management**: React hooks for managing resize and hover states
- **Performance**: Efficient rendering with minimal re-renders
- **Accessibility**: Proper ARIA labels and keyboard navigation support

### 📋 Browser Compatibility

Works on all modern browsers:
- Chrome/Edge 88+
- Firefox 87+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

### 🎯 Best Practices

1. **Minimum Widths**: Columns have a minimum width of 60px to maintain usability
2. **Minimum Heights**: Rows have a minimum height of 60px
3. **Content Preservation**: Resizing doesn't affect cell content, only display size
4. **Undo/Redo**: All table operations support browser's undo/redo
5. **Data Persistence**: Changes are automatically saved via the editor's onChange callback

### 🚨 Known Limitations

- Column widths are stored as inline styles (can be preserved in exported HTML)
- Row heights are stored as inline styles
- When copying tables, some styling may not transfer depending on paste target
- Very large tables may have slight performance impact on resize

### 🔄 Future Enhancements

Potential improvements for future versions:
- Merge/split cells
- Column width percentage support
- Row height percentage support
- Table selection and bulk operations
- Copy/paste table sections
- Table sorting and filtering
- Custom cell content (images, links, etc.)
