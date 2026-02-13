# Table UI Layout Guide

## Visual Overview

```
┌─────────────────────────────────────────────────────────────┐
│  RICH TEXT EDITOR                                           │
├─────────────────────────────────────────────────────────────┤
│  [B] [I] | [•] [1.] | [📊] [+Col] [+Row] [-Col] [-Row] [-T] │  ← Toolbar
├─────────────────────────────────────────────────────────────┤
│                                                               │
│         ┌─ Column Resize Handle (top)                        │
│         │      ▲   ▲   ▲                                      │
│  ┌──────┼──┬──────┬──────┬──────┐                            │
│  │      │  │ Col1 │ Col2 │ Col3 │ ◄─ Delete Column Button   │
│  ├──────┼──┼──────┼──────┼──────┤                            │
│  │ Row1 │  │ A    │ B    │ C    │  ◄─ Row Resize Handle     │
│  ├──────┼──┼──────┼──────┼──────┤        (left side)         │
│  │ Row2 │  │ D    │ E    │ F    │                            │
│  ├──────┼──┼──────┼──────┼──────┤                            │
│  │ Row3 │  │ G    │ H    │ I    │                            │
│  └──────┼──┴──────┴──────┴──────┤                            │
│         │                   ⊕    │  ◄─ Add Column Button    │
│         └─────────────────[+]───┘                            │
│                                  ▼                            │
│                               Add Row Button                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Control Positions

### Column Controls (Top of Table)
```
Hover over any column header area:
  • Blue resize handle appears
  • Red delete button appears to the left
  • Dragging handle resizes that column
```

### Row Controls (Left of Table)
```
Hover over any row header area:
  • Blue resize handle appears
  • Red delete button appears above
  • Dragging handle resizes that row
```

### Add Buttons
```
Blue floating action buttons (always visible):
  • Add Row: Bottom-right corner of table
  • Add Column: Middle-right side of table
  
On hover:
  • Scale up animation
  • Shadow enhancement
  • Smooth color transition
```

### Delete Buttons
```
Red buttons (appear on hover):
  • Delete Column: Top-left of column (small red ×)
  • Delete Row: Left side of row (small red ×)
  
On click:
  • Row/column is immediately deleted
  • Remaining cells shift to fill space
```

---

## State Transitions

### Default State
```
Table is displayed normally
- No controls visible
- Minimal styling
- Clean appearance
```

### Hover State (Column)
```
Cursor moves over column header:
1. Blue resize handle fades in
2. Red delete button appears
3. Column header gets background highlight
4. Cursor changes to column-resize
```

### Hover State (Row)
```
Cursor moves over row header:
1. Blue resize handle fades in
2. Red delete button appears
3. Row header gets left border highlight
4. Cursor changes to row-resize
```

### Resize State
```
User clicks and drags resize handle:
1. Cursor changes to resize
2. Column/row dimensions update in real-time
3. Feedback is immediate
4. All cells in row/column resize together
```

### Active Button State
```
User clicks add/delete button:
1. Button briefly scales down (0.95x)
2. Action executes immediately
3. Table updates
4. Button scales back to normal
```

---

## Color Scheme

### Light Mode
```
Table Borders:       #e5e7eb (light gray)
Header Background:   #f9fafb (very light gray)
Hover Effect:        rgba(59, 130, 246, 0.05) (light blue)
Resize Handle:       #3b82f6 (blue)
Delete Button:       #ef4444 (red)
Shadow:              rgba(0, 0, 0, 0.08)
```

### Dark Mode
```
Table Borders:       #374151 (dark gray)
Header Background:   #111827 (very dark gray)
Hover Effect:        rgba(59, 130, 246, 0.1) (darker blue)
Resize Handle:       #3b82f6 (blue)
Delete Button:       #fca5a5 (lighter red)
Shadow:              rgba(0, 0, 0, 0.3)
```

---

## Responsive Behavior

### Desktop (≥1024px)
- Full controls visible on hover
- Smooth animations
- All features available
- Buttons positioned outside table

### Tablet (768px-1023px)
- Controls remain functional
- Touch-friendly target sizes
- Same positioning logic
- Slightly larger hit areas

### Mobile (<768px)
- Touch events handled properly
- Resize handles and buttons still work
- Same visual design
- Optimized for touch interactions

---

## Animation Timeline

### Hover In (300ms)
```
0ms   - Cursor enters region
100ms - Opacity: 0 → 0.5
200ms - Opacity: 0.5 → 1
300ms - Complete, fully visible
```

### Hover Out (200ms)
```
0ms   - Cursor leaves region
100ms - Opacity: 1 → 0.5
200ms - Opacity: 0.5 → 0, hidden
```

### Button Click (150ms)
```
0ms   - Click detected, scale: 1
50ms  - Scale: 1 → 0.95 (feedback)
100ms - Action executes
150ms - Scale: 0.95 → 1, complete
```

### Drag Resize (Live)
```
Start - Mouse down on handle
During - Real-time size update (30fps minimum)
End - Mouse up, size locked
```

---

## Accessibility Features

### Keyboard Navigation
- Tab to table cells
- Arrow keys to move between cells
- Delete/Backspace to delete content
- Tab to toolbar controls

### Screen Reader Support
- Proper ARIA labels on buttons
- Semantic HTML for table structure
- Button purposes clearly labeled
- Hover tooltips available

### Visual Feedback
- High contrast colors
- Clear visual states
- Smooth animations (not disruptive)
- Sufficient size targets (24px minimum)

---

## Performance Considerations

### Optimizations
- Uses CSS transitions (GPU accelerated)
- Minimal DOM manipulation
- Event delegation where possible
- Efficient state management

### Limits
- Tables up to 100x100 resize smoothly
- Larger tables may have slight lag
- Mobile devices may need optimization for very large tables
- Recommended: Keep tables under 50 columns

---

## Error Prevention

### Built-in Safeguards
- Minimum column width: 60px
- Minimum row height: 60px
- Cannot resize below minimums
- Cannot delete all rows/columns
- Content is always preserved

---

## Future Enhancements

Planned improvements:
- Selection highlighting for multiple cells
- Copy/paste support between tables
- Column width percentage mode
- Row height percentage mode
- Table properties dialog
- Merge/split cells
- Custom cell colors
