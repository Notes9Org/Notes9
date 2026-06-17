# Catalyst Chat — Capability Surfacing & UX Redesign Audit

**Date:** 2026-06-17
**Scope:** `components/catalyst/*`, `hooks/use-agent-stream.ts`, `hooks/use-smooth-text-stream.ts`, `lib/*stream*`, the Catalyst SSE backend (`AI/catalyst/agents/core/sse_schema.py` + tools).
**Goal:** Determine whether the chat UI surfaces everything the Catalyst agent can do, where streaming/UX falls short of industry standards, and propose a redesign that adapts to the Notes9 warm-research theme while reading as a modern AI surface — without regressing what already works.

---

## 0. Current state (important correction before the gap list)

A lot of the obvious "dropped on the floor" capabilities were **already wired in the 2026-06-17 session**. As of now the UI *does* surface:

- ✅ Live citation count ticker ("Gathering sources… N") + **Stop/Cancel** button (HITL).
- ✅ Inline `[N]` citation chips + full **citations panel** with **span-highlight viewer** and **provenance/grounding badges** (native vs heuristic vs source-only).
- ✅ **map_relationships** rendered as an inline SVG relationship graph inside its tool card.
- ✅ Tool-call transcript (Cursor-style cards: args preview → running spinner → result + source names + latency), collapsing to "Used N tools" once settled.
- ✅ Biomni-style **synthesis checklist** (`synthesis_plan`/`synthesis_step`) with live step ticking.
- ✅ **Artifacts** (PDF/DOCX/XLSX/chart) as file cards with download + "Save to Data files".
- ✅ Separate **reasoning panel** for `thinking_token`, kept out of the answer bubble.
- ✅ Smooth token streaming (RAF batching, 8 ms min-delay) + blinking cursor + smart pinned auto-scroll.

So this is **not** a "nothing is shown" situation. The surface is ~85% complete. The remaining work is (a) **a handful of genuinely-invisible capabilities**, (b) **one anti-pattern that makes the tool cards fragile**, and (c) **a polish/visual-language gap** between "tasteful enterprise" and "modern AI product."

**Constraints respected throughout (from prior decisions / memory):**
- The **stage stepper + horizontal pipeline strip were removed per user request** (`agent-stream-reply.tsx:170,243`). This audit does **not** propose resurrecting them. `agent-thinking-bar.tsx`, `agent-flow-pipeline.tsx`, `tool-status-bar.tsx`, `thinking-panel.tsx`, `chat.tsx` stay on disk (keep-orphans rule) but stay unmounted.
- No new hardcoded phrase-lists / per-case string heuristics — prefer structured event fields.
- Smart pinned auto-scroll behavior must not be replaced with unconditional scroll-to-bottom.

---

## 1. The Capability Sheet

Legend — **Surfaced?** ✅ shown · ⚠️ partial/weak · ❌ captured-but-invisible · ➖ not emitted.
**Live** = visible during streaming. **After** = visible in the settled message.

