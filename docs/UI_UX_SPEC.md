# Notes9 — Platform UI/UX Specification & Component Inventory

_Status: reference / audit baseline for the UI/UX revamp. Generated 2026-07-03 from a static
analysis of `app/`, `components/`, `hooks/`, and `app/globals.css`. Line references are accurate
as of this commit; treat them as anchors, not guarantees._

This document has two jobs:
1. **Rank every UI component** by how heavily it's used and how broadly it spreads across the
   product, so the revamp starts where the blast radius is largest and defers what's cheap.
2. **Specify the design system in full** — tokens, typography, motion, icons, every primitive's
   variants, the app shell, and the per-page UX — down to exact classes, pixel values, durations,
   and easing.

**How usage was measured.** For each of the 69 files in `components/ui/`, we counted the number
of `.ts/.tsx` files that import `@/components/ui/<name>` across `app/`, `components/`, `hooks/`
(529 files scanned), and how many of the ten product areas the user named (dashboard, projects,
experiments, lab-notes, protocols, samples, data, literature, catalyst, research-map) contain at
least one importer. "Files" = reach; "Areas" = spread. A component can have real reach but 0 area
spread if it lives only in the shell / settings / org / auth (counted but outside the ten areas).

---

## 1. Component usage ranking (revamp priority order)

Ranked by reach (importing files), then spread (product areas). The **Priority** column is the
recommended revamp order: foundational components touch everything, so restyling them propagates
for free; the long tail is cheap to change and low-value, so it's deferred or deleted.

### Tier S — Foundational (do first; every change propagates platform-wide)
| Rank | Component | Files | Areas | Notes |
|---|---|---|---|---|
| 1 | **button** | 151 | 10 | The single most-used primitive; in all ten areas. Any button restyle is the highest-leverage change in the app. |
| 2 | **input** | 60 | 8 | Every form/filter/dialog. |
| 3 | **card** | 58 | 8 | The dominant surface — list cards, dashboard widgets, empty states. |
| 4 | **label** | 58 | 8 | Pairs with every input. |
| 5 | **select** | 51 | 9 | Filters and forms everywhere; widest spread after button. |
| 6 | **badge** | 42 | 8 | Status/metadata chips across all lists. |
| 7 | **dialog** | 36 | 8 | Create/edit/confirm modals. |
| 8 | **alert-dialog** | 31 | 8 | Destructive confirmations. |

### Tier A — Core (high reach or broad spread; do second)
| Rank | Component | Files | Areas |
|---|---|---|---|
| 9 | **textarea** | 24 | 5 |
| 10 | **table** | 22 | 7 |
| 11 | **checkbox** | 17 | 8 |
| 12 | **dropdown-menu** | 17 | 5 |
| 13 | **tabs** | 15 | 7 |
| 14 | **page-heading** | 15 | 6 |
| 15 | **view-mode-toggle** | 11 | 6 |
| 16 | **alert** | 11 | 5 |
| 17 | **tooltip** | 11 | 4 |
| 18 | **separator** | 10 | 2 |
| 19 | **resource-list-filters** | 8 | 7 | Broad spread (the shared filter row on every list page). |

### Tier B — Supporting (moderate; restyle opportunistically or when touching the host feature)
| Component | Files | Areas | Scope note |
|---|---|---|---|
| scroll-area | 8 | 4 | |
| textarea-with-word-count | 8 | 4 | |
| sheet | 6 | 5 | Mobile drawers / side panels |
| switch | 6 | 3 | |
| clipboard-info-icon | 6 | 2 | Protocols identity icon |
| ice-mascot | 6 | 1 | Catalyst hero mascot |
| empty | 5 | 4 | Shared empty-state primitive |
| file-dropzone | 5 | 2 | |
| spinner | 5 | shell | `Loader2` wrapper; used app-wide via the shell |
| popover | 4 | 1 | |
| progress | 3 | 1 | |
| skeleton | 3 | 1 | |
| sidebar | 3 | shell | Structural shell primitive (foundational despite low import count) |
| fluid-text | 3 | shell | |
| interactive-particles | 3 | shell/marketing | |
| collapsible | 2 | 1 | |
| avatar | 2 | shell | |
| resize-handle | 2 | shell | Sidebar/panel resizing |

### Tier C — Rare (1 importer; "rate later" — cheap to restyle or fold into another component)
`command` · `radio-group` · `resizable` · `save-status` · `accordion` · `calendar` ·
`context-menu` · `form` · `sonner` (toast host — 1 mount point but affects all toasts).

### Tier D — Unused scaffolding (0 importers repo-wide; lowest priority — delete or leave dormant)
These are installed shadcn primitives with **no callers** anywhere in `app/`, `components/`,
`hooks/`, or `lib/`. They carry zero UX weight; the revamp should either delete them to shrink the
surface or ignore them entirely:

`aspect-ratio` · `breadcrumb` (the app uses a custom header breadcrumb instead) · `button-group` ·
`carousel` · `chart` · `date-picker` · `drawer` (the app uses `sheet`) · `expandable-text` ·
`field` · `hover-card` · `input-group` · `input-otp` · `interactive-grid-pattern` · `item` ·
`kbd` · `menubar` · `mouse-spotlight` · `navigation-menu` · `pagination` · `slider` · `toggle` ·
`toggle-group` · `use-mobile` (hook, used indirectly via `sidebar`).

