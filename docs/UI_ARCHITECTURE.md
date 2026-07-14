# Notes9 — Single-Source UI Architecture

_Status: architecture proposal, 2026-07-11. Companion to `docs/UI_UX_SPEC.md` (the audit/spec
baseline). Where the spec describes **what the UI is**, this document defines **where every visual
decision lives** so that changing an element in one place changes it everywhere it appears._

---

## 1. The core principle: one edit point per decision

Every visual/behavioral decision in the product must have **exactly one editable source**. A page
never restates a decision a lower layer already made — it only composes. When this holds, "change
the button" or "make experiments teal instead of blue" is always a one-file edit that propagates
to all 500+ screens for free.

The architecture is a five-layer pyramid. Each layer may only consume the layers below it, and each
layer owns a specific class of decisions:

```
L4  Pages (app/**)                 — composition & data only. Zero styling decisions.
L3  Shell (components/layout/)    — sidebar, header, drawers, transitions. One instance each.
L2  Patterns (components/patterns/)— repeated page-level assemblies: list pages, empty states,
                                     filter rows, heroes, entity cards. ← the layer we must build.
L1  Primitives (components/ui/)   — button, input, card… one file per primitive, variants via cva.
L0  Tokens (app/globals.css)      — color, type, radius, elevation, motion, kind identity.
```

**Edit-point contract** — where a change is made, and what it propagates to:

| You want to change… | Edit exactly this | Propagates to |
|---|---|---|
| Brand palette, dark mode, any color | `app/globals.css` `:root` / `.dark` | Entire app |
| An entity kind's identity color (e.g. experiments blue → teal) | `--kind-*` in `globals.css` | Ribbons, tints, research-map nodes, badges |
| Fonts / type scale | `app/layout.tsx` (next/font) + `--font-*` tokens | Entire app |
| Motion feel (easing, durations, springs) | `--n9-ease`/`--n9-dur-*` + `components/ui/motion.tsx` | All transitions & framer-motion |
| Elevation / shadows | `--n9-elev-*` tokens | All surfaces |
| How a button/input/dialog looks or behaves | The one file in `components/ui/` | Every usage (151 files for button) |
| A section's icon (e.g. Experiments = Flask) | `lib/section-identity.ts` registry | Nav, headings, cards, create menu, empty states |
| The shape of every list page (toolbar, filters, grid/table, empty state) | `components/patterns/resource-list-page.tsx` | All 8+ list surfaces |
| Empty-state look | `components/patterns/empty-state.tsx` | All zero-states |
| Sidebar/header/drawer | `components/layout/*` | Every authenticated page |
| Page content, which filters exist, data wiring | The page in `app/**` | That page only |

If a change requires editing more than one file per row above, the architecture is broken and the
fix is to consolidate — not to edit N call sites.

---

## 2. Current state: what already propagates, what doesn't

**Already single-sourced (keep and protect):**
- **L0 tokens** — all color/type/radius/motion centralized in `app/globals.css`, exposed via
  Tailwind v4 `@theme inline`. Includes `--kind-*` entity colors and `--n9-*` motion/elevation.
- **L1 primitives** — ~46 files in `components/ui/`, shadcn-style, 8 already using `cva` variants.
  Tier-D dead primitives were deleted. `components/ui/icon.tsx` + Phosphor (`/ssr` entry) is the
  single icon pipeline (0 lucide-react imports remain).
- **L3 shell** — `AppLayout`, `AppSidebar`, `RightSidebar`, `PageTransition` are single instances.
- **/ui-gallery** — a living showcase of primitives and interaction states.

**Not single-sourced (the gaps this architecture closes):**
1. **No L2 pattern layer.** Every list page (projects, experiments, samples, protocols, lab notes…)
   hand-assembles hero + `ViewModeToggle` + `ResourceFilterRow` + grid/table + empty state. A change
   to "what a list page looks like" is currently an 8-file edit.
2. **Section identity is scattered.** The icon/kind-color/label for each area is repeated in the nav
   (`lib/app-primary-nav.tsx`), create menu, page headings, empty states, research-map kinds, and the
   gallery — with no shared registry.
