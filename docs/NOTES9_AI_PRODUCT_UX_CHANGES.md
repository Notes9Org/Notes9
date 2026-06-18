# Notes9 → "Mature AI Product" — Consolidated UX/UI Changes List

**Date:** 2026-06-17
**Method:** 4 parallel specialist design sessions (the product-team hierarchy you asked for) auditing the live codebase, then synthesized + deduped:
1. **Visual / UI Designer** — AI-grade visual identity within the warm Notes9 theme.
2. **UX Designer / Researcher** — flows, trust legibility, cognitive load, psychology.
3. **Motion & Interaction Engineer** — loaders, animation, perceived speed, smoothness.
4. **Interaction-Integrity & Accessibility QA** — dead buttons, error/crash risk, WCAG 2.2.

**Scope:** in-app surfaces only (`app/(app)/*` + their components). Marketing excluded per standing decision.

---

## ✅ Locked decisions (2026-06-17 refinement)

1. **AI visual signature → distinct AI accent, in-palette.** Catalyst surfaces are visually *marked* as AI: burnt-sienna identity rail + soft apricot glow + a hair of tint + a `✨ Catalyst` glyph — all derived from existing tokens, zero new hues. Not pure-cohesion (AI must stand out), not violet (killed).
2. **Catalyst deep first.** Perfect the AI chat surface end-to-end (the accent system + Waves 1–5 applied to Catalyst), validate it, *then* roll the same language outward to the other ~14 surfaces.
3. **Both intelligence features are in the core:** Evidence drawer (`rag_chunks`) **and** entity-scoped "Ask Catalyst about this."
4. **Nav mascot loader → gated behind ~200ms delay.** Fast/cached routes feel instant (their `loading.tsx` carries them); the mascot only appears when a nav is genuinely slow. Keep the moment, drop the tax.

## Refined build sequence (Catalyst-deep-first)

> Each step ends with a real-runtime check (`/browse` or run the app) per the "verify UI before claiming fixed" rule — tsc/green ≠ works.

- **Step 0 — AI design-token foundation** (`globals.css`): AI-signature tokens (`--n9-ai-surface`, `--n9-ai-surface-active`, AI glow), confirm/strengthen `.surface-primary` (apricot-ring hero), `.assistant-rail`, `.ai-shimmer`; motion tokens (`--motion-fast/base/slow`, easings); `@keyframes n9-turn-in`; helpers `.n9-icon-tile(--ai)`, `.ai-entry-label`, `.n9-card-interactive`; add `animate-accordion-*` to the reduced-motion block. *(enables every later step; nothing visual until adopted)*
- **Step 1 — Wave 1, Catalyst-scoped:** kill violet/blue in `catalyst-section-hero`, `tool-status-bar`, `agent-artifact-card`, `CatalystComposerSkeleton`.
- **Step 2 — Wave 2, Catalyst:** assistant bubble → `.surface-primary` + `.assistant-rail` + apricot glow + `✨` glyph; running tool cards → `.ai-shimmer`+`.surface-recessed`; reasoning/synthesis/SQL → `.surface-recessed`; live spinner/synthesis → brand shimmer/dot; turn entrance `n9-turn-in`.
- **Step 3 — Wave 4:** lit-agent Stop; Catalyst error Retry; silent-failure toasts (chat upload/re-sign); create-success toasts.
- **Step 4 — Wave 5 (Catalyst + nav):** gate nav loader (200ms); real `catalyst/loading.tsx` skeleton; choreograph expand/collapse; shimmer skeletons; replace bare "Loading…" in chat-history/catalyst-sidebar.
- **Step 5 — Wave 3 (Catalyst):** always-on 4-state trust chip; tool elapsed + shimmer; **evidence drawer** (`rag_chunks`); **entity-scoped "Ask Catalyst"** on papers/notes/samples/map.
- **Step 6 — Roll outward (Waves 6/7/8):** empty-tile warmth, `PageHeading`/`<Empty>` adoption, card hover, toast/label consistency, a11y batch, motion-token + loader-contract adoption across the other 14 surfaces.

