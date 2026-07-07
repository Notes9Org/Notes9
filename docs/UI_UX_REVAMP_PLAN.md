# Notes9 — UI/UX Revamp Plan

_Companion to `UI_UX_SPEC.md` (the current-state audit). This is the forward plan: a distinctive,
modern, fully-interactive, consistent design language and the sequenced work to get there._
_Status: proposal. Last updated 2026-07-03._

## Goals (from the brief)
1. **Professional & extremely modern** — feels like a premium 2026 scientific product, not a shadcn demo.
2. **Every element is interactive** — no dead pixels; every actionable thing has hover, focus, press, and state-change feedback.
3. **Consistent** — the same component behaves and feels identical everywhere; one interaction grammar.
4. **Distinctive** — an ownable identity, not the generic Radix/shadcn look the app has today.
5. **New icon set** — replace lucide with a free, fully-covering, more expressive library.
6. **Biotech/pharma-familiar typography** — fonts researchers trust and read comfortably all day.
7. **Extremely polished** — motion, spacing, and detail at a level users notice.

## ✅ Already done in this pass
**Removed 23 unused UI primitives** (verified zero importers across `app/`, `components/` incl.
marketing, `hooks/`, `lib/`, no barrel re-exports, no internal composition, no symbol/dynamic
references; `tsc --noEmit` passes clean). Deleted: `aspect-ratio, breadcrumb, button-group, carousel,
chart, date-picker, drawer, expandable-text, field, hover-card, input-group, input-otp,
interactive-grid-pattern, item, kbd, menubar, mouse-spotlight, navigation-menu, pagination, slider,
toggle, toggle-group`, and the duplicate `components/ui/use-mobile.tsx` (the real hook is
`hooks/use-mobile.ts`). `components/ui/` went 69 → 46 files. This shrinks the surface the revamp must
restyle and keep consistent.

---

## 1. The design language: "Lab-grade"

The fix for "generic" is a small set of **ownable signature motifs** applied relentlessly. The
current warm "paper & ink" palette is a good, distinctive foundation — we keep it and sharpen it with
a precision/scientific-instrument character. Five signatures, used everywhere:

1. **The kind-ribbon.** A 2–3px colored left edge on every entity surface (cards, list rows, nav
   items, mentions), tinted by entity kind (project/experiment/note/protocol/sample/paper/literature).
   This already exists on research-map nodes — we promote it to a platform-wide identity element. It's
   distinctive *and* functional (type recognized at a glance).
2. **Precision hairlines + measured meta.** Lab-instrument-inspired: crisp 1px rules, tick-mark
   dividers, and **monospace for all IDs, counts, timestamps, sequence data, and measurements**
   (IBM Plex Mono). This is the texture that reads "scientific tool," not "content site."
3. **Weight-shift icons.** With Phosphor (§3.2), icons animate `regular → fill` (or `duotone`) on
   hover/active. One gesture, applied to every icon in the product = instant life + distinctiveness.
4. **Unified tactile press.** Every interactive element uses the `.n9-press` depth press
   (`scale 0.96–0.985`, 120ms). Buttons, nav, cards, chips, toggles — everything you can click
   physically responds.
5. **Editorial serif moments.** A high-contrast display serif (§3.1) for page titles, hero numbers,
   and empty-state headers — the "scientific journal" gravitas that generic all-sans SaaS lacks.

Design principle for consistency: **behavior is owned by the component category, never re-invented at
the call site.** A "primary action" looks and moves the same in a dialog, a toolbar, and a card. §5 is
the enforcement layer.

---

## 2. Interaction grammar (the "every element is interactive" contract)

Every interactive element implements the applicable states below. This table is the acceptance
criteria for the revamp — a component isn't "done" until all its states are specified and built.

| State | Trigger | Standard treatment | Timing |
|---|---|---|---|
| **Rest** | default | Token colors, `--n9-elev-1` where elevated | — |
| **Hover** | pointer enter | Bg/tint shift + icon weight-shift + (cards) `−2px` lift | `--n9-dur-fast` 120ms `--n9-ease` |
| **Focus-visible** | keyboard | Signature ring: `ring-[3px] ring-ring/50` + `border-ring` | 120ms |
| **Press** | pointer down | `.n9-press` `scale(0.96–0.985)` | 120ms |
| **Active/Selected** | state | Accent fill or kind-ribbon + weight-shift icon (fill) | 220ms |
| **Loading** | async | In-place spinner/skeleton-shimmer, control disabled not removed | — |
| **Disabled** | `disabled` | `opacity-50 cursor-not-allowed`, no motion | — |
| **Success/Error** | result | Brief semantic flash (`n9-cite-flash`-style), toast for global | 420ms |

