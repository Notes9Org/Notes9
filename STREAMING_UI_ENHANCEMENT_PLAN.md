# Streaming UI Enhancement Plan: Cursor/Claude-Style Improvements

**Date**: 2026-05-11  
**Goal**: Upgrade Notes9 chat UI to provide smooth, professional streaming experience like Cursor or Claude

---

## Current State Analysis

### What's Working
1. **Backend SSE Support** ✅
   - Server emits: `thinking`, `token`, `source`, `clarify`, `error`, `done` events
   - Token-by-token streaming from `/chat/stream` endpoint
   - Citations manifest with excerpts (500 char excerpts after recent improvements)
   - Rich metadata: chunk_id, page_number, relevance, content_surface

2. **Frontend SSE Processing** ✅
   - `app/api/chat/route.ts` properly parses SSE events
   - Token accumulation works (line 195-206)
   - Source event collection (line 209)
   - AI SDK integration with `createUIMessageStream`

3. **Citation Infrastructure** ✅
   - `agent-citations-panel.tsx`: Collapsible citations with excerpts
   - `agent-stream-types.ts`: Proper TypeScript definitions
   - Smart highlighting: MapPin icon for highlightable excerpts
   - Link resolution for all entity types

### What's Missing (vs Cursor/Claude)

#### 1. **Character-by-Character Rendering**
- **Current**: Tokens written to stream immediately but React may batch renders
- **Cursor/Claude**: Ultra-smooth char-by-char typewriter effect
- **Gap**: No visual smoothing layer between token arrival and DOM update

#### 2. **Thinking/Reasoning Panel**
- **Current**: `thinking` events arrive but aren't displayed in UI
- **Cursor/Claude**: Collapsible "Thinking..." panel showing agent reasoning in real-time
- **Gap**: No component to visualize thinking events

#### 3. **Tool Execution Status**
- **Current**: No UI feedback when SQL/RAG/tools are running
- **Cursor/Claude**: Status chips like "🔍 Searching database...", "📄 Reading documents..."
- **Gap**: User doesn't see what the agent is doing during delays

#### 4. **Inline Citation Preview**
- **Current**: Citations appear as collapsed panel at bottom after completion
- **Cursor/Claude**: Inline `[1]` numbers appear during streaming, hover shows excerpt preview
- **Gap**: Citations only visible after message completes

#### 5. **Progressive Enhancement**
- **Current**: Message bubble appears, content fills in
- **Cursor/Claude**: Subtle animations, fade-ins for new content blocks
- **Gap**: Abrupt appearance, no polish on transitions

---

## Proposed Enhancements

### Phase 1: Core Streaming Improvements (High Priority)

#### 1.1 Thinking Panel Component
**File**: `/components/catalyst/thinking-panel.tsx`

```tsx
interface ThinkingPanelProps {
  thinking: string | null;  // Current thinking event payload
  isVisible: boolean;       // Show/hide based on streaming state
}
```

**Features**:
- Collapsible panel with "🤔 Thinking..." header
- Animated ellipsis while thinking
- Fades out when token streaming starts
- Positioned above message content

**Integration**:
- Modify `chat-message.tsx` to include ThinkingPanel
- Pass thinking events from SSE stream

#### 1.2 Tool Status Indicators
**File**: `/components/catalyst/tool-status-bar.tsx`

```tsx
interface ToolStatusProps {
  currentTool: 'sql' | 'rag' | 'web_search' | null;
  toolMessage?: string;  // e.g., "Searching 3 experiments"
}
```

**Features**:
- Animated spinner icons for active tools
- Status text from backend events
- Stacks multiple simultaneous tools
- Auto-dismisses when tool completes

**Backend Changes**:
- Add optional `tool_status` SSE events to `/chat/stream`
- Emit when SQL query starts/completes, RAG search starts/completes

#### 1.3 Smooth Character Rendering
**File**: `chat-message.tsx` enhancement

**Current flow**:
```typescript
// Tokens arrive → writer.write({ type: 'text-delta' }) → React batches updates
assistantContent += t;
writer.write({ type: 'text-delta', id: textId, delta: t });
```

**Enhanced flow**:
```typescript
// Add RAF-based smoothing for very rapid token streams
const [displayText, setDisplayText] = useState('');
const textQueue = useRef<string[]>([]);

useEffect(() => {
  // Dequeue and render at 60fps for ultra-smooth display
  const rafId = requestAnimationFrame(renderNextChunk);
  return () => cancelAnimationFrame(rafId);
}, [textQueue.current]);
```

**Why**: Prevents janky updates when backend sends 20+ tokens/sec

---

### Phase 2: Citation Enhancements (Medium Priority)

#### 2.1 Inline Citation Numbers
**Goal**: Show `[1]` `[2]` inline as they're streamed, clickable immediately

**Implementation**:
- Detect citation patterns in token stream: `/\[(\d+)\]/g`
- Replace with clickable `<CitationChip number={n} />` component
- Maintain map of citation numbers → full citation data
- Show inline preview tooltip on hover

**File**: `/components/catalyst/inline-citation.tsx`
```tsx
interface InlineCitationProps {
  number: number;
  citation: AgentCitationPanelItem | null;  // null during streaming
  onNavigate: () => void;
}
```