3. **Token leaks.** Hardcoded hex survives in `components/layout/app-sidebar.tsx` (sage create-pill
   `bg-[#e4ecd9] text-[#4f5f42]`), `components/text-editor/tiptap-editor.tsx`, and
   `app/(app)/dashboard/dashboard-quick-actions.tsx`; bespoke arbitrary shadows on the sidebars.
4. **Duplicate systems** (flagged in the spec §6): two elevation systems (`shadow-*` vs `--n9-elev-*`),
   two skeletons (`skeleton.tsx` vs `.n9-skeleton-shimmer`), overlay style (solid black) diverging
   from the glass language.
5. **Zero enforcement.** ESLint currently ignores all `.ts/.tsx`, so nothing stops a new hex value,
   an inline re-style of a primitive, or a fresh lucide import from re-fragmenting the system.
6. **Motion primitives live in a feature folder** (`components/literature-reviews/motion.tsx`) but
   are used app-wide — a de-facto shared source in the wrong place.

---

## 3. Layer specifications

### L0 — Tokens (`app/globals.css`)

The token sheet is the constitution. Rules:

- **Semantic only at point of use.** Components consume `bg-primary`, `text-muted-foreground`,
  `var(--kind-experiment)` — never raw hex, `oklch`, or Tailwind palette colors (`bg-amber-500`).
- **Every token exists in both `:root` and `.dark`.** A token missing a dark value is a bug.
- **Token groups** (all already present, listed for the contract):
  core semantic (`--background`…`--ring`) · extended semantic (`--color-success/warning/info/error`)
  · brand accent (`--n9-accent*`) · sidebar set (`--sidebar*`) · charts (`--chart-1..5`) · glass
  (`--glass-*`) · elevation (`--n9-elev-1/2/3`) · motion (`--n9-ease`, `--n9-dur-fast/base/slow`)
  · type scale (`--font-size-*`, `text-2xs/micro/3xs/mini`) · **entity kinds (`--kind-*`)**.
- **Consolidations to finish** (one-time, from spec §6):
  - Elevation: primitives migrate from `shadow-xs/sm/md/lg` to the `--n9-elev-*` scale (map:
    `shadow-xs/sm → n9-elev-1`, `md → n9-elev-2`, `lg → n9-elev-3`). One shadow language.
  - Skeleton: `.n9-skeleton-sweep` shimmer is canonical; `skeleton.tsx` wraps it (done in the
    "Modernize skeletons" commit — keep `animate-pulse` skeletons from reappearing).
  - New tokens for currently-hardcoded identities: `--create-pill-bg` / `--create-pill-fg`
    (the sage create button), editor-specific colors used by tiptap.

### L1 — Primitives (`components/ui/`)

One file per primitive; the file is the *only* place that primitive's appearance is defined.

- **Variants over overrides.** If a usage needs a different look, add a `cva` variant (like
  button's 7 variants / 6 sizes, card's 4 variants, `dialogSize`) — never patch with `className`
  at the call site. `className` passthrough is for **layout only** (margins, width, grid placement),
  never for color/radius/shadow/typography. This is the single most important discipline: a
  color-overriding `className` at a call site silently forks the primitive.
- **Styling from tokens only** — semantic utilities and `var(--*)`. No hex, no `bg-amber-500`,
  no arbitrary `shadow-[…]` (use `.n9-elev-*`).
- **Interaction grammar is baked in** (focus ring `ring-ring/50 ring-[3px]`, disabled, invalid,
  `.n9-press`, reduced-motion fallbacks) so call sites never re-implement states.
- **Icons:** all through `components/ui/icon.tsx` + `@phosphor-icons/react/ssr`. Primitives auto-
  size unclassed svgs (`size-4`, badge `size-3`); use `size-*` shorthand exclusively.
- Every primitive (and every new variant) appears in `/ui-gallery` — a variant that isn't in the
  gallery doesn't exist.

### L2 — Patterns (`components/patterns/` — NEW)

This is the missing layer and the highest-value build. Patterns are the repeated **assemblies**
that today are copy-pasted across pages. Once they exist, "change how all list pages work" becomes
a one-file edit, exactly like button already is.

Create `components/patterns/` and move/build:

| Pattern | Source today | What it owns |
|---|---|---|
| `resource-list-page.tsx` | Hand-assembled in projects/experiments/samples/protocols/lab-notes/reports | The full list-page skeleton: optional `CatalystSectionHero` slot, toolbar (`ViewModeToggle` + search + sort slot), `ResourceFilterRow`, grid/table body via render props, loading skeleton, empty state. Pages pass: section id, data, card/row renderers, filter defs. |
| `entity-card.tsx` | Per-page card markup (project-list, experiment-list, samples…) | The signature card: kind ribbon (`--kind-*`), identity icon, title `line-clamp-2`, meta row (`text-2xs`), hover/press motion. Variants per density. |
| `empty-state.tsx` | `ui/empty.tsx` + per-page centered cards | Icon chip, serif heading, description, primary action. Takes a section id to auto-derive icon/color. |
| `page-header.tsx` | `ui/page-heading.tsx` + per-page action rows | `PageHeading` + actions slot + optional description, standard spacing; sets breadcrumb via `SetPageBreadcrumb`. |
| `section-hero.tsx` | `components/catalyst/catalyst-section-hero.tsx` | Stays one component; moves here since it's a cross-section pattern themed by `scope`. |
| `status-badge.tsx` | Ad-hoc `Badge` + color per page | Maps domain statuses (sample `available/in_use/depleted/disposed`, experiment states…) to badge variants in one lookup. |
| `motion.tsx` (move to `components/ui/`) | `components/literature-reviews/motion.tsx` | `SPRING`, `EASE_OUT`, `MotionReveal`, `MotionList/Item`, `MotionTabPanel`, `MotionFloating`, `MotionResultCard`. Re-export from the old path during migration. |
| `confirm-dialog.tsx` | Repeated `AlertDialog` scaffolds (31 files) | One destructive-confirm API: `<ConfirmDialog title description onConfirm destructive>`. |

**Pattern rules:** patterns consume only L0/L1 (+ registries, §4); they expose *slots and render
props*, not styling props. A page can inject content, never colors.

### L3 — Shell (`components/layout/`)

Already single-sourced; the contract is simply: **one instance each** of sidebar, header,
right drawer, breadcrumb system, page transition. Delete `left-sidebar.tsx` (spec-confirmed dead
code) so it can't be built against. Shell consumes registries (§4) for nav items rather than
declaring identity inline.

### L4 — Pages (`app/**`)

Pages are wiring: data fetching, state, and composition of L2/L3. Concretely:

- A page may not contain a hex color, a `shadow-[…]`, a bespoke card body, or a re-styled primitive.
- A page that needs something visual that doesn't exist yet **promotes it downward**: one-off →
  keep local *only* if genuinely unique to that surface (whiteboard, spreadsheet, PDF stack, graph
  canvas); used twice → it becomes a pattern; used everywhere → primitive/token.
- The distinctive per-area surfaces (dashboard whiteboard, Univer workbook, PDF reading stack,
  Catalyst chat, research-map canvas) stay area-local by design — but their *chrome* (cards,
  toolbars, empty states, buttons) still comes from L1/L2.

---

## 4. Registries: identity defined once

Two small data modules make cross-cutting identity a one-line edit:

**`lib/section-identity.ts`** — the single map of every product area:

```ts
export const SECTIONS = {
  dashboard:   { label: "Dashboard",   icon: House,      kind: null },
  projects:    { label: "Projects",    icon: FolderOpen, kind: "project" },
  experiments: { label: "Experiments", icon: Flask,      kind: "experiment" },
  labNotes:    { label: "Lab notes",   icon: Notebook,   kind: "note" },
  protocols:   { label: "Protocols",   icon: ClipboardText, kind: "protocol" },
  samples:     { label: "Samples",     icon: TestTube,   kind: "sample" },
  data:        { label: "Data",        icon: Database,   kind: null },
  literature:  { label: "Literature",  icon: BookOpen,   kind: "literature" },
  catalyst:    { label: "Catalyst",    icon: Sparkle,    kind: null },
  researchMap: { label: "Research map", icon: Graph,     kind: null },
} as const
// kind → colors resolve to var(--kind-<kind>); icons from @phosphor-icons/react/ssr
```