Rules:
- **No hover-only affordances** on touch; provide a persistent equivalent.
- **Everything respects `prefers-reduced-motion`** — motion collapses to opacity/none (five blocks
  already exist; extend them for any new keyframe).
- **Micro-interactions are built from the existing tokens** (`--n9-ease`, `--n9-dur-*`), never ad-hoc.

---

## 3. Foundations

### 3.1 Typography — grounded in what the major journals actually use

We analyzed the live typography of the leading biotech/pharma publishers (their **web design
systems**, which matter most for a web app, plus their print/PDF faces):

| Publisher | Body / UI | Headings / display | Notes |
|---|---|---|---|
| **Nature / Springer Nature** | **Merriweather Sans** (humanist sans, variable) | **Merriweather** (serif) for headings + long-form articles; bespoke **Harding** serif in print | Whole web UI is Merriweather Sans; serif for article reading. No mono. |
| **Elsevier / ScienceDirect** | **Elsevier Sans = National 2** (Klim neo-grotesque) | **Elsevier Serif = Tiempos Text** (Klim) for H1/H2/hero; **National 2 Medium** for H3–H5 | PDF body is **Amerigo** (Gerard Unger serif). |
| **Cell Press** | **Avenir** (geometric humanist sans; Arial fallback) | — | Sans-dominant. |
| **Science / AAAS** | Helvetica / neo-grotesque sans | — | Sans for figures/captions. |

**The consistent pattern across all four:** a **humanist/grotesque sans for UI and body**, a **serif
reserved for large headings, hero moments, and long-form article reading**, and no house monospace.
This is exactly the sans-body + serif-display structure we want — and it validates keeping serif for
display rather than going all-sans.

The bespoke journal faces (Harding, Tiempos, National 2, Avenir, Amerigo) are **commercial/paid**, so
we map each to its closest **free (SIL OFL)** equivalent, self-hosted via `next/font`:

**Recommended pairing — "Nature-authentic, free":**

| Role | Face | Why (journal-grounded) |
|---|---|---|
| **Body / UI** | **Merriweather Sans** | This *is* Nature's web UI/body typeface — free, variable, humanist, calm. Maximum familiarity to researchers who read Nature daily, and excellent at the dense small sizes this app leans on (`text-2xs` ×204). |
| **Display / headings** | **Source Serif 4** | Adobe's scientific-publishing serif — close in feel to Elsevier's **Tiempos Text** and Elsevier's **Amerigo** PDF serif, but free and more refined/premium than Merriweather's own serif (which reads "bloggy"). Carries page titles, hero numbers, empty states. |
| **Long-form editor body** | **Source Serif 4** | Mirror the journals: set the lab-note / paper rich-text **reading** surface in the serif, so writing/reading a note feels like reading a paper. Chrome stays sans. |
| **Mono / data** | **IBM Plex Mono** | Sequences, sample IDs, counts, timestamps, measurements — journals have no house mono, so we keep a scientific-pedigree one that pairs with the plasmid tooling. |

This maps 1:1 onto the existing tri-font token structure (`--font-family-body/heading/display` +
`--font-mono`) — a **token swap in `app/globals.css` + `app/layout.tsx`**, not a component rewrite.
`PageHeading` (already `font-display`) picks up Source Serif 4 automatically.

