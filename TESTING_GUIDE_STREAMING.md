# Testing Guide: Streaming UI Enhancements

**Status**: Ready to Test 🚀  
**Server**: Running on http://localhost:3000  
**Backend**: Catalyst agent at http://localhost:8000

---

## Quick Start

### 1. Open Chat Interface
```
1. Navigate to http://localhost:3000 in browser
2. Log in with your Supabase credentials
3. Open Catalyst chat modal (look for Sparkles icon)
```

### 2. Test Scenarios

#### Scenario A: Basic Streaming
**Query**: "What experiments are currently active?"

**Expected Behavior**:
- ✅ Thinking panel appears with "Analyzing query..."
- ✅ Tool status shows "Querying database..."
- ✅ Thinking panel fades out when response starts
- ✅ Text streams smoothly character-by-character
- ✅ Citations fade in at bottom

**What to Watch**:
- Does thinking panel appear immediately?
- Does text rendering feel smooth (no jank)?
- Do citations appear progressively?

---

#### Scenario B: Complex Multi-Tool Query
**Query**: "Find all CRISPR experiments from papers published in 2024 and compare their protocols"

**Expected Behavior**:
- ✅ Thinking panel: "Planning multi-step search..."
- ✅ Tool status: "Searching documents..." (RAG)
- ✅ Tool status changes to: "Querying experiments..." (SQL)
- ✅ Long response streams smoothly
- ✅ Multiple citations (5-10) fade in

**What to Watch**:
- Does tool status update as agent switches tools?
- Is the long response smooth (no freezing)?
- Do all citations render correctly?

---

#### Scenario C: Fast Response (< 1 sec)
**Query**: "Hello"

**Expected Behavior**:
- ✅ Thinking panel may flash briefly or not appear
- ✅ Response appears almost instantly
- ✅ Smooth text rendering even though it's fast
- ✅ No citations (simple greeting)

**What to Watch**:
- Does UI feel snappy?
- No visual glitches from fast state changes?

---

#### Scenario D: Clarification Question
**Query**: "What is the protocol?" (intentionally vague)

**Expected Behavior**:
- ✅ Thinking panel: "Analyzing query for clarity..."
- ✅ Clarification blockquote appears in response
- ✅ Smooth rendering of clarification options

**What to Watch**:
- Does clarification appear correctly formatted?
- Can you click options to refine query?

---

## Visual Checklist

### Thinking Panel
- [ ] Appears at top of assistant message
- [ ] Brain icon pulses smoothly
- [ ] Ellipsis animates (... cycles through 0-3 dots)
- [ ] Shows reasoning text clearly
- [ ] Auto-collapses after 2 seconds
- [ ] Fades out when tokens start arriving
- [ ] Doesn't appear for instant responses

### Tool Status Bar
- [ ] Appears below thinking panel
- [ ] Shows correct icon (database=SQL, search=RAG, globe=web)
- [ ] Spinner animates smoothly
- [ ] Tool name displays clearly
- [ ] Custom message shows if available
- [ ] Fades out when tokens start

### Text Streaming
- [ ] Character-by-character appearance
- [ ] No janky jumps or stutters
- [ ] Smooth at all speeds (fast/slow)
- [ ] Final text matches exactly
- [ ] Code blocks render correctly
- [ ] Lists and tables format properly

### Citations Panel
- [ ] Appears at bottom of message
- [ ] Single citation shows as card
- [ ] Multiple citations show as collapsible list
- [ ] "All citations (N)" button displays count
- [ ] Each citation has:
  - [ ] Index number [1], [2], etc.
  - [ ] Title/source name
  - [ ] Source type label
  - [ ] Excerpt preview (up to 320 chars)
  - [ ] Relevance percentage (if available)
  - [ ] MapPin icon if highlightable
- [ ] Clicking citation opens document
- [ ] Hovering shows pointer cursor

---

## Browser Console Checks

### Expected Logs (No Errors)
```javascript
// Good - Normal operation
"[chat/stream] SSE block: event=thinking"
"[chat/stream] SSE block: event=token"
"[chat/stream] SSE block: event=source"

// Good - Streaming complete
"[chat] Streaming complete"
```

### Unexpected Errors (Report These)
```javascript
// Bad - Animation issues
"RAF loop not cleaned up"
"Memory leak detected"

// Bad - Citation issues
"Failed to parse citation"
"Citation data missing"

// Bad - State issues
"setState on unmounted component"
```

---

## Performance Monitoring

### Chrome DevTools Performance Tab
1. Open DevTools → Performance tab
2. Start recording
3. Send a query
4. Stop recording after response complete

**Check**:
- [ ] No long tasks (> 50ms)
- [ ] Smooth 60fps during streaming
- [ ] No memory leaks (heap stable after GC)
- [ ] RAF loop stops when done