**Revamp guidance:** invest design effort top-down. Tiers S+A are ~19 components but cover the
overwhelming majority of rendered UI — nail those and the platform is ~90% reskinned. Tier D is 23
components you can delete in one PR with no visual risk.

---

## 2. Design foundations

### 2.1 Color system

Colors are CSS custom properties on `:root` (light) and `.dark` (dark), exposed to Tailwind v4 via
`@theme inline` as semantic `--color-*` tokens (`app/globals.css:14-213`). **Never hardcode hex in
components** — use the semantic token utilities (`bg-primary`, `text-muted-foreground`, etc.).

The palette is a **warm, editorial "paper & ink" identity**: cream paper backgrounds, dark-brown
ink text, and a burnt-sienna primary. It is not a generic blue SaaS theme.

**Core semantic tokens**
| Token | Light | Dark | Role |
|---|---|---|---|
| `--background` | `#faf7f2` (warm cream) | `#1a1714` | App canvas |
| `--foreground` | `#2c2418` (dark brown ink) | `#f5f0e8` | Body text |
| `--card` | `#fffdfa` | `#221d18` | Card/surface fill |
| `--popover` | `#fffdfa` | `#221d18` | Menus/popovers |
| `--primary` | `#965034` (burnt sienna) | `#d4845a` | Primary actions, brand |
| `--primary-foreground` | `#fff8f2` | `#1a1714` | Text on primary |
| `--secondary` | `#d6e0d0` (sage) | `#2a3629` | Secondary buttons/badges |
| `--tertiary` | `#e9c6b5` (clay) | `#6b4b3f` | Tertiary accents |
| `--muted` | `#f3eadc` | `#2b241d` | Muted surfaces |
| `--muted-foreground` | `#7a6f60` | `#a89e8e` | Secondary text, icons |
| `--accent` | `#e9c6b5` | `rgba(233,198,181,.16)` | Hover fills |
| `--destructive` | `oklch(.577 .245 27.325)` | `oklch(.7 .19 25)` | Delete/danger |
| `--border` | `#e8ded3` | `rgba(245,240,232,.1)` | Hairlines |
| `--input` | `#f8f3ec` | `rgba(245,240,232,.08)` | Field fills |
| `--ring` | `#c88a67` | `#b96f48` | Focus rings |

**Extended semantic tokens (`@theme inline`, `globals.css:200-204`):** `--color-success #6c8a68`,
`--color-warning #b98541`, `--color-info #7a8fa7`, `--color-error = --destructive`. Success also has
`--color-success-foreground #fffdf9`.

**Brand accent set (`--n9-*`, `globals.css:68-72,136-140`):** `--n9-accent` (= primary sienna),
`--n9-accent-hover` (`#7e3a1b` / `#c07650`), `--n9-accent-light` (`#fcf2eb` / `rgba(212,132,90,.1)`),
`--n9-accent-glow` (`rgba(150,80,52,.14)` / `rgba(212,132,90,.22)`), plus `--n9-accent-grad`
(a 135° sienna gradient) used by `.n9-accent-surface`.

**Sidebar palette (separate token set, `globals.css:59-66,127-134`):** `--sidebar` (`#fcf9f4` /
`#1e1915`), `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent` (`#f3eadc` / `#342b23`
— the nav hover/active fill), `--sidebar-border`, `--sidebar-ring`.

**Charts:** `--chart-1..5` = sienna `#965034`, clay `#c07b5a`, sage `#8f9f86`, slate-blue `#7a8fa7`,
sand `#c5a46d` (light) with lighter dark-mode variants. `--highlight` (`#f4d65f` / `#fff59d`) is the
text-highlight/mark yellow.

**Glass surfaces (`globals.css:73-77,141-144`):** `--glass-bg` (`rgba(255,253,250,.72)` /
`rgba(34,29,24,.66)`), `--glass-border`, `--glass-blur: 14px`. Consumed by `.glass-panel`,
`.n9-glass`, and the header. `--n9-header-bg` (`rgba(242,232,220,.96)` / `rgba(40,33,26,.94)`) is
the frosted header tint.

**Per-page color usage.** There is **no per-page palette** — every area inherits the same tokens.
Differentiation comes from **section identity icons** and occasional accent tinting (e.g. Protocols'
"select for design" banner uses `border-primary/30 bg-primary/5`; Catalyst hero uses
`bg-[var(--n9-accent-light)]`; research-map nodes tint per entity kind via
`lib/research-map-kinds`). Keep this discipline in the revamp: identity through iconography and
accent, not divergent palettes.

### 2.2 Typography

**Tri-font system** (next/font in `app/layout.tsx:95-98`, tokens in `globals.css:20-22,159-163`):
- **Body — IBM Plex Sans** (`--font-ibm-sans`): all long-form text, UI labels, controls. Default `font-sans`.
- **Headings — Familjen Grotesk** (`--font-familjen`): every `h1–h6` in the app (`globals.css:241`). Exposed as `.font-heading`.
- **Display — IBM Plex Serif** (`--font-ibm-serif`): hero numbers, editorial titles, empty-state headers, and the `PageHeading` component. Exposed as `font-serif` / `font-display` / `.font-display` (with `ss01` opentype features).
- **Mono — JetBrains Mono** (`--font-jetbrains-mono`): code, sequence viewers, tabular figures.

