# Notes9 — Architecture

Frontend architecture reference. Pair with the catalyst backend's `ARCHITECTURE.md` for the full picture.

## Component hierarchy

```
app/layout.tsx                                          // root: fonts, theme provider, Supabase preconnect
  └─ <body>
      └─ ThemeProvider (next-themes)
          └─ RumProvider
              ├─ NavigationLoader                        // top progress bar on route change
              └─ {children}
                  └─ app/(app)/layout.tsx                // auth gate (Supabase getUser → redirect)
                      ├─ TermsAcceptanceModal            // if user_metadata.terms_accepted_version mismatch
                      ├─ AuthEventTracker (Suspense)
                      └─ AppLayout
                          ├─ AppSidebar                  // primary nav, recent projects
                          ├─ Topbar                      // breadcrumb, theme toggle, AI sheet button
                          ├─ <main>
                          │   └─ PageTransition          // keyed on usePathname(), CSS fade+lift
                          │       └─ {route content}
                          └─ RightSidebar / AI Sheet     // catalyst chat panel
```

The `(app)` route group enforces auth: `app/(app)/layout.tsx` calls `supabase.auth.getUser()` and redirects unauthenticated users to `/auth/login` before any feature route renders.

## Catalyst AI chat flow

Catalyst is the brand name for the AI assistant. End-to-end:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Catalyst Chat Panel                                                         │
│                                                                              │
│  ┌─────────────────────────┐    ┌──────────────────────────────────────┐   │
│  │ CatalystInput           │───▶│ useAgentStream                       │   │
│  │ (user types prompt)     │    │   - POST ${NEXT_PUBLIC_CHAT_API_URL} │   │
│  └─────────────────────────┘    │     /notes9/stream                   │   │
│                                  │   - reads SSE events                │   │
│                                  │   - drives state machine            │   │
│                                  └────────────┬─────────────────────────┘   │
│                                               │                              │
│                                               ▼                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ AgentStreamReply                                                     │  │
│  │   ├─ AgentFlowPipeline    (Understand → Search → Analyze → Answer)  │  │
│  │   ├─ AgentThinkingBar     (one-line status)                          │  │
│  │   ├─ MarkdownRenderer     (streamed answer with [N] citations)      │  │
│  │   ├─ AgentToolCards       (collapsible tool details, post-stream)   │  │
│  │   └─ AgentCitationsPanel  (retrieved sources list)                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Stream events

`hooks/use-agent-stream.ts` parses Server-Sent Events from `${NEXT_PUBLIC_CHAT_API_URL}/notes9/stream`. The state machine handles:

| Event | Updates |
|-------|---------|
| `thinking` | `thinkingSteps`, `currentStage`, `currentThinkingMessage`, `currentThinkingDetail` |
| `tool_start` | Appends a `ToolCard` with `status: 'running'` |
| `tool_result` / `tool_call` | Updates the matching card to `status: 'done' | 'error'`, fills `summary`, `source_names`, `citations_count`, `latency_ms`, `row_count` |
| `rag_chunks` | `ragChunks` (retrieved-source list) |
| `sql` | `sql` (SQL query string for inspection) |
| `text_token` | Appends to `streamedAnswer` |
| `done` | `donePayload` — final `content`, `resources`, `citations`, `confidence`, `tool_used` |

`ThinkingStage` is the union `'understanding' | 'searching' | 'analyzing' | 'synthesizing' | 'composing' | 'validating' | 'done'`. The pipeline collapses these seven to four visual stages.

### State types

All payload shapes live in `lib/agent-stream-types.ts` and mirror what the catalyst backend emits. Keep this file in sync with the backend's SSE schema.

## ReAct pipeline visualization

`components/catalyst/agent-flow-pipeline.tsx` renders a fixed-size horizontal rail inside the chat bubble. It is purely passive — no zoom, no node selection, no graph library.

```
●─── Understand ───●─── Search ───●─── Analyze ───●─── Answer
                       ▲                ▲
                       │                │
                    [chips]          [chips]
                  (tools that fired during each stage)
```