---

## Executive verdict

Notes9 is **closer to a mature AI product than most early-stage tools** — the Catalyst chat already surfaces ~85% of its backend (streaming, tool cards, per-claim citations + span viewer, grounding badges, Stop, artifacts) and is *ahead* of Perplexity/ChatGPT on citation rigor. The gap to "premium AI product" is **coherence + adoption, not missing capability**:

- **The product owns a beautiful AI design language it never turned on.** `globals.css` defines `.surface-primary`, `.surface-recessed`, `.assistant-rail`, and `.ai-shimmer` — token-derived, dark-mode-safe, reduced-motion-safe — and they're used in **1 component out of dozens**. Running states fall back to generic spinners; the answer (the product's whole value) renders on flat `bg-muted`, the same grey as a disabled input.
- **Off-brand "AI blue/violet" leaks into the hero.** The embedded Catalyst composer, the artifact image tiles, the tool-status colors, and the composer skeleton all use `violet-*`/`blue-*`/`purple-*` — the exact "default AI slop" tell — fighting the warm rust/cream brand at the moment the user touches AI.
- **Trust is signaled only on failure.** A well-grounded answer is visually silent; only degraded/failed answers get a badge. Users never learn to trust the *good* answers.
- **The AI doesn't feel like it knows your workspace.** On a paper/note/map-node the user must re-describe context the app already holds — the "AI that knows *your* research" promise isn't made tangible.
- **Good news on your two explicit asks:**
  - **No dead buttons.** Zero confirmed no-op/`href="#"`/empty-handler controls in-app. The only inert controls are honest "coming soon" *disabled* states (2FA, email notifications, default view, equipment reservation).
  - **No crash bugs found** — the one "crash" claim was corrected to a NaN-render edge case; a handful of async handlers fail *silently* (no toast), which is the real integrity gap to close.

**The thesis: stop building, start *expressing*.** Turn on the design language you already wrote, kill the blue, make trust always-visible, and scope the AI to context. That converts "tasteful doc app with an AI feature" into "AI research product."

---

## The changes — organized as execution waves

Effort: **S** ≤2h · **M** ½–1 day · **L** multi-day. Priority: **P0** do first → **P3** polish.
Every change stays inside the existing rust/cream palette + tri-font system. None resurrects the removed stage-stepper/pipeline; none touches the smart auto-scroll.

### Wave 1 — Brand coherence: kill the off-brand "AI blue" (P0, mostly S)
*Highest return / lowest risk. The biggest single dissonance in the product.*

| # | Change | Files | Visual impact | Psychological impact | Effort |
|---|--------|-------|---------------|----------------------|--------|
| 1.1 | Recolor embedded Catalyst composer from `violet-*` → `--primary`/`--n9-accent-glow` | `components/catalyst/catalyst-section-hero.tsx:28-35` | Hero AI entry coheres with brand instead of reading as a 3rd-party purple widget | Removes cognitive dissonance at the *first* AI touch; Catalyst feels native, not bolted on | S |
| 1.2 | Recolor tool-status colors `blue/purple/green/orange` → brand tints | `components/catalyst/tool-status-bar.tsx:14-40` | AI tool states stop looking generic | Generic blue = "default AI"; brand color = "designed product" | S |
| 1.3 | Recolor artifact image tiles `violet-*` → `--primary` | `components/catalyst/agent-artifact-card.tsx:53-65` | Figures match the rest of the AI surface | Kills "this was bolted on" signal | S |
| 1.4 | Recolor Catalyst composer skeleton `violet-*` → brand | `components/loading/page-skeletons.tsx:53` | First-paint on dashboard/lists is on-brand | Premium feel from the very first frame | S |