**Primary type scale** (`globals.css:23-31`), applied to `h1–h6` in base CSS (`globals.css:244-272`):
| Token | Size | Used by | Line-height |
|---|---|---|---|
| `--font-size-5xl` | 3rem / 48px | h1 | 1.1 |
| `--font-size-4xl` | 2.5rem / 40px | h2 | 1.12 |
| `--font-size-3xl` | 2.125rem / 34px | h3 | 1.18 |
| `--font-size-2xl` | 1.75rem / 28px | h4 | 1.22 |
| `--font-size-xl` | 1.5rem / 24px | h5 | 1.28 |
| `--font-size-lg` | 1.25rem / 20px | h6 | 1.32 |
| `--font-size-base` | 1rem / 16px | body | 1.5 |
| `--font-size-sm` | 0.875rem / 14px | controls, buttons | |
| `--font-size-xs` | 0.75rem / 12px | badges, meta | |

All headings are `font-semibold` (600) in Familjen Grotesk. Body is 16px/1.5. Buttons default to
`text-sm` (14px). Root `html` is locked at `font-size: 16px`.

**Sub-xs scale for dense UI** (`@theme inline`, `globals.css:167-170`) — use these tokens, not
arbitrary px. Usage counts show heavy reliance:
| Utility | Size | Occurrences |
|---|---|---|
| `text-2xs` | 0.625rem / 10px | 204 |
| `text-micro` | 0.6875rem / 11px | 53 |
| `text-3xs` | 0.5625rem / 9px | 9 |
| `text-mini` | 0.75rem / 12px | 4 |

Used for badge labels, hotkey hints, table meta, sequence-viewer ticks. The heavy `text-2xs` usage
means dense metadata rows are a defining visual texture of the product.

**In-page titles — `PageHeading`** (`components/ui/page-heading.tsx`): renders `h1` (or `h2` via
`as`) with `font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl` (24→30px
serif). `PageSubheading` is `text-sm text-muted-foreground md:text-base`. It is **text only** — no
actions slot, padding, or breadcrumb; the caller owns layout.

### 2.3 Spacing, radius, elevation

**Radius scale** (base `--radius: 0.75rem`, `globals.css:212`). Actual component radii:
`rounded-xs` (dialog close) · `rounded-sm` (menu items) · `rounded-[4px]` (checkbox) ·
`rounded-md` (buttons, inputs, badges, tabs, tooltip, menus — the default) · `rounded-lg` (alert,
dialog panels, view-toggle container) · `rounded-xl` (cards).

**Elevation — two systems.** (1) Tailwind shadow utilities in primitives: `shadow-xs` (inputs,
outline buttons, checkbox, select trigger), `shadow-sm` (default card, footer), `shadow-md`
(select/dropdown content), `shadow-lg` (dialogs, dropdown sub-content). (2) The **Catalyst elevation
tokens** `--n9-elev-1/2/3` (`globals.css:85-87,146-148`) — warm-tinted layered shadows exposed as
`.n9-elev-1/2/3`, used for composers, glass panels, floating surfaces. The sidebars use bespoke
directional shadows (e.g. left sidebar `shadow-[6px_0_24px_-16px_rgba(20,14,8,0.28)]`).

### 2.4 Motion system

**Canonical tokens** (`globals.css:78-83`): easing `--n9-ease: cubic-bezier(0.22, 1, 0.36, 1)`
(expo ease-out, decisive, no overshoot) and three durations `--n9-dur-fast: 120ms`,
`--n9-dur-base: 220ms`, `--n9-dur-slow: 420ms`. This curve is the app's signature — it reappears in
CSS keyframes, the sidebar width transitions (500ms), the page transition (360ms), and framer-motion
(`EASE_OUT = [0.22, 1, 0.36, 1]`).

**Framer-motion conventions** (27 files; reference primitives in
`components/literature-reviews/motion.tsx`):
- `SPRING = { type: "spring", stiffness: 320, damping: 30, mass: 0.8 }` — the workhorse for UI micro-interactions and cards.
- `EASE_OUT = [0.22, 1, 0.36, 1]` — tween easing for reveals/crossfades.
- Every primitive gates on `useReducedMotion()` and collapses to `{ duration: 0.15 }` opacity fade.
- Exported: `MotionReveal` (fade + y:8→0 + scale .98→1, spring), `MotionList`/`MotionItem`
  (stagger `staggerChildren: .04`), `MotionTabPanel` (`AnimatePresence mode="wait"` crossfade + x:±8,
  200ms), `MotionFloating` (`whileHover scale 1.04` / `whileTap .96`), `MotionResultCard`
  (enter fade+y:10, hover y:-2).
- **Split:** springs for app micro-interactions; tweens (`duration` + `easeOut`) for marketing
  scroll reveals (`whileInView`, `useScroll`/`useTransform` parallax).