### Network Tab
1. Open DevTools → Network tab
2. Filter: EventStream
3. Send a query

**Check**:
- [ ] SSE connection established
- [ ] Events stream in real-time
- [ ] `thinking`, `token`, `source`, `done` events present
- [ ] No connection errors

---

## Mobile Testing (Optional)

### iOS Safari
- [ ] Thinking panel displays correctly
- [ ] Touch interactions work
- [ ] Citations expandable on tap
- [ ] Text renders smoothly

### Android Chrome
- [ ] All animations work
- [ ] No layout shifts
- [ ] Performance acceptable

---

## Accessibility Testing

### Screen Reader (VoiceOver/NVDA)
- [ ] Thinking state announced
- [ ] Tool status announced
- [ ] Citation links navigable
- [ ] Message content readable

### Keyboard Navigation
- [ ] Tab through citations
- [ ] Enter opens citation
- [ ] Escape closes modal
- [ ] No keyboard traps

### Reduced Motion
```css
/* Test with this OS setting enabled */
prefers-reduced-motion: reduce
```
- [ ] Animations respect setting
- [ ] Functionality still works
- [ ] No jarring transitions

---

## Common Issues & Solutions

### Issue: Thinking Panel Not Appearing
**Symptoms**: No thinking panel shows even on complex queries

**Checks**:
1. Browser console for SSE events
2. Network tab shows `thinking` events?
3. State updating in React DevTools?

**Solution**: Check if backend is emitting `thinking` events

---

### Issue: Janky Text Rendering
**Symptoms**: Text appears in chunks, not smoothly

**Checks**:
1. Chrome DevTools Performance tab
2. Check CPU usage (should be < 50%)
3. RAF loop running?

**Solutions**:
- Reduce `minDelay` in `useSmoothTextStream`
- Increase `maxQueueSize` if tokens arrive very fast
- Check for other heavy operations blocking main thread

---

### Issue: Citations Not Appearing
**Symptoms**: No citation panel at bottom of message

**Checks**:
1. Network tab shows `source` events?
2. Console shows citation data?
3. Check if `done` event has resources/citations array

**Solution**: Verify backend is sending citation data in SSE stream

---

### Issue: Tool Status Always Shows
**Symptoms**: Tool status bar doesn't disappear

**Checks**:
1. `onFinish` callback being called?
2. State clearing properly?
3. Check `isLoading` state in chat.tsx

**Solution**: Ensure `onFinish` clears `currentTool` state

---

## Regression Testing

### Existing Features Must Still Work
- [ ] Message copy button
- [ ] Regenerate button
- [ ] Session history sidebar
- [ ] New chat button
- [ ] Delete session
- [ ] Web search toggle
- [ ] Markdown formatting (code, lists, tables)
- [ ] User/assistant avatars
- [ ] Textarea auto-resize
- [ ] Keyboard shortcuts (Enter, Shift+Enter, Esc)

---

## Report Template

When reporting issues, include:

```markdown
### Issue Description
Brief description of the problem

### Steps to Reproduce
1. Open chat
2. Send query: "..."
3. Observe: ...

### Expected Behavior
What should happen

### Actual Behavior
What actually happened

### Environment
- Browser: Chrome 120 / Safari 17 / Firefox 115
- OS: macOS 14.2 / Windows 11 / Ubuntu 22.04
- Screen size: 1920x1080 / Mobile

### Console Errors
```
Paste any errors from browser console
```

### Screenshots
Attach screenshots if visual issue

### Additional Context
Any other relevant information
```

---

## Success Criteria

All these should pass before considering implementation complete:

### Phase 1 Core Features
- [x] ThinkingPanel component created and integrated
- [x] ToolStatusBar component created and integrated
- [x] useSmoothTextStream hook working
- [x] Citation parser utility created
- [x] InlineCitation component created (not yet integrated)
- [x] Agent citations panel supports streaming mode

### Phase 1 Testing
- [ ] Thinking panel appears and behaves correctly
- [ ] Tool status shows during SQL/RAG queries
- [ ] Text streams smoothly at 60fps
- [ ] Citations display correctly
- [ ] No console errors during normal operation
- [ ] No memory leaks after 10 queries
- [ ] Works on Chrome, Safari, Firefox
- [ ] Mobile responsive
- [ ] Accessible via keyboard and screen reader

---

## Next Phase Preview

### Phase 2: Inline Citations
- Replace `[1]` in markdown with InlineCitation components
- Hover tooltips showing excerpt previews
- Click to scroll to full citation
- Auto-number citations as they're mentioned

### Phase 3: Polish
- Skeleton loaders during initial wait
- Advanced fade transitions
- Optional typewriter effect mode
- Enhanced citation cards with thumbnails

---

**Ready to Test!** 🚀

Open http://localhost:3000 and start with Scenario A above.