**Alternatives (each a drop-in token swap):**
- _Purest Nature match:_ **Merriweather Sans** body + **Merriweather** serif headings (literally Nature's stack; slightly more common/bloggy serif).
- _Elsevier-style / more modern-grotesque:_ **Inter** or **Instrument Sans** body (National-2-adjacent) + **Source Serif 4** display.
- _Cell-style geometric:_ **Mulish** or **Nunito Sans** body (Avenir-adjacent) + serif display.

**Decision needed: confirm the pairing** — see the question at the end.

_Sources: [Springer Nature Elements — Typography](https://eds.springernature.com/foundations/springernature/typography/) · [Commercial Type — Harding for Nature](https://commercialtype.com/custom/harding_a_new_typeface_for_nature) · [Elsevier Design System — Typography](https://artifacts.prod.webpresence.elsevier.com/design-system/docs/foundational-guidelines/typography/) · [Cell Press figure guidelines](https://www.cell.com/figure-guidelines)._

### 3.2 Icon system — replace lucide with Phosphor

**Recommendation: `@phosphor-icons/react` (Phosphor Icons).**

| Criterion | Phosphor | (current) lucide | Tabler (alt) |
|---|---|---|---|
| Coverage | **~9,000 icons, 6 weights** | ~1,600 | ~5,900 |
| License | MIT (free, commercial OK) | ISC | MIT |
| Scientific set | Flask, TestTube, Dna, Atom, Microscope, etc. ✓ | partial | good |
| Distinctiveness | **6 weights + duotone** | single weight | single weight |
| Interaction hook | **weight-shift on hover/active** (regular→fill) | none | none |

Phosphor's weight system *is* the "every icon is interactive" mechanism (§1.3) and its breadth
guarantees "every component used is covered." **Tabler** is the fallback if a single-weight, ultra-clean
look is preferred.

**Migration strategy (mechanical, low-risk):**
1. Add `@phosphor-icons/react`; keep lucide installed until migration completes.
2. Build `components/ui/icon.tsx` — a single wrapper that standardizes size (`size-4` default),
   weight, and the hover weight-shift, so call sites never touch the raw library again. This also makes
   the *next* library swap trivial.
3. Codemod the 151 import sites via a name map (lucide → Phosphor equivalents; e.g. `FlaskConical →
   Flask`, `NotebookPen → Notebook`, `Loader2 → CircleNotch`, `Trash2 → Trash`, `Sparkles →
   Sparkle`). ~40 icons cover the bulk (see spec §2.5).
4. Standardize sizing on `size-*` during the sweep (finishes the half-done `h-4 w-4 → size-4` migration).
5. Re-map the section-identity icons and the custom `clipboard-info-icon`/mascot slots.
6. Remove lucide-react when the last import is gone.

### 3.3 Color — keep the identity, modernize the system

Keep the warm sienna/paper palette (it's already distinctive) but tighten it:
- **Converge elevation** onto the `--n9-elev-1/2/3` tokens; retire ad-hoc `shadow-sm/md/lg` on
  primitives so depth is consistent and themeable.
- **Frost the overlays.** Dialog/alert overlays are currently solid `bg-black/50`; switch to the glass
  language (`backdrop-blur` + tinted scrim) to match the header and panels. Consistency win.
- **Formalize state colors.** `success/warning/info/error` exist as tokens but are applied ad-hoc to
  icons; define filled/soft/border variants so status reads identically everywhere (badges, alerts, toasts).
- **Kind-color tokens.** Promote `lib/research-map-kinds` tints to global `--kind-*` tokens driving the
  kind-ribbon (§1.1) across cards, rows, nav, and mentions.
- Add a subtle **dark-mode contrast pass** — the warm dark theme is good but validate AA on
  `muted-foreground` text.

### 3.4 Elevation, radius, spacing convergence
- **Radius:** standardize to `md` (controls), `lg` (panels/dialogs), `xl` (cards). Retire one-off
  `rounded-xs`/`rounded-[4px]`.
- **Skeletons:** pick one — replace `animate-pulse` `skeleton.tsx` with the richer
  `.n9-skeleton-shimmer` sweep everywhere.
- **Spacing:** codify a 4px base scale in tokens; audit dense meta rows for rhythm.

---

## 4. Component redesign specs

Restyle in the priority order from the spec (Tier S → A → B), because foundational components
propagate for free. Each gets the full state set (§2). Highlights:

**Tier S (do first — touches everything)**
- **Button** — add the `.n9-press` depth press + icon weight-shift; refine `default` with a subtle
  gradient/inner-highlight for "premium"; ensure every variant has hover+press+focus+loading. Loading =
  in-place spinner, width-stable.
- **Input / Textarea** — animated focus (ring + border) already present; add a **floating/animated
  label** option and an inline validation state (icon + color) with reduced-motion fallback. Selection
  stays sienna.
- **Card** — introduce the **kind-ribbon** variant + hover lift (`−2px`, `--n9-elev-2`) + optional
  press when the whole card is a link. This is the highest-visibility surface in the app.
- **Label** — pair with floating-label inputs; consistent disabled dimming.
- **Select** — animated chevron rotate on open, item hover tint, checkmark draw-in; content uses glass.
- **Badge** — soft/solid/outline for every semantic color; monospace numerals for counts; kind-tinted variant.
- **Dialog / Alert-Dialog** — **frost the overlay**; panel entrance keeps `zoom-in-95` but add a subtle
  spring; standardize footer button order and variants (Action=primary, Cancel=outline).

**Tier A**
- **Table** — sticky header, animated row hover (tint + reveal row actions on hover/focus), sortable
  header affordance with animated caret, selected-row kind-tint, optional density toggle. Monospace for
  numeric/ID columns. Keep the clean hairline (no zebra) but make hover richer.
- **Tabs** — keep the pill but add an **animated sliding indicator** (layoutId/`framer-motion`) instead
  of instant swap; content crossfade via `MotionTabPanel`.
- **Tooltip** — keep instant; align background to the inverted-foreground token; add tiny scale-in.
- **Dropdown-menu / submenus** — item stagger-in, icon weight-shift on focus, animated submenu open.
- **View-mode toggle** — animated sliding active pill; icon weight-shift.
- **Resource-list-filters** — unify with a consistent filter-bar pattern (search + filters + view toggle
  + sort) so every list page's toolbar is identical.

**Tier B** — restyle opportunistically when touching the host feature (sheet, switch, empty, popover,
progress, skeleton, file-dropzone, scroll-area). `empty.tsx` gets the serif header + mascot slot as the
canonical zero-state.

---

## 5. Consistency system (enforcement)

Distinctiveness without consistency = chaos. Enforce via:
1. **Category ownership.** Every interactive element maps to one category (action, input, surface,
   navigation, disclosure, feedback) with a fixed state spec (§2). Call sites choose a variant, never
   restyle.
2. **The `Icon` wrapper (§3.2)** — one place controls icon size/weight/motion.
3. **Motion only from tokens** — lint against arbitrary durations/easings in className strings; require
   `--n9-ease` / `--n9-dur-*` or the `motion.tsx` primitives.
4. **A living component gallery** (`/settings/dev/components` or Storybook) showing every component ×
   every state — the visual regression + review surface.
5. **Codified tokens** — colors, type, radius, elevation, spacing, kind-colors all in `globals.css`
   `@theme`; zero hardcoded hex/px in components (the spec found this is *mostly* true already).

---

## 6. App shell polish
- **Sidebar:** keep the 280px/48px resizable model. Add kind-ribbon + weight-shift icons to nav;
  reconsider the active-state (currently bold-label-on-transparent — validate it reads as "selected";
  consider a subtle kind-tinted fill + ribbon). Animate the project-scoped sub-tree expand/collapse.
- **Header:** already frosted glass — extend the same treatment to overlays (§3.3). Add press feedback
  to header actions.
- **Page transitions:** keep the pure-CSS 360ms fade+lift; consider a shared-element transition for
  list→detail on key flows (opt-in, reduced-motion-safe).
- **IA decision:** the "10 areas" aren't a flat nav — experiments/lab-notes/protocols/samples/data are
  project-scoped. Decide deliberately whether to keep nesting or surface a global switcher.

## 7. Accessibility & polish bar
- AA contrast on all text (esp. `muted-foreground`, dark mode).
- Every interactive element keyboard-reachable with the signature focus ring.
- All motion has a reduced-motion fallback.
- Respect `prefers-color-scheme`; validate both themes for every restyled component.
- Touch targets ≥44px; hover affordances have non-hover equivalents.

## 8. Phased rollout

| Phase | Scope | Outcome |
|---|---|---|
| **P0 — done** | Delete 23 unused primitives | Smaller surface ✓ |
| **P1 — Foundations** | Confirm font + icon choices; swap font tokens; build `Icon` wrapper; codemod icons; converge elevation/radius; frost overlays; define kind-color + state-color tokens; interaction-grammar utilities | The whole app reskins from tokens; icons modernized |
| **P2 — Tier S components** | button, input/textarea, card (+kind-ribbon), label, select, badge, dialog/alert-dialog with full state set | ~90% of rendered UI feels new & interactive |
| **P3 — Tier A + shell** | table, tabs, tooltip, menus, view-toggle, filter-bar; sidebar/header polish; component gallery | Consistency locked; navigation polished |
| **P4 — Per-page + Tier B** | dashboard whiteboard, spreadsheet, PDF stack, catalyst chat, research map; remaining primitives; empty states | Distinctive surfaces polished end-to-end |
| **P5 — Polish & QA** | contrast/motion/keyboard audit; visual regression; remove lucide | Ship-grade |

## 9. Risks & notes
- **Font/icon are the two load-bearing, semi-irreversible calls** — lock them in P1 before mass
  migration (question below).
- **Icon codemod needs human review** for semantic name mismatches (lucide↔Phosphor aren't 1:1).
- **Marketing pages** share tokens/motion but have their own components (32 files) and heavy
  framer-motion scroll choreography — restyle them in their own track to avoid destabilizing launch pages.
- **Don't regress reduced-motion or a11y** while adding micro-interactions — the grammar (§2) makes
  this a checklist, not an afterthought.

---

### Decision needed before P1
Two brand-defining choices drive the whole migration and should be confirmed first: the **typeface
pairing** (§3.1) and the **icon library** (§3.2). Recommended: **Inter + Fraunces + IBM Plex Mono** and
**Phosphor Icons**. Confirm or swap and I'll lock them into P1.