- **Stage collapse**: seven backend stages → four pipeline nodes:
  - `understanding` → Understand
  - `searching` → Search
  - `analyzing`, `synthesizing` → Analyze
  - `composing`, `validating`, `done` → Answer
- **Active connector**: the connector immediately before the active node carries an animated linear-gradient (`animate-flow-pipeline` keyframes in `app/globals.css`). Parent is transparent while streaming so the shimmer is visible.
- **Tool chips**: each `ToolCard` is bucketed under the stage its tool belongs to (`stageOf` map). Chips show a Lucide icon, a short label ("Records", "Documents", "Linked", etc.), and a source count.
- **`isDone` semantics**: the Answer node displays the checkmark the moment `stage === 'done'`, regardless of whether the final-token stream is still in flight.

## Sample molecular viewer

`app/(app)/samples/[id]/sample-molecular-files-tab.tsx` is the orchestrator. It uploads files to Supabase storage, signs URLs on demand, and renders one of two heavy viewers based on `file_kind` from `lib/sample-molecular.ts`.

### Two-path rendering

| `file_kind` | Component | Library | File types |
|------------|-----------|---------|------------|
| `plasmid`, `sequence` | `SamplePlasmidViewer` | `seqviz`, `@teselagen/bio-parsers` | `.dna`, `.gb`, `.gbk`, `.fasta`, `.fa`, `.fna`, `.json` |
| `protein_structure` | `SampleProteinViewer` | `molstar` | `.pdb`, `.cif`, `.mmcif`, `.ent` |

Both viewers are dynamically imported with `ssr: false`. They are multi-MB bundles and would block the main thread if synchronously imported.

### WebGL context lifecycle (Mol*)

Browsers cap active WebGL contexts at ~16. Without explicit disposal, Mol* leaks the canvas + context on every file switch, and the page becomes unrecoverable after a few switches. `sample-protein-viewer.tsx` handles this:

```tsx
return () => {
  cancelled = true
  const viewer = viewerRef.current ?? localViewer
  viewerRef.current = null
  try {
    viewer?.plugin?.canvas3d?.pause?.()
    viewer?.plugin?.dispose?.()
  } catch {}
  // Mol* leaves its <canvas> child in the host after dispose. Clearing it
  // lets the GPU release the WebGL context.
  if (host) {
    try {
      while (host.firstChild) host.removeChild(host.firstChild)
    } catch {}
  }
}
```

The `localViewer` capture covers the race where mount completes after the effect's cleanup ran.

### Signed-URL refresh

Selecting a file triggers an effect that re-signs the storage URL (1h TTL). The previous URL is discarded; in-flight requests are cancelled with a `cancelled` flag and a `try/finally` resets `signedUrlLoading` even on error (otherwise the viewer pane gets stuck on "Preparing secure viewer…" forever).

### Alignment safety guard

`SamplePlasmidViewer.runAlignment` refuses to align pairs larger than 25M DP cells (~5kbp × 5kbp). The DP algorithm in `lib/sample-molecular.ts` allocates an O(query × subject) main-thread array; without the guard, aligning two 10kbp plasmids would freeze the tab.

## TipTap editor pattern

`components/text-editor/tiptap-editor.tsx` is shared by lab notes and protocols. Both features pair it with:

- A **siblings list** on the left (notes for an experiment, protocols in scope).
- The TipTap toolbar (formatting, math, citations).
- A **bottom approval bar** (`components/content-change-approval-bar.tsx`) that handles save state, diff history, and version bumps.

The protocol design mode (`components/protocols/protocol-design-mode.tsx`) and lab-notes tab (`app/(app)/experiments/[id]/lab-notes-tab.tsx`) deliberately use the same flex chain — `<div flex-1 min-h-0 flex flex-col><Card flex h-full min-h-0 flex-col gap-0 py-0><div ref=workspace flex flex-row>…</div></Card></div>` — so the visual rhythm matches.

The siblings panel toggles on a small `ChevronLeft`/`List` button in the editor header. On mobile, the list moves into a left `<Sheet>` overlay.