| # | Capability | Backend emits (event / field) | Surfaced? | Live | After | What power the user gets today |
|---|---|---|---|---|---|---|
| 1 | Final answer tokens | `token.delta` | ✅ | ✅ stream + cursor | ✅ | Reads answer as it forms |
| 2 | Agent reasoning | `thinking_token.delta` | ✅ | ✅ reasoning panel | ✅ collapsed | Can watch/read the chain-of-thought |
| 3 | Reasoning **milestones** | `thinking` + `node/stage/detail/intent/decision/rationale/confidence/sql/verdict/issues` | ⚠️ | ⚠️ message only | ⚠️ | Sees a sentence; the structured decision/verdict/confidence fields are dropped |
| 4 | Tool call lifecycle | `tool_start`→`tool_call`→`tool_result` (`label/status/latency_ms/citations_count`) | ✅ | ✅ cards | ✅ collapsed | Sees each tool, timing, result |
| 5 | Tool **source names** | `tool_result.source_names`, `tool_output.document_names` | ⚠️ | ⚠️ | ✅ | Shown — but partly via **regex-parsing prose** (fragile, see I1) |
| 6 | Retrieval **quality** | `find_passages` signals: `max_similarity`, `mean_similarity`, `degraded` | ❌ | ❌ | ❌ | None — user can't tell strong vs weak retrieval |
| 7 | Retrieved **passages** | `rag_chunks` (page_number, chunk_id, content_surface) | ❌ | ❌ | ❌ | Only names extracted; the actual evidence text is invisible |
| 8 | `tool_output.details` | full structured result object | ❌ | ❌ | ❌ | Stored in state, rendered nowhere |
| 9 | Generated SQL | `sql` event / `search_workspace.generated_sql` | ✅ | ✅ | ✅ | Sees exact query run |
| 10 | Synthesis plan | `synthesis_plan`/`synthesis_step` | ✅ | ✅ checklist | ✅ | Watches long design tick off |
| 11 | Artifacts | `artifact` (data_id, file_name, mime, draft, **generator, kind, experiment_id**) | ⚠️ | ✅ cards | ✅ | Download/save works; `generator`/`kind` attribution not shown |
| 12 | Inline citations | `[N]` tokens + `citations_manifest` | ✅ | ⚠️ count only | ✅ chips | Click chip → source |
| 13 | Per-claim **spans** | `cited_text`, `char_start/end`, `support_score`, `support_status`, `grounding` | ✅ | ➖ | ✅ span viewer + badge | Sees exact supporting sentence + native/heuristic badge |
| 14 | Live citation count | `citations_update.count` | ✅ | ✅ ticker | ➖ | Sees sources accumulate |
| 15 | Citation **health** | `done.citations_health` (ok/degraded/floor/failed) + `tokens_unresolved` | ⚠️ | ➖ | ⚠️ amber badge | Degraded/failed flagged, but ok/floor distinction & unresolved count are muted |
| 16 | Memory recall | `recall_memory` signals: `fact_count`, `episode_count`, `procedure_count` | ❌ | ❌ | ❌ | User never sees the agent "remembered" anything |
| 17 | Confidence / tool_used | `done.confidence`, `done.tool_used` | ✅ | ➖ | ✅ badges | Post-hoc badges |
| 18 | Errors | `error.error` | ✅ | ✅ | ✅ | Stream stops with message |
| 19 | Run handle | `run_started.run_id` | ✅ | ✅ enables Stop | ➖ | Can cancel |

**Reading the sheet:** the answer / reasoning / tools / citations / artifacts spine is solid. The **invisible column** clusters around *evidence depth* (6, 7, 8), *reasoning structure* (3), *memory* (16), and *trust signalling* (15) — all data the backend already pays to compute and ships over the wire.

---

## 2. Where we trail industry standards

Benchmarked against Claude.ai, ChatGPT, Perplexity, and Cursor's agent panel:

| Standard pattern | Them | Notes9 today | Gap |
|---|---|---|---|
| Collapsible "thought process" with **flowing** tokens | Claude/ChatGPT show reasoning streaming with a live shimmer/typing feel | Reasoning panel exists but tokens accumulate without a "live" affordance; auto-collapse can hide active thought | Polish |
| **Evidence/sources drawer** with snippets | Perplexity shows the actual retrieved passage, ranked, with the cited sentence | We extract only *names*; passage text (`rag_chunks`) is discarded | **Feature** |
| **Retrieval confidence** surfaced | Perplexity/Glean hint at match strength | `max_similarity`/`degraded` never shown | **Trust** |
| Per-tool **progress for long ops** | Cursor shows running tool with elapsed/progress | Tool cards have a spinner but no elapsed/progress; only synthesis steps do | Polish |
| **Skeleton / intent-first** loading | "Searching your workspace…" intent before tokens | We show a generic loader; first visible signal is often the first tool card | Polish |
| **Memory transparency** | ChatGPT shows "Memory updated" chips | `remember`/`recall_memory` fully silent | **Feature** |
| **Trust envelope** on the answer | Perplexity color-codes citation completeness | Only degraded/failed get an amber badge | **Trust** |
| Visual **AI signature** (depth, gradient accents, motion choreography) | Distinct "this is an AI surface" language | Warm, flat, tasteful — but reads like a doc app, not an AI product | **Theme** |