**Interaction utilities (Catalyst "G" language, `globals.css:1553+`):** `.n9-press` (unified
transition; `:active` → `scale(0.96)` tactile press), `.n9-glass` (backdrop blur+saturate),
`.n9-elev-1/2/3`, `.n9-accent-surface` (gradient), `.n9-glow`, `.n9-composer` (elevated glass shell,
`:focus-within` accent ring). AI surface tiers: `.surface-recessed` (reasoning/tool blocks),
`.surface-primary` (the answer), `.assistant-rail` (2px left gradient rail), `.ai-shimmer`.

**Keyframe catalog** (all in `globals.css`). Grouped:
- _Loaders/mascot:_ `loader-mascot-float`, `loader-orbit` (4.2s linear), `loader-scan`,
  `loader-testtube`, `loader-pipette`, `loader-droplet`, `loader-microscope`, `loader-writing-grow-1/2/3`
  (staggered 0/140/280ms), `tour-mascot-float`.
- _AI/streaming:_ `cursor-blink` (streaming caret), `n9-turn-in` (160ms — "reply arrives"),
  `n9-text-shimmer` (animated "Thinking…" label), `n9-skeleton-sweep`, `shimmer`, `flow-pipeline`,
  `n9-indeterminate` (progress).
- _Citations:_ `rag-highlight-pulse` (plays 3×), `rag-highlight-fade`, `n9-cite-flash`.
- _Diagram/connector:_ `n9-conn-flow`, `n9-hub-dash-flow` (animated SVG dash flow).
- _Search:_ `n9-ai-twinkle` (idle AI sparkle), `n9-search-progress`.
- _Page:_ `page-transition` (360ms — fade + 6px lift).
- _Streamdown modal:_ `n9-sd-overlay-in`, `n9-sd-card-in`.


**Enter/exit (tw-animate-css, imported `globals.css:2`):** Radix surfaces use
`animate-in`/`animate-out` with `fade-in-0`/`fade-out-0` + `zoom-in-95`/`zoom-out-95` +
side-aware `slide-in-from-*-2`, typically `duration-200`. Sheets use `slide-in-from-{side}` at
`duration-300`.

**Most-used animation utilities:** `animate-spin` ×121 (spinners), `animate-pulse` ×85 (skeletons,
status dots), `animate-in` ×54 / `animate-out` ×24 (Radix), `animate-cursor-blink` ×5,
`animate-n9-turn-in` ×4, `animate-ping` ×3.

**Reduced motion is taken seriously** — five `@media (prefers-reduced-motion: reduce)` blocks
disable page transitions, all loaders, shimmers, twinkles, cite flashes, the `.n9-press` scale, and
freeze the streaming caret to static opacity. Any new motion must add a reduced-motion fallback.

### 2.5 Iconography

- **lucide-react is the sole icon library** (151 import sites). No `@univerjs/icons` in use.
- **Sizing** (transitioning from `h-_ w-_` to `size-*` shorthand): `h-4 w-4`/`size-4` (16px) is the
  base — buttons, list rows, inline (600 occurrences). `h-3.5 w-3.5` (165) for dense/secondary.
  `h-5 w-5` (77) for nav and section headers. `h-3 w-3`/`size-3` (65) for badges; `h-2 w-2`/`h-1.5`
  for status dots. Square containers: `h-8 w-8` (80), `h-6 w-6` (54), `h-10 w-10`, `h-12 w-12` for
  avatars/empty-state media. **Primitives auto-size unclassed svgs to `size-4`** via
  `[&_svg:not([class*='size-'])]:size-4` (badge → `size-3`).
- **Color is state-driven, not per-icon.** Icons inherit `currentColor` or use `text-muted-foreground`
  (~60 sites); semantic color is sparing — green/emerald (success), amber (warning), blue/purple
  (info/accent). No fixed color-per-icon identity.
- **Section identity icons:** Dashboard `Home` · Projects `Folder`/`FolderOpen` · Experiments
  `FlaskConical` · Lab notes `NotebookPen` · Protocols `ClipboardInfoIcon` · Samples `TestTube`
  (`Dna`/`Atom` for types) · Data `Database` · Literature `BookOpen` · Catalyst `Sparkles` ·
  Research map `Network`. Create = `Plus`; row actions = `Pencil`/`Trash2`/`Copy`; spinner = `Loader2`.
- **Top icons by frequency:** `Loader2` 56 · `Trash2` 38 · `FileText` 32 · `Plus` 30 ·
  `FlaskConical` 24 · `BookOpen` 19 · `Pencil` 16 · `Upload`/`Sparkles`/`ArrowRight` 15 · `Check` 14 ·
  `NotebookPen`/`List` 13 · `Copy` 12 · `FolderOpen`/`CheckCircle2` 11 · `Download`/`ChevronDown` 10.
- **Brand/mascot:** `ice-mascot.tsx` ("Ice," cursor-tracking eyes, the Catalyst chat hero);
  `clipboard-info-icon.tsx` (Clipboard + Info overlay — the Protocols mark); `components/brand/`
  (`Notes9Brand` wordmark + mascot loader treatments).

---

## 3. Primitive component specs

Semantic-token utilities throughout; exact strings from `components/ui/`. Cross-cutting conventions
first, then per-component deltas.