## Data flow & state

- **Server components** (default in App Router) fetch from Supabase via `lib/supabase/server.ts`. Server-side fetches run in parallel via `Promise.all` (see `app/(app)/dashboard/page.tsx`).
- **Client components** (`"use client"`) mutate via `lib/supabase/client.ts` and `router.refresh()` after success.
- **Catalyst stream** is the only long-lived bidirectional flow; it lives entirely in `useAgentStream` and is consumed by `components/catalyst/`.

## Storage

`lib/user-storage-bucket.ts` defines a single bucket `user` and the path convention:

```
<organization_id>/<scope>/<resource_id>/<file_id>/<filename>
```

Examples:
- `org-123/samples/<sample_id>/<file_id>/plasmid.dna`
- `org-123/experiments/<experiment_id>/<file_id>/data.csv`

Signed URLs are generated on demand via `createSampleFileSignedUrl(supabase, path, 3600)`. The path is stored in the DB row (not the signed URL itself), so URLs can be re-signed indefinitely.

## Page transitions

`components/layout/page-transition.tsx` keys on `usePathname()` and re-mounts the subtree on every route change, applying the `animate-page-transition` class for 240ms. The CSS is pure GPU-cheap (opacity + 4px transform):

```css
@keyframes page-transition {
  from { opacity: 0; transform: translate3d(0, 4px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
.animate-page-transition {
  animation: page-transition 240ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;
}
```

`@media (prefers-reduced-motion: reduce)` disables `animate-page-transition`, `animate-flow-pipeline`, and `animate-cursor-blink`. First paint after hydration is excluded via a `firstPaint` ref so users don't see a flash on initial load.

## Performance budget

| Optimisation | File | Effect |
|--------------|------|--------|
| Supabase preconnect | `app/layout.tsx` (`<head>`) | TCP+TLS handshake overlaps HTML parsing; ~200–400ms off first DB hit |
| `optimizePackageImports` | `next.config.mjs` (`experimental`) | Tree-shakes `lucide-react`, `date-fns`, `@radix-ui/react-icons`, `recharts` barrel modules |
| Dashboard query reduction | `app/(app)/dashboard/page.tsx` | Cut 9 round-trips to 3 by dropping unused profile/stats/graph fetches |
| Dynamic imports | Mol*, SeqViz, mammoth, `@teselagen/bio-parsers` | Multi-MB libraries load only when their viewer mounts |
| TIFF caching | `components/experiments/experiment-data-preview-dialog.tsx` | UTIF decodes once; pages cached as PNG blob URLs |
| CSS-only transitions | `app/globals.css` | No framer-motion in the bundle |

## Testing & quality

- Unit tests: `pnpm test` (Vitest). Tests live in `__tests__/`.
- Type check: `pnpm exec tsc --noEmit --skipLibCheck`. The one expected error is in `components/marketing/status-section.tsx` (excluded from audits by project convention).
- Manual smoke tests: see `TESTING_GUIDE_STREAMING.md` for the catalyst stream regression set.

## Build gotchas (Turbopack 16)

Turbopack's NFT (Node File Tracing) emitter cannot serialise `node:`-prefixed Node builtins. Any transitive dep that imports `node:worker_threads`, `node:fs`, etc., will fail the production build with:

```
NftJsonAsset: cannot handle filepath node:worker_threads
```

Known offenders historically pulled into this repo:

| Package | Chain | Resolution |
|---------|-------|-----------|
| `md-to-docx` | → `@m2d/mermaid` → `mermaid` → `@mermaid-js/parser` → `langium` | Removed — was never imported in code |
| `isomorphic-dompurify` | → `jsdom` → `undici` | Replaced with plain `dompurify` |

Before adding a new dependency, check `pnpm why <package>` against the offenders above. The `next.config.mjs` `turbopack.resolveAlias` already stubs `worker_threads`, `node:worker_threads`, `node:fs`, and `node:path` for the browser channel as a safety net, but server-side traces still need clean transitive graphs.