Net: we're **at standard** on streaming mechanics and citation rigor (the span viewer is actually *ahead* of most), and **behind** on evidence depth, retrieval-trust signalling, memory transparency, and AI visual identity.

---

## 3. Issues — Issue / Why / Solution / Why this solution / Decision / How it helps / How to test

### I1 — Tool source names are scraped from human-readable prose (fragile anti-pattern)
- **Issue:** `use-agent-stream.ts:553-577` derives RAG/SQL source names by string-splitting the *thinking message*: `message.split(' from: ')[1]`, `message.split(': ')`, stripping `" and more"` / `" and N more"`.
- **Why it's wrong:** The same `tool_result`/`tool_output` events already carry **structured** `source_names` / `document_names`. Parsing prose means any backend wording change (localization, "retrieved from" vs "from", punctuation) silently empties the card. It also violates the project's no-hardcoded-heuristics rule.
- **Solution:** Populate `source_names` exclusively from the structured fields on `tool_result.source_names` / `tool_output.document_names` / `rag_chunks[].source_name`. Delete the two regex blocks.
- **Why this solution:** Single source of truth; the data is already there and typed; removes a whole class of "card looks empty" bugs.
- **Architecture decision:** Treat the human-readable `thinking.message` as **display-only**; never parse it for state. Add a tiny normalizer in `lib/agent-stream-types.ts` that maps any source-bearing event to `{id, name, kind}[]`.
- **How it helps:** Cards stay correct regardless of copy changes; reduces 25 lines of brittle code.
- **Test (no regression):** Unit test in `__tests__/agent-stream-contract.test.ts` — feed a `tool_result` with `source_names` and assert the card shows them with the regex removed; feed a `thinking` message with the old "from:" wording and assert it is **not** used for state. Snapshot the rendered card before/after to confirm identical output on the happy path.

### I2 — Reasoning is shown as flat prose; structured `thinking` enrichment is discarded
- **Issue:** `thinking` events can carry `decision`, `rationale`, `confidence`, `sql`, `verdict`, `issues`, `intent`, `conclusion` (`sse_schema.py:24-40`). The UI reads `status` + `message` and drops the rest.
- **Why:** The reasoning panel only renders the token buffer / latest message line.
- **Solution:** Render a compact **reasoning timeline**: each milestone = a row with its intent/decision and, when present, a small `verdict`/`confidence` pill and an expandable `rationale`/`issues`. Keep it inside the existing collapsible panel — *not* a stage stepper.
- **Why this solution:** Reuses already-emitted data, gives the "agent is thinking with structure" feel users expect from Claude/ChatGPT, and stays within the panel the user already accepted (no return of the removed stepper).
- **Decision:** New `ReasoningTimeline` sub-view inside `AgentReasoningPanel`, fed by `thinkingSteps[]` enriched with the extra fields (which the hook already parses into state for steps — extend the step type).
- **How it helps:** Turns a wall of text into a skimmable decision log; surfaces self-verification (`verdict`/`issues`) which is a trust signal.
- **Test:** Contract test that a `thinking` event with `decision`+`confidence` produces a timeline row with the pill; ensure absence of those fields renders the plain row (backward compatible). Visual check via `/browse` on a real query.