**Cross-cutting conventions**
- **Focus ring (inputs, button, badge, checkbox, select):** `focus-visible:border-ring` +
  `focus-visible:ring-ring/50 focus-visible:ring-[3px]` with `outline-none`. Tabs/dialog-close use
  `ring-2`/`ring-[3px]` + `ring-offset-2`.
- **Disabled:** `disabled:opacity-50 disabled:cursor-not-allowed` (buttons add `pointer-events-none`).
- **Invalid:** `aria-invalid:ring-destructive/20 dark:.../40 aria-invalid:border-destructive`.
- **Icon slot:** unclassed svg → `size-4`; `pointer-events-none shrink-0`.

### 3.1 Button (`button.tsx`)
Base: `inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium
transition-colors duration-150`. **Variants:** `default` (`bg-primary text-primary-foreground
hover:bg-primary/90`) · `destructive` (`bg-destructive text-white hover:bg-destructive/90`) ·
`outline` (`border bg-background shadow-xs hover:bg-accent`) · `secondary` (`bg-secondary
hover:bg-secondary/80`) · `ghost` (`hover:bg-accent`) · `destructive-ghost` (`text-destructive
hover:bg-destructive/10`) · `link` (`text-primary hover:underline`). **Sizes:** `default` h-9/36px
(`px-4 py-2`) · `sm` h-8/32px · `lg` h-10/40px · `icon` size-9 · `icon-sm` size-8 · `icon-lg` size-10.
`has-[>svg]` trims horizontal padding when an icon is a direct child. No active state beyond hover
(press feel comes from `.n9-press` where applied).

### 3.2 Badge (`badge.tsx`)
`rounded-md border px-2 py-0.5 text-xs font-medium gap-1`, svg `size-3`. **Variants:** `default`
(sienna) · `secondary` (sage) · `destructive` · `outline` (`text-foreground`) · `success`
(`bg-success text-success-foreground`). Hover states apply only when rendered as `<a>`. No sizes.

### 3.3 Card (`card.tsx`)
Base `bg-card text-card-foreground flex flex-col gap-6 rounded-xl py-6`. **Variants:** `default`
(`border shadow-sm`) · `outline` (`border`) · `filled` (`bg-muted/50 border-transparent`) · `ghost`
(`border-transparent`). Sub-parts: `CardHeader` (`px-6`, container-query grid with top-right
`CardAction` slot), `CardTitle` (`leading-none font-semibold`), `CardDescription`
(`text-muted-foreground text-sm`), `CardContent` (`px-6`), `CardFooter` (`px-6`). `rounded-xl` +
`shadow-sm` is the app's signature surface.

### 3.4 Input / Textarea (`input.tsx`, `textarea.tsx`)
Input: `h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs
transition-[color,box-shadow] md:text-sm` (16px mobile → 14px desktop to avoid iOS zoom). Dark
`bg-input/30`. Selection tinted `bg-primary`. Textarea: `min-h-16 field-sizing-content` (auto-grows)
`px-3 py-2`. Neither has size variants. `textarea-with-word-count` wraps textarea with a live count.

### 3.5 Select (`select.tsx`)
Trigger `data-[size=default]:h-9 data-[size=sm]:h-8`, `rounded-md border border-input bg-transparent
px-3 py-2 text-sm shadow-xs`, chevron `size-4 opacity-50`. Content: `bg-popover rounded-md border
shadow-md p-1`, `animate-in fade-in-0 zoom-in-95` + side slides, `z-50`, `min-w-[8rem]`, height
clamped to available viewport. Items: `rounded-sm py-1.5 pr-8 pl-2 text-sm`, focus `bg-accent`,
right-aligned check. Label `text-muted-foreground px-2 py-1.5 text-xs`.

### 3.6 Dialog / Alert-Dialog (`dialog.tsx`, `alert-dialog.tsx`)
Overlay: `bg-black/50` **no blur**, fade only, `z-[130]`. Panel: `bg-background rounded-lg border p-6
gap-4 shadow-lg z-[131]`, centered, `zoom-in-95`/`zoom-out-95` + fade `duration-200`. Dialog **size
tokens** (`dialogSize` prop): `sm` max-w-md · `md` max-w-2xl · `lg` max-w-4xl · `xl` ~1280px · `full`
near-viewport; default max-w-lg. Close button top-right (`XIcon`, opacity 70→100). Header
`gap-2 text-center sm:text-left`; footer `flex-col-reverse sm:flex-row sm:justify-end`; title
`text-lg font-semibold`; description `text-muted-foreground text-sm`. **Alert-dialog** has fixed
`sm:max-w-lg`, **no X button** (requires explicit Action/Cancel — Action = default button, Cancel =
outline), and blurs the sidebar search on open. **Note:** overlays are solid black, not glass — a
possible revamp target for consistency with the glass language elsewhere.

### 3.7 Alert (`alert.tsx`)
`rounded-lg border px-4 py-3 text-sm`, grid with a 16px icon column when an svg is present, icon
`size-4 translate-y-0.5`. Variants: `default` (`bg-card`) · `destructive` (`text-destructive
bg-card`). Title `font-medium tracking-tight line-clamp-1`; description `text-muted-foreground`.

