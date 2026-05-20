# Notes9

Next.js 16 frontend for an electronic lab notebook (ELN). Researchers organise projects, experiments, samples, lab notes, protocols, literature reviews, and equipment in one workspace, with an embedded AI assistant ("Catalyst") that reasons over their data and external biomedical sources.

The backend lives in a separate repo (`AI/catalyst`, FastAPI + AWS Bedrock). This repo is the React + Supabase client and the SSE consumer for the agent stream.

## Stack

- **Framework**: Next.js 16.0.7 (App Router, React 19, Turbopack build)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4, shadcn/ui (Radix primitives + lucide-react)
- **Database & Auth**: Supabase (Postgres, RLS, Storage) — `@supabase/ssr`, `@supabase/supabase-js`
- **Rich text**: TipTap 3 (lab notes, protocols)
- **Molecular viewers**: SeqViz (DNA plasmid maps), Mol* (`molstar`, protein structures), UTIF (TIFF preview), `@teselagen/bio-parsers` (sequence parsing)
- **Spreadsheets**: Univer (`@univerjs/preset-sheets-*`)
- **HTML sanitisation**: `dompurify` (browser-only; do not switch back to `isomorphic-dompurify` — see "Build gotchas")
- **AI stream**: single `useAgentStream` hook on top of the Fetch streaming API
- **Package manager**: pnpm 10

## Quickstart

```bash
# Prerequisites: Node 20+, pnpm 10
pnpm install
pnpm dev   # http://localhost:3000
```

Required environment variables in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role>     # server-only mutations
CHAT_API_URL=https://<catalyst-host>         # Catalyst SSE endpoint
```

`CHAT_API_URL` is re-exported to the browser as `NEXT_PUBLIC_CHAT_API_URL` via `next.config.mjs`, so the client can call catalyst directly and bypass Vercel's function timeout for long SSE streams.

## Directory map

| Path | Role |
|------|------|
| `app/` | Next.js App Router |
| `app/(app)/` | Authenticated app group. Layout gates auth and wraps with `AppLayout`. |
| `app/(app)/dashboard|projects|experiments|samples|lab-notes|protocols|literature-reviews|papers|reports|equipment|settings|catalyst|research-map/` | Feature routes |
| `app/(marketing)/`, `app/(legal)/`, `app/marketing/` | Public pages |
| `app/api/` | Server route handlers (e.g. data-transfer import) |
| `components/layout/` | App shell — sidebar, topbar, breadcrumb, `PageTransition` |
| `components/catalyst/` | AI chat UI — stream consumer, ReAct pipeline visual, citations, tool cards |
| `components/text-editor/tiptap-editor.tsx` | Shared TipTap editor (lab notes + protocols) |
| `components/protocols/` | Protocol design mode, siblings list, template picker |
| `components/lab-notes/` | Lab note tab, scientific calculator, formula tools |
| `components/experiments/` | Experiment data file preview, tabular spreadsheet dialog |
| `components/research-map/` | Cytoscape entity-relationship graph |
| `components/spreadsheet/` | Univer spreadsheet wrappers |
| `components/ui/` | shadcn primitives |
| `hooks/use-agent-stream.ts` | SSE state machine for the catalyst stream |
| `lib/supabase/` | Client/server Supabase factories |
| `lib/sanitize-html.ts` | DOMPurify sanitiser + `escapeHtml` |
| `lib/agent-stream-types.ts` | TS types mirroring the backend SSE payloads |
| `lib/document-highlight.ts` | Citation → scroll-target linking |
| `lib/sample-molecular.ts` | DNA alignment, CRISPR scan, file-kind inference |
| `lib/user-storage-bucket.ts` | Supabase storage path conventions, signed URL helper |
| `types/custom-modules.d.ts` | Ambient module decls (utif, html-docx-js, pdfjs-dist) |
| `next.config.mjs` | Turbopack aliases, optimizePackageImports, image config |
| `app/globals.css` | Tailwind v4 theme + keyframes. Honours `prefers-reduced-motion`. |
| `proxy.ts` | Edge proxy for SSE — bypasses serverless function timeouts |
| `__tests__/`, `vitest.config.ts` | Vitest tests |
| `scripts/0xx_*.sql` | Database migrations (Supabase) |

## Key pages

- `app/(app)/dashboard` — recent experiments, recent notes, todo panel
- `app/(app)/projects/[id]` — project overview with linked experiments, samples, notes
- `app/(app)/experiments/[id]` — tabbed view: overview, steps, protocols & assays, samples, data & files, lab notes
- `app/(app)/samples/[id]` — sample detail with molecular files tab (plasmid / protein structure viewer)
- `app/(app)/protocols/[id]` — protocol view; `?design=1` opens the two-pane editor
- `app/(app)/lab-notes/[id]` — full-page lab note editor
- `app/(app)/catalyst` — AI assistant chat
- `app/(app)/research-map` — entity-relationship graph (Cytoscape)

## Testing

```bash
pnpm test            # vitest
pnpm test:watch
pnpm exec tsc --noEmit --skipLibCheck   # type check
```

One pre-existing TS error in `components/marketing/status-section.tsx` is expected; marketing is excluded from audits by project convention.

## Production build

```bash
rm -rf .next && pnpm build
pnpm start
```

The build uses Turbopack. If you hit `NftJsonAsset: cannot handle filepath node:worker_threads`, the cause is a transitive dep importing `node:`-prefixed builtins — see "Build gotchas".

## Build gotchas

- **Do not reinstall `md-to-docx`**. It pulls `mermaid → @mermaid-js/parser → langium`, which imports `node:worker_threads` and breaks the Turbopack NFT tracer.
- **Use `dompurify`, not `isomorphic-dompurify`**. The isomorphic variant pulls `jsdom → undici → node:worker_threads`. All in-app callers of `sanitizeHtml` are client components, and the one server caller (`app/api/data-transfer/import/route.ts`) only uses `escapeHtml`.
- **Keep `next.config.mjs` `serverExternalPackages` tight**. Adding seqviz / molstar / pdfjs-dist / `@univerjs/*` breaks the build (`.css` and ESM-only sub-imports). Only externalise a package when you have evidence it's part of a `node:`-prefix trace error.
- Mol* and SeqViz are loaded with `next/dynamic` + `ssr: false`. Their dispose paths must run on unmount or browser WebGL context limits (~16) will exhaust after a few file switches. See `ARCHITECTURE.md`.

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — component hierarchy, catalyst stream flow, ReAct pipeline visualization, molecular viewer lifecycle, page transitions, performance budget.

## Conventions

- Server components fetch from Supabase; client components mutate via the JS client.
- Storage paths follow `<org_id>/<scope>/<resource_id>/<file_id>/<filename>` (`lib/user-storage-bucket.ts`); signed URLs generated on demand (3600s TTL).
- Inline `[N]` citations in AI responses are clickable and scroll the referenced source into view via `lib/document-highlight.ts`.
- Tailwind animations honour `prefers-reduced-motion` and are GPU-cheap (opacity + transform only).