**Features**:
- Monospace chip `[1]` with subtle hover underline
- Tooltip shows excerpt preview (100 chars)
- Click scrolls to full citation or opens document
- Disabled state while citation metadata loads

#### 2.2 Streaming Citation Updates
**Current**: Citations appear all-at-once in `done` event

**Enhanced**: 
- Show citation cards as `source` events arrive during streaming
- Progressive disclosure: title first → relevance → excerpt
- Fade-in animation for each new citation

**Files to modify**:
- `agent-citations-panel.tsx`: Add `isStreaming` prop
- `app/api/chat/route.ts`: Emit citations incrementally via AI SDK parts

---

### Phase 3: Polish & Animations (Lower Priority)

#### 3.1 Typewriter Effect (Optional)
**Consideration**: True char-by-char typewriter can be distracting
- Only enable if tokens arrive slower than ~100ms each
- Use for clarification questions (more deliberate)
- Skip for high-speed token bursts

#### 3.2 Fade-In Transitions
**Components affected**:
- Message bubble entrance
- Code blocks appearing
- Citation panel expansion

**CSS additions**:
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

#### 3.3 Skeleton Loaders
**When user sees loading state**:
- Show pulsing skeleton for message bubble
- Placeholder lines for thinking panel
- Shimmer effect on citation cards

---

## Implementation Priority

### Must-Have (Week 1)
1. **Thinking Panel**: Immediate value, low complexity
2. **Tool Status Bar**: Critical UX improvement for long-running queries
3. **Smooth Token Rendering**: Fix janky updates

### Should-Have (Week 2)
4. **Inline Citation Numbers**: Major UX upgrade for citation discovery
5. **Streaming Citation Updates**: Show progress during long RAG searches

### Nice-to-Have (Future)
6. **Fade-In Animations**: Polish, not critical
7. **Skeleton Loaders**: Minor improvement
8. **Typewriter Effect**: Optional flair

---

## Technical Considerations

### Performance
- **Token Queue**: Use `requestAnimationFrame` to avoid blocking main thread
- **Citation Tooltips**: Lazy-load full citation data on first hover
- **Markdown Re-render**: Memoize `MarkdownRenderer` to prevent unnecessary re-parses

### Accessibility
- **Thinking Panel**: Use `aria-live="polite"` for screen reader announcements
- **Tool Status**: Include visually-hidden text for status changes
- **Citation Links**: Ensure keyboard navigation works for inline chips

### Browser Compatibility
- **SSE**: Already works (tested in Chrome/Safari/Firefox)
- **RAF Smoothing**: Universally supported
- **CSS Animations**: Use fallbacks for reduced-motion preference

---

## Files to Create

1. `/components/catalyst/thinking-panel.tsx` - New component
2. `/components/catalyst/tool-status-bar.tsx` - New component  
3. `/components/catalyst/inline-citation.tsx` - New component
4. `/components/catalyst/citation-tooltip.tsx` - New component
5. `/hooks/use-smooth-text-stream.ts` - RAF-based smoothing hook
6. `/lib/citation-parser.ts` - Parse `[n]` patterns in markdown

## Files to Modify

1. `/components/catalyst/chat-message.tsx`
   - Add ThinkingPanel above message content
   - Add ToolStatusBar below thinking
   - Integrate inline citation parser
   
2. `/components/catalyst/chat.tsx`
   - Pass thinking/tool status state to message component
   - Handle citation number → data mapping

3. `/app/api/chat/route.ts`
   - Emit tool_status events (optional backend enhancement)
   - Send citation parts during streaming (not just in done)

4. `/components/catalyst/agent-citations-panel.tsx`
   - Add isStreaming mode with fade-in animations
   - Support partial citation data during stream

5. `/components/catalyst/markdown-renderer.tsx`
   - Add inline citation chip rendering support
   - Parse `[n]` patterns and replace with components

---

## Success Metrics

### Before (Current)
- ❌ No feedback during thinking/tool execution (feels frozen)
- ❌ Citations hidden until completion (user can't preview)
- ⚠️ Occasional janky text rendering during fast token bursts

### After (Target)
- ✅ Real-time thinking panel shows agent reasoning
- ✅ Tool status bar shows "Searching X experiments..." during query
- ✅ Inline `[1]` citations with hover previews
- ✅ Buttery-smooth 60fps token rendering
- ✅ Citations fade in progressively during streaming
- ✅ Professional polish matching Cursor/Claude experience

---

## Next Steps

1. **Review with team**: Confirm priorities align with product goals
2. **Spike thinking panel**: Prototype in 2-3 hours to validate approach
3. **Backend coordination**: Check if tool_status events need backend changes
4. **Design mockups**: Get visual design for thinking panel / tool status bar
5. **Implementation**: Start with Phase 1 (thinking + tool status + smooth rendering)

---

## Open Questions

1. **Thinking Panel UX**: Always visible or auto-collapse after 2 seconds?
2. **Tool Status Position**: Above message or floating top-right in chat container?
3. **Citation Preview Length**: 100 chars or 200 chars in tooltip?
4. **Animation Duration**: 200ms or 300ms for fade-ins?
5. **Backend Changes Required**: Can we emit tool_status without breaking existing clients?

---

**Document Owner**: Claude (AI Assistant)  
**Last Updated**: 2026-05-11  
**Status**: Planning Phase - Awaiting Review