### 3.8 Table (`table.tsx`)
Wrapper `overflow-x-auto`, table `w-full caption-bottom text-sm`. Header row: bottom border,
`TableHead` `h-10 px-2 text-left font-medium` (no fill). Body: `TableRow hover:bg-muted/50
data-[state=selected]:bg-muted border-b transition-colors`; last row border removed. `TableCell`
`p-2 align-middle whitespace-nowrap`. **Horizontal borders only, no vertical rules, no zebra
striping.** Header is distinguished by weight + border, not background. Footer `bg-muted/50 border-t
font-medium`.

### 3.9 Tabs (`tabs.tsx`) — pill style
`TabsList` is a `bg-muted rounded-md p-1 gap-1` pill container, `h-9`. `TabsTrigger` `rounded-md
px-3 py-1 text-sm font-medium transition-all duration-200`; **active = raised white pill**
(`data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow`)
— not an underline. The list is horizontally scrollable with gradient-masked chevron buttons
(`h-7 w-7 rounded-md border bg-background/85`); the active tab auto-scrolls to center.

### 3.10 Tooltip (`tooltip.tsx`)
`bg-foreground text-background` (inverted), `text-xs rounded-md px-3 py-1.5 z-50`,
`animate-in fade-in-0 zoom-in-95` + side slides, 10px rotated-square arrow. **`delayDuration = 0`**
(instant) and `sideOffset = 0` by default.

### 3.11 Dropdown menu / submenus (`dropdown-menu.tsx`)
Content `bg-popover rounded-md border shadow-md p-1 min-w-[8rem] z-50`, fade+zoom+slide, `sideOffset
4`. Item `rounded-sm px-2 py-1.5 text-sm`, focus `bg-accent`, icons `size-4 text-muted-foreground`;
`data-[variant=destructive]` tints red; `inset` adds `pl-8`. Checkbox/radio items reserve `pl-8` for
a left indicator. Label `px-2 py-1.5 text-sm font-medium`. Separator `bg-border -mx-1 my-1 h-px`.
Shortcut `ml-auto text-xs tracking-widest text-muted-foreground`. **Submenus:** `SubTrigger` shows
trailing `ChevronRight size-4`, opens `SubContent` with `shadow-lg` + `overflow-visible`.

### 3.12 Checkbox / Label / Separator
Checkbox `size-4 rounded-[4px] border shadow-xs`, checked `bg-primary text-primary-foreground
border-primary`, check glyph `size-3.5`, `transition-shadow`. Label `text-sm font-medium
leading-none`; dims to `opacity-70` when its peer input is disabled. Separator: 1px `bg-border` line,
horizontal or vertical.

### 3.13 Resource list filters (`resource-list-filters.tsx`)
Not a raw primitive — the shared **filter row** on list pages. `ResourceListFilter` = labeled
`Select` (label `text-xs text-muted-foreground`, trigger forced `h-9`, leading "All" option).
`ResourceFilterRow` = `mb-4 flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row
sm:flex-wrap sm:items-end` (stacks on mobile, right-aligned wrapping row on desktop),
`data-tour="resource-filters"`. **No search box or sort control here** — those are composed
separately per page; view switching is the separate `ViewModeToggle`.

---

## 4. App shell & navigation

The authenticated shell is `AppLayout` (`components/layout/app-layout.tsx`) rendering `AppSidebar`
(left), a frosted header, a scrolling `<main>`, and a single-slot right drawer. **`left-sidebar.tsx`
is legacy dead code — do not spec or build from it.**

### 4.1 Left sidebar (`app-sidebar.tsx` + `ui/sidebar.tsx`)
- **Width:** expanded default **280px** desktop / **240px** tablet (≤1024px), user-resizable
  200–400px via a right-edge `ResizeHandle`. Collapsed **icon rail = 48px** (`--sidebar-width-icon:
  3rem`). Starts expanded; toggled by a `PanelLeft` ghost button or **⌘/Ctrl-B**.
- **Animation:** width transitions `width 0.5s cubic-bezier(0.22,1,0.36,1)` (killed to `none` while
  dragging). Separation via a soft right-edge shadow, not a border ("floated, not boxy").
- **Nav model (important — not a flat list):** the primary nav is **5 items**
  (`lib/app-primary-nav.tsx`): **Dashboard** (`Home`) · **Projects** (`Folder`) · **Literature**
  (`BookOpen`) · **Catalyst** (`Sparkles`) · **Research map** (`Network`). **Experiments, Lab notes,
  Protocols, Samples, Data** are **not top-level** — they render as a **project-scoped nested
  sub-tree** under Projects when a project is active (`?project=` / `/projects/<id>`): Experiments →
  {Lab notes, Protocols, Samples, Data}, plus Reports and Writing. In icon mode the tree flattens to
  a vertical icon stack.
- **Nav item states:** base `rounded-md p-2 text-sm gap-2`, svg `size-4`. Hover = light
  `color-mix(background 78%, primary 22%)` fill (dark: `sidebar-accent`); press = `active:scale-[0.985]`.
  **Active is signaled by a bold label on a transparent background** (`data-[active=true]:bg-transparent`
  + `font-semibold` span), overriding the shadcn default accent fill. **No badges/counts** on nav.
- **Header:** `Notes9Brand` lockup (icon `h-6 w-6` + wordmark + tagline) linking to `/dashboard`;
  icon mode shows just the logo mark (`size-8`, `dark:invert`).