### Wave 2 — Turn on the AI design language you already wrote (P0–P1, S–M)
*Adopt the dormant `globals.css` utilities everywhere a turn/tool/panel renders.*

| # | Change | Files | Visual impact | Psychological impact | Effort |
|---|--------|-------|---------------|----------------------|--------|
| 2.1 | Assistant answer bubble → `.surface-primary` + `.assistant-rail` | `components/catalyst/chat-message.tsx:184-200` | The answer becomes the visual hero (elevation + burnt-sienna identity rail) vs flat grey | The AI's voice reads as considered & authoritative | S |
| 2.2 | Running tool cards → `.ai-shimmer` (+ `.surface-recessed`) | `components/catalyst/agent-tool-cards.tsx:109-114` | One warm sweep across every busy block vs scattered spinners | "It's working, orchestrated" — reduces latency anxiety | S |
| 2.3 | Reasoning panel + synthesis checklist + SQL block → `.surface-recessed` (replace duplicated inline Tailwind) | `agent-reasoning-panel.tsx:43`, `agent-stream-reply.tsx:201,279` | Establishes answer > evidence > reasoning hierarchy; one vocabulary | Reasoning reads as *process*, the answer feels *earned* | S |
| 2.4 | Active synthesis step + live "Gathering sources" → brand shimmer/dot, not lucide spinner | `agent-stream-reply.tsx:185-241` | Hero AI moments stop using the same spinner as a form button | Coherent "thinking" language = craft | S |
| 2.5 | Add entrance micro-motion to each new assistant turn (`@keyframes n9-turn-in`, ~100ms lift) | `globals.css` + `catalyst-messages.tsx` | Turns "arrive" rather than silently appear | The AI feels like it's *speaking* | S |

### Wave 3 — Make trust + intelligence visible (P1–P2, S–M)
*The deepest perceived-intelligence levers. (3.2/3.3 already specadvanced in `CATALYST_CHAT_UX_AUDIT.md` I5/I4/I3.)*

| # | Change | Files | Visual impact | Psychological impact | Effort |
|---|--------|-------|---------------|----------------------|--------|
| 3.1 | Always-on 4-state trust chip (ok/floor/degraded/failed) on every settled answer | `agent-stream-reply.tsx:316-354` | A consistent "Grounded · N sources" affordance, not just amber-on-failure | Positive evidence builds *standing* trust; teaches where to look | S |
| 3.2 | Per-entity "Ask Catalyst about this" (pre-scoped launch) on papers/notes/samples/map nodes | `papers/`, `lab-notes/`, `samples/`, `research-map/` (use existing `openCatalystPanel(scope)`) | A scoped AI entry point on each entity | "It already knows what I'm looking at" = intelligence + delight | M |
| 3.3 | Evidence drawer — render the `rag_chunks` the backend already streams (ranked snippets + page) | new `EvidenceDrawer` in `agent-tool-cards.tsx`, cross-linked from `inline-citation.tsx` | Retrieved passages become visible under tool cards | "I can check its work" — the deepest trust lever | M |
| 3.4 | Tool elapsed counter + shimmer on cards running >3s (client timer) | `agent-tool-cards.tsx` | A 1s and 30s tool no longer look identical | Kills the #1 "is it stuck?" anxiety | S |

### Wave 4 — Agent control & honest failure (P0–P1, S)
*Table-stakes for a trustworthy agent; closes the silent-failure integrity gaps.*