Consumers: `lib/app-primary-nav.tsx`, the sidebar create menu, `page-header`, `empty-state`,
`entity-card` ribbons, `lib/research-map-kinds`, breadcrumbs, `/ui-gallery`. Renaming a section or
swapping its icon touches exactly this file.

**`lib/status-registry.ts`** — domain status → `{ label, badgeVariant, dotColor }` for samples,
experiments, protocols, reports. Kills per-page status-color switch statements.

---

## 5. Enforcement: making drift impossible, not just discouraged

A single-source system decays without guardrails — the current hex leaks prove it. Three tiers:

1. **Lint (the real fix).** Add `typescript-eslint` + `eslint-config-next` and extend
   `eslint.config.mjs` to cover `.tsx` with:
   - `no-restricted-imports`: ban `lucide-react` (Phosphor only), ban `@phosphor-icons/react`
     main barrel (must be `/ssr` — it crashes Server Components), ban importing
     `components/literature-reviews/motion` after the move.
   - `no-restricted-syntax`: ban hex literals (`#[0-9a-f]{3,8}`) in `className`/style values, ban
     `bg-[#`, `shadow-[`, and Tailwind palette classes (`bg-(red|amber|…)-\d+`) outside
     `globals.css`, `components/marketing/`, and `components/brand/` (allowed islands).
   - Restrict `app/**` from importing Radix directly — pages go through `components/ui`.
2. **CI check (available today, before the ESLint upgrade).** A ~20-line `scripts/check-ui-drift.sh`
   grepping for the same violations, wired into the pre-push hook / CI. Cheap and immediate.
3. **Review contract.** `/ui-gallery` is the visual contract: any L0/L1/L2 change is reviewed by
   loading the gallery (and its dark mode) — if the change isn't visible there, add it to the
   gallery in the same PR. New `className` on a primitive call site that mentions color/shadow/
   radius/font is an automatic review flag: "should this be a variant?"

---

## 6. Change playbook (day-to-day usage)

- **"Make all buttons rounder"** → `components/ui/button.tsx` (or `--radius` if global).
- **"New button style for AI actions"** → add a `variant: "ai"` to button's cva + gallery entry.
  Do **not** write `className="bg-gradient…"` at a call site.
- **"Samples should feel teal"** → `--kind-sample` in `globals.css` (light + dark).
- **"All list pages get a density toggle"** → `components/patterns/resource-list-page.tsx` once.
- **"Rename Lab notes → Notebook"** → `lib/section-identity.ts`.
- **"Snappier animations"** → `--n9-dur-*` tokens + `SPRING` in the shared motion module.
- **"This page needs a special card"** → build it *in the page*, flag it; the second page that
  wants it moves it to `components/patterns/`.

---

## 7. Migration plan (incremental, each step ships independently)

1. **Guardrails first** — `scripts/check-ui-drift.sh` + CI wiring, so the codebase stops getting
   worse while the rest lands. Then the real ESLint upgrade.
2. **Fix known leaks** — tokenize the sidebar create-pill, dashboard quick-actions, tiptap colors;
   replace bespoke sidebar shadows with `--n9-elev-*`; delete `components/layout/left-sidebar.tsx`.
3. **Registries** — `lib/section-identity.ts` + `lib/status-registry.ts`; rewire nav, create menu,
   research-map kinds, gallery.
4. **Consolidate duplicates** — one elevation system, one skeleton, frost the dialog overlays to
   match the glass language (spec §6).
5. **Promote motion** — move `motion.tsx` to `components/ui/`, re-export from the old path, migrate
   the 27 importers mechanically.
6. **Build L2 patterns** — `empty-state` and `page-header` first (small, wide reach), then
   `entity-card` + `status-badge`, then the big one: `resource-list-page`. Migrate one page
   (projects) as the proof, then the remaining list pages one PR each.
7. **Gallery as contract** — add a Patterns section to `/ui-gallery` (list-page skeleton, entity
   cards per kind, empty states, status badges) so L2 is visible and reviewable like L1 already is.

Steps 1–5 are days of work each at most; step 6 is the bulk and pays the recurring dividend: after
it, the entire product's look is editable from `globals.css` + ~46 primitives + ~8 patterns +
2 registries — every element defined once, changed once, propagated everywhere.