- **Search:** expanded = `SidebarInput` with left `Search` icon (`pl-9`, placeholder "Search…"),
  debounced 300ms / min 2 chars → `/api/search`, results in a Radix `Popover` (`w-[var(--sidebar-width)]`,
  `max-h-[min(60vh,400px)]`) with type-mapped icons. Icon-rail = a `Search` button that expands then
  focuses after 120ms.
- **Create menu:** a sage pill (`bg-[#e4ecd9] text-[#4f5f42]`) `DropdownMenu` with `Plus`; items
  Project/Experiment/Sample/Protocol/Lab note/Writing/Report, each with its identity icon; opens
  `side="right"`. Hidden in icon mode.
- **Footer:** user `DropdownMenu` — square initials avatar (`size-8 rounded-lg bg-sidebar-accent`),
  name `text-sm font-semibold`, `ChevronUp`; opens `side="top"` with **Account Settings** (`/settings`)
  and **Sign out**. No org switcher (org resolved from profile).
- **Mobile (≤768px):** inline column is replaced by a `Sheet` overlay (`w-18rem`, `z-[120]`) opened
  by a header `Menu` button.

### 4.2 Right sidebar — Catalyst AI drawer (`right-sidebar.tsx`)
- Houses the **Catalyst AI chat** (or, by priority, a registered **protocol-AI panel**) — a large
  chat surface: contentEditable composer, @-mention catalog (literature/notes/experiments/projects/
  protocols), attachments, voice transcription, resizable chat-history rail, streamed messages with
  citations/sources/artifacts/graphs.
- **Single slot, two occupants:** protocol-AI wins when active; else Catalyst. Opening one closes the
  other. Suppressed on the `/catalyst` route (which mounts its own full-page instance). **Closed by
  default.**
- **Width:** default **460px** desktop / 400px tablet, resizable 260–600px, persisted; auto-widens to
  540px when a real conversation starts.
- **Animation:** desktop stays mounted and animates **width 0 ↔ full** (`width 0.5s
  cubic-bezier(0.22,1,0.36,1)`), left-edge shadow + border; unmounts 520ms after close. Protocol
  variant uses `animate-in fade-in slide-in-from-right-6 duration-500`. Mobile = `Sheet` (right).

### 4.3 Top bar / header (`app-layout.tsx:465-556`)
- **Height `h-12` (48px) mobile / `sm:h-14` (56px)**. Suppressed on `/catalyst`.
- **Frosted glass:** `bg-[var(--n9-header-bg)]/70 backdrop-blur-xl saturate-[1.4]` +
  `border-b border-[var(--glass-border)]`, padding `px-3 sm:px-4`. Fixed at top; `<main>` scrolls
  beneath it.
- **Left:** mobile `Menu` button + `HeaderTitle` (the breadcrumb, §4.4).
- **Right cluster** (`gap-1 sm:gap-2`): Report-issue → **Help** (`CircleHelp`, triggers page tour) →
  **Theme toggle** (Sun/Moon) → `h-5 w-px` divider → optional **Protocol AI** (`Sparkles`) → **Ask
  Catalyst** (`MessageSquare`, sienna-ringed, `bg-primary/[.08]`→`/20` when open).
- **No search input and no user avatar in the header** — search and account live in the left sidebar.
- Skip-to-content link (`sr-only focus:not-sr-only`) targets `#main`.
- `<main>`: `overflow-auto p-3 sm:p-4 md:p-6` (12/16/24px), wraps children in `PageTransition`.

### 4.4 Breadcrumbs & header title (`breadcrumb-context.tsx`, `HeaderTitle`)
The header title **is** the breadcrumb. `BreadcrumbProvider` holds `segments
[{label, href?, icon?}]`, **auto-reset to `[]` on every navigation**. Pages set crumbs via
`SetPageBreadcrumb` (equality-guarded) or `SetScopedBreadcrumb` (prepends a colored project dot +
`Project ▸ Section ▸ Item`). No crumbs → the header builds from the pathname or shows a plain
`h1 text-base sm:text-lg font-semibold`. Desktop crumb: `text-sm text-muted-foreground`, `ChevronRight
size-3.5` separators, hover `text-foreground`. Mobile: horizontally scrollable with edge fade
gradients, labels shortened to 18 chars.

### 4.5 Page transition (`page-transition.tsx`)
Pure CSS (no framer-motion). On pathname change, applies `animate-page-transition` (fade + 6px
upward lift) at **360ms `cubic-bezier(0.22,1,0.36,1)`**, resets after 360ms, skips first paint,
remounts children (keyed on pathname). Respects reduced-motion.

### 4.6 View-mode toggle (`view-mode-toggle.tsx`)
`inline-flex gap-1 rounded-lg border p-1` with two `Button size="sm"`s: **Grid** (`Grid3x3` +
"Grid") and **Table** (`List` icon + "Table"). Active = `default` (filled) variant, inactive =
`ghost`. Supports `tableDisabled` to lock to grid on small screens. Modes are `'grid' | 'table'`.

---

## 5. Per-page UX blueprints

Shared chrome: top-level list pages open with a `CatalystSectionHero` (AI prompt card, themed by
`scope`, `shrinkOnScroll`), then a toolbar with `ViewModeToggle` + `ResourceFilterRow`, `font-display`
headings, and `Empty*` zero-states.

