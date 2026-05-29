# Notes9 Redesign Audit — 2026-05-23

Diagnosis-only report from three parallel code audits (design system primitives, product surfaces, AI surfaces) against the `redesign-existing-projects` skill, **plus a runtime click-through audit added 2026-05-23**. **No code was modified.** Marketing surfaces excluded per project memory.

Findings are ranked by **impact / effort** so you can pick the slice. Each item carries a `file_path:line_number` citation and a one-line fix direction. Three agent claims were verified after the runs (gradient cliché — confirmed; reduced-motion coverage — partially present, not absent; DOMPurify SSR fix in the runtime audit — proposed fix would re-introduce a build break, corrected below).

---

## Tier −1 — Hot-fix queue (broken / blocking)

These are bugs and dead UI from the runtime click-through. They jump the redesign queue.

1. **DOMPurify SSR crash.** `lib/sanitize-html.ts:46`. The file deliberately uses browser-only `dompurify` (per the leading comment — `isomorphic-dompurify` was rejected because it pulls `jsdom → undici → node:worker_threads` and breaks Turbopack's NFT tracer during `next build`). The crash happens because `"use client"` components still get a server pass in RSC; DOMPurify v3 has no `.sanitize` without a `window`. **Correct fix:** guard with `if (typeof window === "undefined") return ""` (let the client `useMemo` re-run on hydration) — do *not* swap to `isomorphic-dompurify`.
2. **Projects → Team → "Add Member" button is dead.** Click does nothing, no modal, no toast. Either implement the invite flow or remove the button until it ships.
3. **Tasks panel groups all rows under "Completed".** Dashboard `todo-panel.tsx`. Tasks with no `title` render their raw UUID. Fix grouping (Today/Open/Completed) and make `title` required at the data layer + show validation.
4. **Settings → Preferences "Configure" buttons navigate back to Account.** Two non-functional buttons (Email Notifications, Default View). Either implement the dialogs or hide the buttons.
5. **Reports has duplicate "Generate Report" + "+ New Report" buttons** opening the same dialog. Pick one.
6. **Dashboard composer text doesn't carry into Catalyst when the panel opens.** Pass the typed string into the panel's input on mount. Also disable Send when the dashboard composer is empty (currently active).
7. **Schedule labels next-day as "TODAY".** Day-view label is hard-coded; should derive from the actual selected date and only say "Today" when it matches `new Date()`.

---

## Tier 0 — Top 10 wins, ranked

These are the single highest-leverage changes — most are touch-one-file or extract-a-primitive.

1. **Catalyst orange→pink gradient is off-brand.** `components/catalyst/catalyst-messages.tsx:131, 217, 249`, `components/catalyst/chat-history.tsx:36, 39`, `components/catalyst/catalyst-sidebar.tsx:48`. Solid burnt-sienna `bg-primary text-primary-foreground` (or `--n9-accent`) keeps it on-palette. The gradient is the dominant "generic AI app" tell across the whole product.
2. **Driver.js tour theme hardcodes slate `#f8fafc/#0f172a`.** `app/globals.css:478–494`. Replace with `var(--card)/var(--foreground)/var(--border)` so onboarding doesn't look bolted on.
3. **Extract `<PageHeading>` / `<PageSubheading>`.** `text-2xl font-bold tracking-tight md:text-3xl` is hand-typed in ~18 page files (experiments, protocols, projects, samples, equipment, reports, literature-reviews, lab-notes, settings). A single primitive makes the next font swap a one-file change and lets you wire `.font-display` consistently.
4. **Sonner / `useToast` split — 62 callers still on the legacy hook.** Sonner is the mounted Toaster; `@/hooks/use-toast` is dead-weight. Codemod imports to `import { toast } from 'sonner'`, delete `hooks/use-toast.ts`.
5. **`100vh` → `100dvh` everywhere.** Confirmed instances: `app/(app)/papers/papers-page-inner.tsx:202`, `samples/[id]/sample-protein-viewer.tsx`, `samples/[id]/sample-plasmid-viewer.tsx`, plus the `calc(100vh - 180px|360px|320px)` magic-number family. iOS Safari address bar push-down breaks all of these.
6. **Extract `<ViewModeToggle grid|table>`.** Duplicated state + JSX in `experiments-list.tsx`, `project-list.tsx`, `paper-list.tsx`, samples, equipment. ~5 list pages with identical logic.
7. **Add `dialogSize` token (sm/md/lg/xl) on `components/ui/dialog.tsx`.** Concrete widths in tree: `max-w-[425px]`, `max-w-[600px]`, `max-w-md`, `max-w-2xl`, `max-w-4xl`, `sm:max-w-[900px]`, `w-[min(96vw,1280px)]` — 9 distinct sizes across 12+ modals.
8. **Card lacks variants — every card is border+shadow+bg.** `components/ui/card.tsx:10`. Add `variant="ghost" | "filled" | "outline"` so list-item cards can flatten and selected/hover states have somewhere to go.
9. **Button has no `active:` state.** `components/ui/button.tsx:7–39` — only `hover:bg-primary/90`. Add `active:scale-[0.98]` (or `active:translate-y-px`) plus `disabled:cursor-not-allowed`. Affects every click in the product.
10. **CatalystSectionHero is on ~20 list pages including filtered/scoped ones.** Plus several wrong `scope` strings (projects passes `scope="lab"`, papers passes `scope="writing"`). Either fix the scopes or gate the hero behind a per-route allowlist — right now it dilutes the AI affordance and inflates above-the-fold weight.

---

## Tier 1 — Design system (foundation work)

### Typography
- **Headings auto-`font-semibold` via globals.css** but no per-level explicit weight; mid-weights (500/600) loaded but never used in primitives. `app/globals.css:209`. Wire 500/600 into a heading scale (`PageHeading`, `SectionTitle`, `CardTitle`).
- **No body line-length cap.** Article/form text runs full-container. Add `max-w-prose` / `max-w-[65ch]` on `<p>` containers in lab-notes, protocols, papers detail views.
- **No tabular nums anywhere data is shown.** Dashboard counters, table numbers, run logs misalign across rows. Add `font-variant-numeric: tabular-nums` to a `.numeric` utility or on table `<td>`s for stat columns.
- **No letter-spacing on display sizes.** Serif headlines benefit from `tracking-tight` at 4xl+. Apply globally to `h1, h2` in `@layer base`.
- **Serif lacks full OpenType stack.** `.font-display` already enables `ss01`; consider `liga`, `dlig`, and number set toggles for editorial moments.

### Color & surfaces
- **Comment-mark SVG icon hardcoded `#3b82f6` blue.** `app/globals.css:432`. Use `var(--primary)`.
- **SeqViz selection rect `#0284c7/#38bdf8` sky-blue.** `app/globals.css:1086, 1091`. Replace with `--tertiary` or `--n9-accent` — currently the brightest non-brand color anywhere in the product.
- **TipTap color picker swatches hardcoded web colors.** `components/text-editor/tiptap-editor.tsx`. Surface brand palette tokens first, generic swatches second.
- **Dark mode `--accent: rgba(233, 198, 181, 0.16)`** muddies on `#221d18` card. `app/globals.css:92`. Use a solid lightened mix (`#3a2a22` or similar) instead of opacity overlay.
- **Shadows pure black with fixed opacity.** Driver.js shadows + most cards. Tint to `rgba(150, 80, 52, …)` light / `rgba(0, 0, 0, …)` dark to keep depth warm.
- **Highlight `--highlight: #ffff00`** is raw yellow on cream — low contrast, screams. `app/globals.css:61`. Try a warmer gold (e.g., `#f4c450`) for both modes and let `mark` inherit it.
- **No grain/noise on large surfaces** — bg + card both flat. Add a 2–3% noise layer (single fixed PNG, `pointer-events-none`) for editorial depth, matching the IBM Plex Serif voice.

### Radius, spacing, z-index
- **`--radius` set twice (0.625rem at `:root`, 0.75rem in `@theme inline`).** `app/globals.css:25, 181`. Pick one and document a per-primitive scale (button `md`, card `xl`, dialog `xl`).
- **Sidebar widths live in two places** — `components/ui/sidebar.tsx:31–33` declares `SIDEBAR_WIDTH = '16rem'`, but `components/layout/app-layout.tsx:330` passes `initialWidth: 280|240`. Pick one and import.
- **`z-[9999]` hardcoded in 2 files** (`navigation-loader.tsx`, `text-editor/tiptap-editor.tsx`). Rest of app is on a semantic `z-[120..131]` scale. Promote to a documented scale (toast=120, sidebar-overlay=125, modal=130, navigation-loader=140) — or just fold into Tailwind theme tokens.

### Interactivity
- **Focus rings inconsistent.** Button + input + badge use `ring-[3px]`, but tabs/navigation-menu use `ring-2`. Pick `ring-2` site-wide for accessibility consistency.
- **Transition durations scattered** (100/200/300/500/1000ms). Sheet uses asymmetric `closed:300, open:500`. Standardize on 240ms `cubic-bezier(0.4, 0, 0.2, 1)` for everything that isn't a long page transition.
- **No global `html { scroll-behavior: smooth }`.** Inline `scroll-smooth` is scattered. Move to `@layer base`.
- **Reduced-motion coverage incomplete.** `app/globals.css` already covers `.n9-conn-flow, .n9-hub-dash-flow, .animate-page-transition, .animate-flow-pipeline, .animate-cursor-blink`. Missing: Tailwind's `animate-pulse`, `animate-spin`, all `.loader-*` keyframes, `.animate-shimmer`, `.notes9-md--streaming::after` cursor. Add a single block that disables `animation` on the `.loader-*` family + `.animate-pulse`/`.animate-spin` under `prefers-reduced-motion: reduce`.

### State coverage
- **`<Skeleton>` is one variant** — no `text`, `image`, `table-row`, `card` variants. `components/ui/skeleton.tsx`. Add variants so per-route loading.tsx can drop in shape-correct stand-ins.
- **No `<ErrorBoundary>` primitive.** Pages roll their own. Ship one in `components/ui/error-boundary.tsx` and have `error.tsx` files import it.
- **No `<FormError>` / `<FieldError>` primitive.** Input has `aria-invalid` plumbing but no companion text component; validation is screen-reader-only. Visible errors are inconsistent across forms.
- **Missing `app/not-found.tsx`.** Default Next.js 404 ships unbranded. Use `<Empty>` + a "back to dashboard" link.
- **Missing "Skip to content" link** in `components/layout/app-layout.tsx`. Add `<a href="#main" className="sr-only focus:not-sr-only ...">` before the header.

### Iconography
- **Lucide everywhere (~105 files).** Stroke widths are default 2px — consistent enough. Two paths forward: (a) accept Lucide and theme stroke to 1.75 for a slightly more editorial feel; (b) introduce ~6 hand-drawn lab icons (beaker, microscope, plasmid, pipette, dish, notebook) for the surfaces where AI/lab metaphor matters and keep Lucide for utility.
- **Sparkles icon = AI everywhere.** `chat.tsx:502`, `catalyst-greeting.tsx`, `agent-thinking-bar.tsx`, `agent-workflow-studio.tsx`. Retire on Catalyst entry points in favor of the Notes9 mascot mark or a beaker silhouette.

---

## Tier 2 — Product surfaces (per-route)

### Dashboard (`app/(app)/dashboard/*`)
- `page.tsx:67` — `min-h-[min(100%,calc(100dvh-17rem))]` carries a magic 17rem nav height; derive from CSS var or layout constant.
- `dashboard-greeting.tsx:49–52` — Name fallback chain splits email — fragile when email is absent; add null guard + display-name fallback.
- `loading.tsx:9` — Wraps the whole skeleton in `animate-pulse`; should let each skeleton control its own pulse to avoid CLS during partial replacements.
- `page.tsx:100–163` — 64 lines of commented-out stats grid; either ship behind a flag or delete (per [[notes9-ux-punch-list]]).
- `todo-panel.tsx:442` — legacy `useToast`; migrate to sonner.

### Lab notes (`app/(app)/lab-notes/*`)
- `page.tsx:238` — "Access and manage lab notes across your experiments" is passive; flip to verb-first.
- `page.tsx:241–263` — view-mode toggle inlined; extract `<ViewModeToggle>`.
- `page.tsx:305–315` — bespoke empty state; route through `<Empty>` primitive.
- `error.tsx:13` — raw `<button>` styled by hand; replace with shadcn `<Button autoFocus>`.

### Experiments (`app/(app)/experiments/*`)
- `page.tsx:84` — "Manage and track all experimental procedures" — generic; rewrite to user benefit.
- `page.tsx:95–105` — `size="icon"` button with text label inside; either drop the icon size or strip the label.
- `experiment-list.tsx:100+` — duplicate view-mode toggle.
- `[id]/experiment-tabs.tsx:147–155` — disabled "Reserve Equipment" button looks active; replace with muted "coming soon" line.
- `[id]/experiment-steps-tab.tsx:47–63` — `text-blue-600`, `text-green-600`, `border-l-orange-400` bypass tokens; map to semantic `--status-*` tokens.
- `[id]/experiment-actions.tsx:38,47,56` — `icon-sm` (32px) below 40px touch target; bump to `size="icon"`.
- `loading.tsx:10` — `BreadcrumbSkeleton w-56` hard-coded; use `w-max`.

### Protocols (`app/(app)/protocols/*`)
- `page.tsx:102` — `CatalystSectionHero scope="protocols"` on a list page; verify the scope route is correct.
- `error.tsx:12` — raw HTML button; replace with shadcn `<Button>`.
- `[id]/protocol-editor.tsx` — no breadcrumb or back affordance.
- No pagination on protocols list — table grows unbounded.

### Literature reviews (`app/(app)/literature-reviews/*`)
- `page.tsx:101–104` — page heading without `.font-display`; route through new `<PageHeading>`.
- `page.tsx:120–131` — two-button row wraps poorly on mobile; add `flex-wrap` + clear priority order (primary action first).
- No empty state when `literature_reviews.length === 0` — jumps straight to empty tabs.
- `error.tsx:13` — raw `<button>` (per [[notes9-ux-punch-list]]).

### Projects (`app/(app)/projects/*`)
- `page.tsx:50` — `DashboardGreeting` re-rendered on projects page; double-check that's intentional, otherwise scope it to the dashboard route.
- `page.tsx:52` — `scope="lab"` on projects page; should be `"projects"`.
- `project-list.tsx:45–77` — duplicate view-mode toggle + filter state.

### Papers (`app/(app)/papers/*`)
- `page.tsx:8` — `scope="writing"` on papers; rename or remove.
- `papers-page-inner.tsx:202` — `style={{ height: "calc(100vh - 180px)" }}` magic number, also `100vh` (should be `100dvh`).
- Missing `error.tsx`.
- `paper-list.tsx:52–65` — duplicate view-mode toggle.

### Equipment (`app/(app)/equipment/*`)
- `equipment-page-content.tsx:80–103` — duplicate filter + view-mode toggle.
- `loading.tsx:1–34` — bespoke table skeleton (5 hardcoded rows); replace with `<TableListSkeleton>` like its siblings.
- Missing `error.tsx`.

### Samples (`app/(app)/samples/*`)
- `samples-page-content.tsx:26–32` — status-count "cards" are ad-hoc divs with semantic color classes; standardize on a `<StatCard>` primitive.
- `[id]/page.tsx:182` — page heading without `.font-display`.
- Plasmid + protein viewers use `calc(100vh - 360px|320px)` — `100dvh` migration + magic-number comments.
- Missing `error.tsx`.

### Reports (`app/(app)/reports/*`)
- `reports-page-client.tsx:101` — heading without `.font-display`.
- `loading.tsx:7` — `TableListSkeleton showFilters={false}` — confirm the prop is wired in the skeleton, otherwise remove.
- Missing `error.tsx`.

### Settings (`app/(app)/settings/*`)
- `page.tsx:438–451` — two `title="Coming soon"` disabled buttons; either render as a "coming soon" badge with no button affordance, or remove until shipped.
- `page.tsx:403–428` — Sun/Moon/Monitor theme toggle uses three buttons without keyboard hint; add `kbd` hint or move to a single rotating button with state.
- `page.tsx:249` — avatar `h-20 w-20` literal; declare `--avatar-xl` token.

### Cross-surface
- **No back navigation on detail pages** — samples, equipment, protocols, papers `[id]` views. Add breadcrumb in `app/(app)/layout.tsx` driven by route segments.
- **No current-page indicator in sidebar** — verify `app-sidebar.tsx` reads `usePathname()` and applies `aria-current` + active styling.
- **Mutation buttons** disable on click but show no in-flight spinner — users can't tell if save fired. Add `loading` prop on `<Button>` that swaps content for `<Loader2 className="animate-spin">`.

---

## Tier 3 — AI surfaces (Catalyst, research-map, agent-studio)

### Catalyst chat / modal
- **Orange→pink gradient circles** around Sparkles — `catalyst-messages.tsx:131, 217, 249`, `chat-history.tsx:36`, `catalyst-sidebar.tsx:48`. Confirmed off-palette. Replace with `bg-primary` + `text-primary-foreground`.
- `chat.tsx:545–579` — suggestion chips render in modal but `onSuggest` isn't wired there; chips look clickable, do nothing. Either wire the handler or hide chips when handler is absent.
- `chat.tsx:603–611` — error state is a flat destructive/10 block with no retry button. Add an inline "Retry" button and an "Open logs" link.
- `chat.tsx:497` — Escape closes the dialog without confirming an in-progress draft; trap-and-confirm, or persist draft to sessionStorage.
- `chat.tsx:613–632` — streaming cursor relies on `animate-cursor-blink`; under `prefers-reduced-motion` the cursor is invisible because the keyframes are disabled (good) but no static fallback exists (bad). Render a stable `opacity-70` `▌` glyph as the base, animate on top.
- `chat.tsx:638–649` — jump-to-bottom button hit area is 36px with 16px icon; grow to 40px on mobile.
- Catalyst chat lacks the "stream quiet for Xs" warning that `components/literature-agent-thinking-panel.tsx:55–72` already implements — port the pattern over.

### Thinking / streaming feedback
- `components/catalyst/agent-thinking-bar.tsx:36–42` — 1.5px pulsing dot is hard to see at retina density; bump to 2.5px or swap pulse for a 360° shimmer ring.
- `agent-stream-reply.tsx:188–192` — standalone cursor sized `h-[1em]`; fix to `h-4 w-1` for visual stability across font contexts.
- `agent-stream-reply.tsx:129–156` — fallback legacy thinking steps use `animate-pulse` on last step; under reduced motion, last step is indistinguishable. Add opacity/color shift on active step.
- `agent-thinking-bar.tsx:32` — stage copy "Reading question", "Searching workspace" is technical; rewrite to user-facing: "Reading your message", "Searching your notes".
- `agent-flow-pipeline.tsx:~180–200` — pipeline strip shows stages but no elapsed time per stage; add a small `text-muted-foreground text-xs` ticker so users can tell a stuck stage from a slow one.

### Research map
- `components/research-map/research-map-view.tsx:641–650` — empty-state copy generic; add CTA: "Create your first experiment" / "Add a paper" + link.
- `:353` baseline edge opacity 0.85 — combined with `:565` 0.08 idle for inactive edges, dense graphs lose all relationships. Lift idle to 0.18–0.22 so the structure stays scannable.
- Nodes differ by color only — add a per-`kind` shape or icon for accessibility (color-blind users).
- `:529–531` `fitView({ duration: 200 })` no easing; pass `easing: cubicInOut`.
- `:701` minimap mask `rgba(150,80,52,0.10)` — on light canvas the viewport lens is faint; bump to 0.18 for the light theme only.

### Agent studio
- `app/agent-studio/page.tsx` — page is bare; add a short intro explaining what the studio is and a "First run" CTA.
- `components/settings/agent-workflow-studio.tsx` — hardcoded 6-agent preset; no add/remove/reorder UI. Either ship a true composer or rename to "Agent pipeline" so the preset framing is honest.
- No visible **cost / token / latency** per run anywhere in the studio. For governance this is the single biggest gap.
- No audit trail for config changes (who toggled which stage off and when).

### Cross-AI patterns
- **Sparkles icon overuse.** Retire from chat header / greeting / studio in favor of the Notes9 mascot mark or a beaker/microscope.
- **No unified loading metaphor** — chat uses cursor + pulse, studio uses spinner + progress bar, research map uses overlay. Pick two metaphors total (e.g., progressive cursor for token streams, `<PageLoader>` for waterfalls) and apply them everywhere.
- **Tool-call retry** — when a tool fails (RAG/web-search/edit), no per-tool retry; user has to re-send the entire turn. Add a `↻` retry on the failed tool card in `agent-tool-cards.tsx`.
- **Modal backdrop intensity** is Radix default everywhere; no shared scrim utility. Define a `--scrim` token and apply consistently.

---

## Tier 4 — Runtime / interaction findings (manual click-through, 2026-05-23)

Findings the static code audits couldn't catch. Grouped by surface.

### Global shell
- **Logo not clickable** — should route to `/dashboard`.
- **Sidebar "narrow" intermediate state truncates labels** ("Dashbo…", "Researc…") with no tooltip. Either snap to two states (full / icon-only) or add hover tooltips on truncation.
- **Global search is scoped to "files or documents"** — typing "CRISPR" returns nothing even though projects/experiments named CRISPR exist. Add cross-entity search (projects, experiments, lab notes, literature, samples, tasks, papers) and a `⌘K` shortcut.
- **"Writing" nav routes to `/papers`** — URL/label mismatch. Rename one.
- **Recent Projects re-skeletons for ~3s on every navigation** — cache in client state.
- **Help (?) tour is the same on every page.** Make it context-aware and persist a "don't show again".
- **Theme toggle in top bar is binary, Settings exposes a 3-way (Light/Dark/System).** Make the top-bar toggle 3-way and keep both UIs in sync.
- **User name truncation** ("Venkata Ramana Reddy …") with no tooltip.

### Dashboard
- **Schedule / Day view with no events shows blank** — should still render the empty time grid.
- **Add an Event form** is missing date picker (events default to today) and has only one duration (30m). Color palette is 4 swatches; Whiteboard uses 5+. Align both to design-system tokens.
- **Whiteboard new notes stack at the same coordinates.** Auto-offset placement; add Cmd+Z undo for note deletion. The "white/blank" 6th swatch is indistinguishable from "paper" — add a border or label.

### Projects
- **Table view drops critical columns** (Status, Priority, Lead, member count, experiment count, last activity) — Grid view shows them but Table only has Project Name + Created + Actions.
- **No Status field at Create or Edit** — projects can never leave "planning" from the UI. The Status filter then promises filtering by statuses that can't be reached.
- **Status / Priority filters are data-derived** — only show enum values that already exist in data. Hard-code the full enum and show per-status counts. (Same bug on Experiments, Literature, Reports.)
- **Delete project = one red click** with no typed-confirmation. Cascades to all experiments, lab notes, files. Require typed name confirmation.
- **Project switcher has no search.** Add an inline filter for >10 projects.
- **Module card "+" semantics inconsistent** (Literature `+` = "Add Reference"; other modules unclear). Add tooltips and standardize.

### Literature
- **Example queries on Search & Read are not clickable** — make them populate the search.
- **OPEN buttons on saved references appear visually disabled** (light brown faded) — either implement the open-detail view or remove the visual.

### Experiments
- **Status filter is empty taxonomy.** Define the enum (Planned / In Progress / Completed / Failed / Paused).
- **Data & Files surfaces 0-byte rows from failed uploads** with no error. Show upload status (queued / uploading / failed), allow retry, warn on 0-byte saves.
- **Lab-notes toolbar icons have no tooltips** — mic, calculator, grid, Σ, superscript are non-obvious. Add `title` or shadcn `<Tooltip>`.
- **Steps tab shows a spinner with no editor visible.** Build the step editor (drag-to-reorder, mark complete, attach files).

### Catalyst
- **Chat titles default to first user message** ("Hello", "hi", "hello" duplicates everywhere). Auto-summarize after 3–5 turns or let user rename.
- **Citation pills break inline reading flow.** Tighten or move to superscript.
- **Web toggle has no tooltip** explaining what it enables.

### Research map
- **Default zoom is too far out** — node labels unreadable. Call `fitView` (with easing — see Tier 3) on mount.
- **No "Solo this type" affordance** in entity-type filters — users uncheck 6 boxes to focus 1.
- **No keyboard `+`/`-` zoom shortcuts.**

### Writing (Papers)
- **No document-type selector** at creation (Manuscript / Grant / Thesis / Abstract). All papers are generic.
- **Per-paper tabs accumulate with no close (×) or overflow menu.**

### Reports
- **Two reports with identical names + identical dates** — auto-append a version suffix or warn on duplicate.
- **"draft" status tag in Report detail is not editable** — make tag chips clickable to change status.

### Settings
- **Email field locked with no helper text.** Add "Contact support to change" or enable with verification.
- **No 2FA section.** Add to Account tab.

### Cross-app
- **Mascot loader vs skeleton rows mixed across surfaces.** Pick one metaphor (skeleton is faster).
- **Icon-only buttons missing `aria-label`** in lab-notes toolbar, whiteboard swatches, research-map zoom controls.
- **Truncated text everywhere lacks `title` attr** — recent projects, user name, file names.

---

## Fix priority (mapped to the skill's order)

The skill orders changes by impact-vs-risk. Mapping our findings:

| # | Skill step | Notes9 work |
|---|---|---|
| 1 | Font swap | Done already (tri-font system) — no work. |
| 2 | Color cleanup | Tier 0 #1 (Catalyst gradient), Tier 0 #2 (Driver.js theme), Tier 1 color/surfaces sweep (comment-mark, SeqViz, TipTap palette, dark accent, highlight). |
| 3 | Hover / active / focus states | Tier 0 #9 (button active state), Tier 1 interactivity (focus ring consistency, transition durations, scroll-behavior). |
| 4 | Layout & spacing | Tier 0 #5 (100dvh), Tier 0 #7 (dialog sizes), per-route magic-number cleanup. |
| 5 | Replace generic components | Tier 0 #3 (PageHeading), #6 (ViewModeToggle), #8 (card variants), AI-cliche sparkles + gradient. |
| 6 | Add loading / empty / error states | Tier 1 state coverage (Skeleton variants, ErrorBoundary, FormError, 404, Skip-to-content), Tier 2 missing error.tsx files. |
| 7 | Polish typography | Tier 1 typography (line length, tabular nums, letter-spacing, OpenType). |

---

## Suggested first slice

If you want one PR-sized chunk to start: **Tier 0 #1, #2, #9, plus Tier 1's reduced-motion gap**. Touches `catalyst-messages.tsx`, `catalyst-sidebar.tsx`, `chat-history.tsx`, `app/globals.css`, `components/ui/button.tsx`. Visible everywhere, lowest regression risk, sets the precedent (brand palette over generic AI tropes) that everything else builds on.

If you want the highest-leverage **primitive** change first: **Tier 0 #3 (`<PageHeading>`)** — extracts the most-repeated bit of markup in the product and lights up `.font-display` consistency in a single commit.