### I3 — Long-running tools have no progress or elapsed signal
- **Issue:** Tool cards show a spinner only; a 30 s `search_web` or `fetch_full_records` looks identical at 1 s and 30 s. Only synthesis steps animate progress.
- **Why:** No elapsed/progress wired onto the running card (the hook already tracks `currentStageElapsedS`).
- **Solution:** Add an unobtrusive **elapsed counter** (`0:12`) and an indeterminate shimmer bar on any card in `running` state > ~3 s. Drive elapsed from a client-side timer started at `tool_start` (don't depend on backend progress).
- **Why this solution:** Eliminates "is it stuck?" anxiety, the #1 perceived-slowness driver; client timer avoids new backend contract.
- **Decision:** Card gains `startedAt` at `tool_start`; render layer computes elapsed. Pure presentational — no stream-contract change.
- **How it helps:** Perceived responsiveness without changing real latency.
- **Test:** Mount a card stuck in `running`, advance fake timers, assert counter increments; assert it disappears on `tool_result`. Confirm no extra re-renders of settled cards (memoization preserved).

### I4 — Retrieved evidence (`rag_chunks`, `tool_output.details`) is captured but never shown
- **Issue:** `rag_chunks` (with `content_surface`, `page_number`) and `tool_output.details` are stored in state and rendered nowhere. This is the single biggest *capability* gap vs Perplexity.
- **Why:** No component consumes them; only names are lifted out.
- **Solution:** Add an **Evidence drawer** — expandable under the relevant tool card (and linkable from a citation chip): ranked passages showing the snippet, source name, page, and match kind. Reuse the existing span-viewer styling for consistency.
- **Why this solution:** It's the differentiator ("AI that knows *your* research") made visible — the user can verify *why* the agent said something at the passage level, not just the document level. Data is already on the wire.
- **Decision:** New `EvidenceDrawer` fed by `ragChunks` grouped by source; mounted inside `ToolCardItem` for retrieval tools and cross-linked from `inline-citation` hover.
- **How it helps:** Converts invisible retrieval into a trust/verification feature; strengthens the citation story end-to-end.
- **Test:** Feed `rag_chunks` fixture, assert passages render grouped + ordered by similarity; assert empty `rag_chunks` renders nothing (no empty box). Verify it does not appear for non-retrieval tools.

### I5 — Citation-health envelope is under-communicated
- **Issue:** Backend ships a precise 4-state envelope (`ok/degraded/floor/failed`) + `tokens_unresolved`; UI shows only an amber badge for the bad states.
- **Why:** Single conditional badge, no positive signal.
- **Solution:** A small **trust chip** on every settled answer: green "Grounded · N sources" for `ok`, neutral for `floor` ("answered from N sources, no inline links"), amber for `degraded` ("M links unresolved"), red for `failed`. One component, four states.
- **Why this solution:** Positive grounding is as informative as negative; consistent placement teaches users to trust the chip; uses data already in `done`.
- **Decision:** Extend the existing metadata-badge row in `agent-stream-reply.tsx:316-354` to always render the health chip from the envelope (not just on degraded/failed).
- **How it helps:** Turns citation rigor into a visible, legible trust contract.
- **Test:** Snapshot all four states; assert `tokens_unresolved` count appears only on `degraded`. Confirm no chip when `done` lacks the field (older runs).

### I6 — Streaming transitions are abrupt (polish)
- **Issue:** The "Gathering sources… N" ticker hard-vanishes on `done`; the reasoning panel can auto-collapse mid-thought; first-paint shows a generic loader before any intent.
- **Why:** Hard conditional toggles, fixed 2 s auto-collapse timer.
- **Solution:** (a) Cross-fade ticker → citation chip; (b) keep reasoning panel open while `isStreaming`, only auto-collapse after `done` (the `AgentReasoningPanel` already does this — make sure the 2 s timer in the orphaned `thinking-panel.tsx` is never the mounted one); (c) an **intent-first skeleton** ("Reading your question…") driven by the first `thinking` event instead of a blank spinner.
- **Why this solution:** Choreographed transitions read as "alive"; intent-first reduces perceived latency to first meaningful paint.
- **Decision:** Presentational only; introduce a shared `framer-motion`-free CSS transition utility (respect `prefers-reduced-motion`).
- **How it helps:** Closes the "feels janky" complaint without touching the data layer.
- **Test:** Reduced-motion snapshot; assert panel stays open across multiple `thinking_token` events; assert skeleton replaced by first token.

### I7 — Visual language is tasteful but not "AI-grade" (theme)
- **Issue:** The chat reads like a warm document app: flat fills, uniform card borders, minimal hierarchy or depth. It doesn't signal "intelligent surface."
- **Why:** Single-weight borders (`border-border/60`), few elevation/gradient cues, no accent choreography.
- **Solution (within the existing palette — rust `#965034` / cream `#faf7f2`):**
  - **Assistant turn gets a subtle identity:** a thin gradient left-rail or a soft `bg-primary/[0.02]` wash + a small animated "Catalyst" glyph while streaming.
  - **Elevation tiers:** reasoning/tool/evidence are *secondary* surfaces (muted, recessed); the answer is the *primary* surface (card elevation, crisper border). Establishes hierarchy.
  - **Accent choreography:** running = primary-tinted border + shimmer; done = settle to neutral. One motion vocabulary across tool cards, synthesis steps, evidence.
  - **Citation chips** get a hover lift + grounding-colored ring (already partly there) so grounded text feels tactile.
  - **Dark mode** leans into the apricot `#d4845a` accent for the "AI glow" without going neon.
- **Why this solution:** Keeps the brand's warm research identity (differentiator vs generic blue AI chat) while adding the depth/motion that signals a premium AI product. No palette change → no rebrand risk.
- **Decision:** A small set of `globals.css` utilities (`.surface-primary`, `.surface-recessed`, `.ai-shimmer`, `.assistant-rail`) so the language is centralized and themable, not sprinkled.
- **How it helps:** Same information, but with legible hierarchy (answer > evidence > reasoning) and a distinctive AI feel.
- **Test:** Visual regression via `/browse` light+dark; verify contrast ratios stay WCAG AA on the new washes (a11y-architect pass); confirm `prefers-reduced-motion` disables shimmer.

---

## 4. Redesign — principles + target layout

**Design principles (don't lose the basics):**
1. **Answer is the hero.** Everything else (reasoning, tools, evidence) is recessed and secondary; only the answer gets primary elevation.
2. **Progressive disclosure.** Live = expanded so the user can watch; settled = collapsed to "Used N tools / Reasoning / N sources" so the bubble stays tight. (Already the pattern — extend it to evidence.)
3. **One motion vocabulary.** running→shimmer, done→settle, everywhere. No bespoke animations per component.
4. **Every claim is verifiable.** Chip → span → passage is a continuous path (I4 closes the last hop).
5. **Trust is always visible.** A health chip on every answer; retrieval confidence where it exists.
6. **Respect prior removals.** No stage stepper, no horizontal pipeline.

**Target anatomy of one assistant turn (top → bottom):**
```
┌ assistant rail (subtle gradient, animated glyph while live) ───────────┐
│ [Reasoning ▸]      ← collapsible timeline (I2), open while streaming    │
│ [Tool cards]       ← running: elapsed + shimmer (I3); settled: collapse │
│    └ [Evidence ▾]  ← ranked passages (I4), per retrieval tool          │
│ [SQL block]        ← unchanged                                          │
│ [Synthesis ✓]      ← unchanged                                          │
│ ─ ANSWER (primary surface) ─ tokens stream, cursor, inline [N] chips ─  │
│ [Grounded · N sources]  [confidence]  [artifacts]   ← trust row (I5)    │
│ [All citations ▸]  ← panel with span viewer (unchanged)                │
└────────────────────────────────────────────────────────────────────────┘
```
**Live vs after, by design:** while streaming the user can watch reasoning, each tool with elapsed, the source counter, and evidence as it lands; after `done` everything recesses into labeled toggles and the trust row appears — maximal information during, minimal clutter after.

---

## 5. Architecture decisions

- **AD1 — Structured-fields-only state.** UI state is derived only from typed SSE fields, never from parsing display prose. A single normalizer (`lib/agent-stream-types.ts`) is the one place events become view models. (Fixes I1; prevents recurrence.)
- **AD2 — Presentational/temporal concerns stay client-side.** Elapsed timers, transitions, skeletons need no new backend contract. (I3, I6.)
- **AD3 — Centralized visual language.** Surface tiers + motion live as `globals.css` utilities, not per-component Tailwind soup. (I7; keeps it themable.)
- **AD4 — Additive rendering of already-emitted data.** Evidence drawer, reasoning timeline, memory chip, health chip all consume existing events — zero stream-schema changes, so backend and frontend can ship independently.
- **AD5 — `synthesis_plan`/`synthesis_step` get added to the formal `sse_schema.py` registry.** They currently pass through unvalidated (forward-compat path). Registering them makes the contract complete and testable. (Low-risk backend tidy.)

---

## 6. Phased rollout + test strategy (do not corrupt the existing surface)

All phases are **additive and independently revertable**. Order is by risk-adjusted value.

| Phase | Change | Risk | Guard |
|---|---|---|---|
| **P0** | I1 — kill regex, use structured `source_names` | Low | Contract tests in `agent-stream-contract.test.ts`; happy-path card snapshot identical |
| **P1** | I5 health chip + I3 tool elapsed/shimmer | Low | Pure presentational; four-state snapshots; fake-timer test |
| **P2** | I2 reasoning timeline (inside existing panel) | Med | Backward-compat test (no enrichment → plain row); `/browse` on live query |
| **P3** | I4 evidence drawer (`rag_chunks`) | Med | Fixture-driven; empty-state renders nothing; only on retrieval tools |
| **P4** | I6 transition polish + intent skeleton | Low | reduced-motion snapshots; panel-stays-open test |
| **P5** | I7 visual language utilities (surfaces, rail, shimmer) | Med | Light+dark visual regression; a11y-architect contrast pass |
| **P6** | I16 memory chip + AD5 schema registration | Low | Chip appears only when `recall_memory` ran; schema validation test |

**Cross-cutting test rules:**
1. **Golden-path snapshot first.** Capture the current rendered turn (a known query) before any change; every phase must keep that snapshot byte-identical *except* the intended addition.
2. **Contract tests over runtime claims.** Per the "verify UI before claiming fixed" rule, each phase ships with a stream-fixture test AND a `/browse` walkthrough on a real Catalyst response — tsc/green ≠ works.
3. **Feature-flag the visual language (P5).** Ship behind a `CHAT_UX_V2` flag so it can be toggled off in one line if it regresses.
4. **No data-layer edits in presentational phases.** P1/P3/P4/P5 must not touch `use-agent-stream.ts` parsing except P0's deletion.
5. **Preserve smart auto-scroll + collapse-on-settle** behaviors verbatim.

---

## 7. What NOT to do
- ❌ Do **not** re-mount the stage stepper or horizontal pipeline (removed per user request).
- ❌ Do **not** delete the orphaned components (`agent-thinking-bar`, `agent-flow-pipeline`, `tool-status-bar`, `thinking-panel`, `chat.tsx`) — keep-orphans rule.
- ❌ Do **not** add new prose-parsing heuristics (the thing we're removing in P0).
- ❌ Do **not** change the warm rust/cream palette — add depth/motion *within* it.
- ❌ Do **not** replace pinned auto-scroll with scroll-to-bottom.

---

### One-line summary
The chat already surfaces ~85% of Catalyst and its streaming mechanics are at industry standard; the real wins are **(P0)** removing the fragile prose-parsing of sources, **(P3/I4)** showing the retrieved *evidence* the backend already streams, **(I2/I5/I16)** making reasoning, trust, and memory legible, and **(I7)** adding an AI-grade visual hierarchy inside the existing warm theme — all additive, flag-guarded, and snapshot-tested so nothing currently working breaks.