1. **Dashboard** (`dashboard/page.tsx`) — a **widget dashboard**, not a list. ~10 parallel Supabase
   queries feed `DashboardGreeting`, `DashboardRecentWork`, `ActivitySummary`, a `CatalystSectionHero`,
   calendar, todo panel, quick actions, and a standout **free-form draggable sticky-note whiteboard**
   (`dashboard-whiteboard.tsx`, pointer-drag + marquee multi-select, positions persisted).
2. **Projects** (`project-list.tsx`) — grid/table of project cards
   (`grid-cols-[repeat(auto-fit,minmax(280px,1fr))]`, `line-clamp-2` titles, member/experiment counts
   with `Users`/`FlaskConical`/`ArrowUpRight`). Ghost `Plus` "New project". Mobile locks to grid.
3. **Experiments** (`experiment-list.tsx`) — same grid/table pattern, project-scoped via `?project=`
   with a context banner. **Detail** is a tabbed workspace (Notes / Protocols / Samples / **Data**),
   where the Univer spreadsheet lives.
4. **Lab notes** (`lab-notes/page.tsx`, client) — list/detail split: filterable list (view toggle +
   project/experiment filters, default table view) → rich-text editor detail. Specialized:
   scientific calculator, version dialog, AI-edit approval.
5. **Protocols** (`protocols-page-content.tsx`) — grid/table library with usage counts and a
   "select for design" accent banner. Rich AI-authoring surround: design mode, side chat, Biomni
   draft panel, literature panel, template picker, change approval.
6. **Samples** (`samples-page-content.tsx`) — grid/table inventory (limit 100) with a status filter
   (`available`/`in_use`/`depleted`/`disposed`) + type filters. Domain icons `Package`/`Dna`/`Atom`;
   cards show code, type, storage, quantity/concentration. (Also hosts the plasmid/protein molecular
   viewers — see `PLASMID_EDITOR_REVAMP_PLAN.md`.)
7. **Data / Reports** — `data/page.tsx` is **pure redirect logic** into an experiment's Data tab;
   the real surface is `components/spreadsheet/univer-workbook-view.tsx` (a **Univer workbook** embed).
   **Reports** is a table list of generated reports with download actions + a centered-card empty state.
8. **Literature** (`literature-tabs.tsx`) — tabbed workspace (AI **search** vs saved **repo**),
   `MotionReveal` entry, and a full **PDF reading stack** (viewer/panel/annotation sidebar, detail
   modal, staging). **Papers** is the writing-workspace counterpart (`scope="writing"`).
9. **Catalyst** (`catalyst-full-page.tsx`) — full-height chat mounting `RightSidebar variant="page"`.
   Empty state = `catalyst-greeting` with the **Ice mascot**, time-based greeting, and suggestion
   chips. Rich agent UX: thinking indicator, reasoning panel, tool cards, artifact cards, citations
   panel, source viewer, graph/flow-pipeline views, session history.
10. **Research map** (`research-map-view.tsx`) — a **graph canvas** on `@xyflow/react`
    (`ReactFlow` + `Background`/`Controls`/`MiniMap`/`Panel`, auto-layout "LR"). Custom
    `researchEntity` nodes: compact rectangles with a colored left ribbon, uppercase kind tag, and
    per-kind icon/tint; edges route orthogonally between projects/experiments/notes/papers.

---

## 6. Revamp priorities & observations

**Order of attack** (maximize propagation, minimize risk):
1. **Tokens first.** All color/type/motion is centralized in `app/globals.css` — a palette or type
   refresh there reskins the entire app with zero component edits. This is the single highest-leverage
   move.
2. **Tier S + A primitives** (§1) — ~19 components covering the vast majority of rendered UI. Restyle
   button → input/card/label/select → badge/dialog → table/tabs/tooltip/menus.
3. **App shell** (§4) — sidebar, header, page transitions. High visibility, self-contained.
4. **Per-page polish** (§5) — the distinctive surfaces (whiteboard, spreadsheet, PDF stack, chat,
   graph) each need bespoke attention but affect one area each.
5. **Delete Tier D** (23 unused primitives) in one low-risk PR.

**Specific inconsistencies worth resolving in the revamp:**
- **Overlays are solid `bg-black/50` with no blur**, while the rest of the app leans on a glass
  language (header, `.glass-panel`, `.n9-glass`). Consider frosting dialog/alert overlays for coherence.
- **Two elevation systems** coexist (Tailwind `shadow-*` vs `--n9-elev-*`); converge on the token set.
- **Skeleton has two implementations** — `skeleton.tsx` (`animate-pulse`) and the richer
  `.n9-skeleton-shimmer` sweep. Pick one.
- **Icon sizing is mid-migration** (`h-4 w-4` vs `size-4`); standardize on `size-*`.
- **Active-nav affordance is a bold label on transparent** — intentional and distinctive, but easy to
  miss; validate in the revamp whether it reads as "selected" strongly enough.
- **The user's mental model of "10 pages" ≠ the nav** — experiments/lab-notes/protocols/samples/data
  are project-scoped, not top-level. Any IA revamp should decide deliberately whether to keep that
  nesting or promote them.

