---
title: Tiptap Editor
created: 2026-06-24
updated: 2026-06-24
status: current
---

# Tiptap Editor

Notes9 uses **Tiptap v3** as the rich text editor for lab notes, protocols, and inline content editing. This document covers the installed extensions, data storage format, collaboration setup, and lab-note specific considerations.

---

## Overview

Tiptap is an MIT-licensed, headless rich text editor built on ProseMirror. Notes9 uses it in place of BlockSuite (which had incompatibility issues with Next.js 16 Turbopack — see `docs/archive/blocksuite-integration-strategy.md`).

**Installed version:** `@tiptap/core ^3.17.1` (see `package.json`)

---

## Installed Extensions

The following extensions are active in the project (from `package.json`):

| Extension | Package | Purpose |
|-----------|---------|---------|
| Starter Kit | `@tiptap/starter-kit` | Bundled: Bold, Italic, Strike, Heading, Paragraph, Lists, Code, Blockquote, History, HardBreak, HorizontalRule |
| Tables | `@tiptap/extension-table`, `-table-row`, `-table-cell`, `-table-header` | Data tables for experiment results |
| Mathematics | `@tiptap/extension-mathematics` | LaTeX/KaTeX inline and block equations |
| Image | `@tiptap/extension-image` | Microscopy images, charts |
| Link | `@tiptap/extension-link` | Citations, protocol references |
| Underline | `@tiptap/extension-underline` | |
| Highlight | `@tiptap/extension-highlight` | Color-coded results |
| Subscript / Superscript | `@tiptap/extension-subscript`, `@tiptap/extension-superscript` | Chemical formulae (H₂O), exponents |
| Text Style | `@tiptap/extension-text-style` | Custom style wrapper for color |
| Color | `@tiptap/extension-color` | Text color |
| Task List / Task Item | `@tiptap/extension-task-list`, `@tiptap/extension-task-item` | Experiment checklists |
| Placeholder | `@tiptap/extension-placeholder` | Empty-state hint text |
| Mention | `@tiptap/extension-mention` | @-mention teammates |
| Collaboration | `@tiptap/extension-collaboration` | Real-time multi-user editing via Yjs |
| Collaboration Cursor | `@tiptap/extension-collaboration-cursor` | Show peer cursors |
| y-tiptap | `@tiptap/y-tiptap` | Yjs ↔ Tiptap binding |

**Custom extension:** `lib/table-extension.ts` — adds a width attribute to table cells for the custom resize UI.

---

## Custom Table Controls

`components/text-editor/table-controls.tsx` implements the drag-resize and add/delete row/column UI on top of the standard Tiptap table extension. Controls appear on hover; resize handles are blue; delete buttons are red.

---

## Data Storage Format

Lab notes store rich content as Tiptap JSON in the `editor_data` JSONB column of the `lab_notes` table. The legacy `content` column holds plain text for older records.

```typescript
// Schema fragment (from scripts/000_full_script.sql)
// lab_notes.editor_data: JSONB (Tiptap JSON)
// lab_notes.content: TEXT (legacy plain text / HTML)
// lab_notes.draft_content: TEXT (autosave draft — see Lab Note draft/commit model)
```

### Tiptap JSON shape

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "Observations" }]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "marks": [{ "type": "bold" }], "text": "Sample ABC-123" },
        { "type": "text", "text": " showed positive reaction." }
      ]
    }
  ]
}
```

### Draft / Commit model

Tiptap's `onUpdate` event triggers an autosave to `draft_content`. An explicit "Save" action commits to the canonical `content` column and writes a `document_versions` audit row. See `docs/GLOSSARY.md` → "Lab Note" for the full model.

---

## Collaboration (Real-time)

Notes9 uses **HocusPocus** (`@hocuspocus/provider ^3.4.3`) as the Yjs WebSocket backend. This runs as a separate `collaboration-server/` service (sibling directory, its own `package.json`).

Connection URL is set via `NEXT_PUBLIC_COLLABORATION_URL`.

The main Next.js app and the collaboration server are **separate deployments**. The `next.config.mjs` `ignoreBuildErrors: true` flag exists partly because the collaboration server's packages (`@tiptap/html`, `y-prosemirror`) are not installed in the Vercel Next.js build, and `tsconfig.json` excludes `collaboration-server/`.

---

## Responsive Design

| Breakpoint | Toolbar behavior |
|-----------|-----------------|
| ≥ 1024px (desktop) | Full horizontal toolbar |
| 768–1023px (tablet) | Scrollable condensed toolbar |
| < 768px (mobile) | Bottom sheet toolbar |

Touch targets are 44×44 px minimum. Long-press opens context menus.

---

## Bundle Size Notes

| Group | Approx. gzipped |
|-------|----------------|
| `@tiptap/core` + `@tiptap/react` | ~45 KB |
| `@tiptap/starter-kit` | ~25 KB |
| Table extensions (4 packages) | ~20 KB |
| `@tiptap/extension-mathematics` + `katex` | ~160 KB |
| Collaboration (`yjs`, etc.) | ~100 KB |

Heavy extensions (KaTeX, collaboration) should be lazy-loaded when the feature is not immediately needed.

---

## Search

The `editor_data` column carries a GIN index for JSONB containment queries:

```sql
-- Full-text search across lab notes (from scripts/)
SELECT * FROM lab_notes
WHERE editor_data::text ILIKE '%glucose%';
```

> TODO: confirm whether the `content_search_vector` tsvector column is applied in production or only proposed in the integration plan.

---

## Resources

- [Tiptap Documentation](https://tiptap.dev/docs)
- [Tiptap Extensions Reference](https://tiptap.dev/extensions)
- [HocusPocus (collaboration server)](https://hocuspocus.dev/docs)
- Notes9 table extension: `lib/table-extension.ts`
- Notes9 custom controls: `components/text-editor/table-controls.tsx`
