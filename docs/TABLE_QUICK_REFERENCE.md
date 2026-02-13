# Table Controls - Quick Reference

## 🎯 Getting Started

### Inserting a Table
1. Click the **table icon** (📊) in the toolbar
2. A 3×3 table with a header row is created

---

## 🎨 Interactive Controls

### **Resize Columns**
- **Where**: Top border of the table
- **How**: Hover → Drag blue handle left/right
- **What**: Adjusts column width (60px minimum)

### **Resize Rows**
- **Where**: Left border of the table
- **How**: Hover → Drag blue handle up/down
- **What**: Adjusts row height (60px minimum)

### **Add Row**
- **Where**: Blue **+** button at bottom-right corner
- **What**: Adds new row at the end of table
- **Animation**: Scales up on hover, animates on click

### **Add Column**
- **Where**: Blue **+** button at right side (middle)
- **What**: Adds new column to the right
- **Animation**: Scales up on hover, animates on click

### **Delete Row**
- **Where**: Red **×** button on left (appears on row hover)
- **How**: Hover over row header → Click red button
- **What**: Removes the entire row

### **Delete Column**
- **Where**: Red **×** button on top (appears on column hover)
- **How**: Hover over column header → Click red button
- **What**: Removes the entire column

---

## ⌨️ Keyboard Shortcuts (Toolbar)

| Action | Button | Icon |
|--------|--------|------|
| Insert Table | Table | 📊 |
| Add Column | + Col | ✚ |
| Add Row | + Row | ✚ |
| Delete Column | - Col | ✖ |
| Delete Row | - Row | ✖ |
| Delete Table | - Table | ✖ |

---

## 🎨 Visual Indicators

### Colors
- **Blue (#3b82f6)**: Resize handles and add buttons
- **Red (#ef4444)**: Delete buttons
- **Gray (#e5e7eb)**: Table borders

### Feedback
- Handles appear on hover with smooth fade-in
- Buttons scale up when you hover over them
- Cells get a blue tint on hover
- Click produces brief scale-down animation

---

## 📋 Usage Tips

✅ **Best Practices**
- Resize columns before adding content for better layout
- Use table header row for column titles
- Keep column widths at least 60px for readability
- Use the toolbar buttons for bulk operations

❌ **Avoid**
- Making columns too narrow (<60px won't work)
- Extremely large tables (may slow down resizing)
- Excessive nesting (keep it simple)

---

## 🌓 Dark Mode

All controls automatically adapt to dark mode:
- Darker backgrounds
- Lighter text and icons
- Adjusted shadows
- Same functionality

---

## 💡 Pro Tips

1. **Precise Sizing**: Drag slowly for fine control
2. **One-Click**: Add rows/columns with the blue buttons
3. **Quick Delete**: Hover any row/column to delete it
4. **Undo/Redo**: Cmd/Ctrl+Z to undo any changes
5. **Copy Tables**: Select and copy with Cmd/Ctrl+C

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Handles not visible | Hover over table edges (top or left) |
| Can't resize smaller | Minimum size is 60px |
| Changes not saving | Check if editor's onChange is connected |
| Dark mode looks wrong | Clear browser cache and refresh |

---

## 📞 Need Help?

See full documentation in: `docs/TABLE_FEATURES.md`