| # | Change | Files | Visual/UX impact | Psychological impact | Effort |
|---|--------|-------|------------------|----------------------|--------|
| 4.1 | Stop/cancel button on the **literature agent** (mirror Catalyst's `AgentStopButton`) | `components/literature-agent-thinking-panel.tsx:75-112` | An exit on long/wrong runs | Removes "trapped" feeling; control = trust | S |
| 4.2 | "Try again" / Regenerate on Catalyst error turns (the `regenerate` fn already exists) | `agent-stream-reply.tsx:150-156` | Errors become recoverable in one click | Errors feel survivable, not terminal | S |
| 4.3 | Fix silent async failures — add error toasts/retry | upload re-sign `chat.tsx:159-279`, new lab note `new-lab-note-dialog.tsx:123`, todo mentions `todo-panel.tsx:568`, calendar add `dashboard-calendar.tsx:384`, PDF analyze `upload-literature-pdf-dialog.tsx:174` | User no longer left guessing after a failed action | Every action reaches closure = confidence | M |
| 4.4 | Success toast on entity create (currently silent navigation) | projects/samples/equipment `/new` | Confirms the write "took" | Reduces "did that work?" double-checking | S |

### Wave 5 — Loaders, skeletons & perceived speed (P0–P2, S–M)
*Make it *feel* fast and finished everywhere.*

| # | Change | Files | Visual/speed impact | Psychological impact | Effort |
|---|--------|-------|---------------------|----------------------|--------|
| 5.1 | Fix nav interstitial: drop `MIN_LOADER_DURATION_MS` 350→~120ms or gate behind ~200ms delay; let route `loading.tsx` carry fast nav | `components/navigation-loader.tsx:7,218-341` | Removes a literal 350ms tax on every cached/instant navigation | App feels *instant*, not "always loading" | M |
| 5.2 | Replace bare "Loading…" text with shape-matched skeletons | `chat-history.tsx:57`, `catalyst-sidebar.tsx:84`, `app-sidebar.tsx:804`, `dashboard-recent-work.tsx:145`, `papers-page-inner.tsx:150`, `settings/page.tsx:304`, +~10 | Polished, layout-true loading parity across surfaces | "Loading…" text is the universal cheap-app tell | M |
| 5.3 | Upgrade skeletons pulse→directional brand shimmer (shared primitive) | `components/ui/skeleton.tsx`, `components/loading/page-skeletons.tsx` | A sweep reads materially "faster" than an opacity throb | Quality expectation set before content lands | M |
| 5.4 | Real layout-true Catalyst route skeleton (composer + message bubbles) | `app/(app)/catalyst/loading.tsx` | No blank-box → full-UI pop (CLS) on the flagship | Flagship surface deserves a true skeleton | S |
| 5.5 | Choreograph expand/collapse (tool details, "Used N tools", reasoning) via Radix height anim | `agent-tool-cards.tsx:217,293`, `agent-reasoning-panel.tsx:58` | Smooth disclosure vs instant pop | Hard pops read as buggy; smooth = controlled | M |

### Wave 6 — Cross-surface consistency + visual polish (P1–P3, S–M)
*The "designed by one hand" layer.*

| # | Change | Files | Visual impact | Psychological impact | Effort |
|---|--------|-------|---------------|----------------------|--------|
| 6.1 | Warm `EmptyMedia` icon tile `bg-muted`→`bg-primary/10 text-primary` (shared → all 10+ empty states) | `components/ui/empty.tsx:37` | Every zero-state picks up warm accent at once | First-run cohort meets brand warmth, not a blank admin panel | S |
| 6.2 | Adopt shared `<Empty>` + `PageHeading`/`font-display` on the surfaces that hand-roll them (projects/samples/equipment empties; lab-notes/protocols/papers headers) | per finding | Consistent editorial headers + empty vocabulary | "Coherent authorial product," not MVP scaffold | S–M |
| 6.3 | Card hover lift + accent glow (shared `.n9-card-interactive`) | experiments/projects/samples/equipment lists | Cards feel alive on hover | Confidence these are interactive objects | S |
| 6.4 | Standardize toasts on one system (Sonner) + "New {Entity}" labeling + uniform action tooltips | toast callsites; create buttons; experiments detail actions | Same action confirms the same way everywhere | Predictability lowers cognitive load | M |
| 6.5 | Surface Edit on Protocols (currently Delete-only in detail actions) | `protocols/.../protocol-actions.tsx` | Removes an edit dead-end | "Unfinished part" feeling removed | S |

### Wave 7 — Accessibility (WCAG 2.2 AA) (P1–P2, S each, batchable)
*Mostly mechanical, high cumulative trust/quality signal.*

- **Icon-only buttons need `aria-label`:** protocol-table-row view/delete, lab-notes open arrow, tabs scroll chevrons, attachment remove, editor toolbar buttons (`protocol-table-row.tsx:91`, `lab-notes-list.tsx:230`, `tabs.tsx:138`, `preview-attachment.tsx:73`, `rich-text-editor.tsx:97`).
- **Non-semantic clickables → keyboard-operable:** whiteboard canvas + resize handle, clickable Card/TableRow, upload dropzone divs (`dashboard-whiteboard.tsx:664`, `lab-notes-list.tsx:89`, `upload-literature-pdf-dialog.tsx:455`, `upload-file-dialog.tsx:402`) — add `role`/`tabIndex`/`onKeyDown`.
- **Focus + tooltip-on-focus:** citation tooltip mouse-only (`inline-citation.tsx:41`), clarify-card focus ring (`clarify-card.tsx:41`).
- **Color-only state:** research-map node selection needs a non-color indicator + `aria-pressed` (`research-entity-node.tsx:33`).
- **Disabled "coming soon" controls** need `title`/`aria-label="… (coming soon)"` so the reason reaches AT.
- **`type="button"`** on `upload-literature-pdf-dialog.tsx:468` (avoids accidental submit).
- Add `reduced-motion` coverage for `animate-accordion-up/down` (`globals.css:1203` block).

### Wave 8 — Systemic foundations (P3, M — do alongside the above)
- **Motion tokens:** `--motion-fast/base/slow` + `--ease-out-soft`/`--ease-standard`; reference from utilities (stops per-surface duration drift).
- **New AI tokens/utilities:** `--n9-ai-surface`/`--n9-ai-surface-active`, `.n9-icon-tile`/`.n9-icon-tile--ai`, `.ai-entry-label` ("Ask Catalyst" caption), `.n9-card-interactive` — so the language is centralized, not re-derived.
- **Loader contract (documented):** spinner = inline-button busy · `.ai-shimmer` = running block · skeleton = route/data load · mascot = full-page nav only.
- **Streaming perf:** `React.memo` the message row keyed on id+content hash so only the streaming bubble reconciles (`catalyst-messages.tsx:140`) — smoother long threads.
- **(Optional, enabler) decompose `right-sidebar.tsx` (3,684-line god component)** so every fix above ships safely.

---

## Recommended sequencing & "why this order"
1. **Wave 1 + Wave 2** first — together they're ~1 day of S-changes that flip the *entire* product from "doc app + AI feature" to "AI product." Highest perception-per-hour. Pure presentational, snapshot-testable, revertable.
2. **Wave 4** (agent control + honest failure) — small, removes the two worst trust failures (trapped lit-agent, dead-end errors, silent saves).
3. **Wave 5.1 + 5.4** — nav-speed + flagship skeleton (the most-felt speed wins).
4. **Wave 3** — trust chip (S) now; evidence drawer + scoped-AI (M) as the perceived-intelligence headline features.
5. **Waves 6 / 7 / 8** — consistency, a11y, and foundations, batchable and parallelizable.

## Guardrails (do NOT)
- ❌ Change the rust/cream palette or tri-font system — add depth/motion *within* them.
- ❌ Resurrect the removed stage-stepper / horizontal pipeline.
- ❌ Replace smart pinned auto-scroll with scroll-to-bottom.
- ❌ Delete the orphaned catalyst components (keep-orphans rule).
- ❌ Add prose-parsing heuristics; prefer structured fields.
- ❌ Add new RLS / repeated `getUser` (DB-conservative rule).
- ❌ Touch marketing surfaces.
