
# Notes9 "Sandglass" Revamp — Systematic Plan

_Status: approved direction, 2026-07-12. Builds on `docs/UI_ARCHITECTURE.md` (the single-edit-point
layer model) and `docs/UI_UX_SPEC.md` (component inventory). This plan covers the three asks:
(1) a platform-wide glass language with a coarse, sand-like frosted texture and guaranteed text
readability; (2) a pass over every interactive element; (3) fixing the page-load choreography —
the skeleton "hollow effect" that currently mismatches actual load time and feels glitchy._

---

## 1. The Sandglass recipe (what "glassy but coarse like sand" means technically)

Every glass surface is built from six stacked layers, all token-driven (single edit point:
`app/globals.css`):

| Layer | Implementation | Token |
|---|---|---|
| 1. Fill | translucent warm tint | `--glass-bg` (72% light / 66% dark) |
| 2. Blur | `backdrop-filter: blur() saturate()` | `--glass-blur` 14px · `--glass-blur-strong` 22px (hero surfaces) |
| 3. Sheen | top-down light wash gradient | `--glass-sheen` |
| 4. Edge highlight | `inset 0 1px 0` polished-glass rim | `--glass-highlight` |
| 5. **Grain (the "sand")** | static SVG `feTurbulence` fractal noise, `mix-blend-mode: overlay` | `--glass-grain-opacity` (5% light / 8% dark) |
| 6. Shadow | warm ambient elevation | `--n9-elev-1/2/3` |

**Already shipped:** the tokens, the `.n9-grain` opt-in utility, and the full recipe on
`.n9-composer` / `.n9-composer-ai` (every chat input: dashboard hero, list-page heroes, Catalyst
drawer, popup chat, paper AI, Biomni). The composer is the reference implementation — every other
surface migrates to match it.

### The readability contract (non-negotiable, checked at review)

Glass must never cost legibility. Four rules:

1. **Body text never sits on moving/blurry context.** Long-form reading surfaces (Tiptap editors,
   PDF reader, report content, tables) stay **opaque** (`bg-card`). Glass is for *chrome* — rails,
   headers, composers, menus, overlays — where text is short, large, or user-authored-in-progress.
2. **Inputs solidify on focus.** Any glass surface that accepts typing animates to ≥90% card
   opacity on `:focus-within` (already in `.n9-composer`). Glass at rest, paper while writing.
3. **Grain stays under 10%** opacity and is `pointer-events: none`; it must read as paper tooth,
   never as noise over glyphs. Grain opacity is a token so one edit tunes the whole app.
4. **Fallbacks:** `@supports not (backdrop-filter)` → opaque card (exists);
   `prefers-reduced-transparency: reduce` → all `--glass-bg` tokens swap to ≥95% opaque (add one
   media block in globals.css); `prefers-contrast: more` → same swap + full-opacity borders.

---

## 2. Surface taxonomy — what gets which glass tier

| Tier | Surfaces | Treatment |
|---|---|---|
| **G0 — Paper (opaque)** | editors, PDF pages, tables, report/protocol content, form dialogs' bodies | No glass ever. `bg-card`. |
| **G1 — Panel glass** | side rails (done — `SideRail`), annotation sidebar (done), popovers, dropdown/context menus, tooltips? (keep inverted), toasts, command palette | `--glass-blur` + grain + highlight; solid enough to read lists on |
| **G2 — Hero glass** | composers (done), section heroes, dashboard greeting card, empty-state cards | `--glass-blur-strong` + sheen + grain + AI ring where applicable |
| **G3 — Overlay glass** | dialog/alert scrims (`bg-black/50` today — frost them), sheet scrims, fullscreen chat overlay | scrim = `backdrop-blur-md bg-background/60` + the panel itself G1 |
| **Shell** | app header (already frosted), left sidebar (keep its own token set), rail panels | align blur/saturation values with tokens; add grain to header |

Rollout order inside each phase: **globals.css utility → primitive in `components/ui` →
verify in `/ui-gallery` (light + dark) → ship**. Never restyle at call sites.

---

## 3. Primitives migration list (Phase 2, one PR per row group)

- **dropdown-menu / context-menu / select content / popover / command**: `bg-popover` →
  `glass-panel` recipe + grain; keep `shadow-md`→`--n9-elev-2`. High blast radius, do together.
- **dialog / alert-dialog**: frost the overlay (G3), panel gets G1 + grain; keep body G0 if it
  contains forms/long text (panel chrome glassy, content region `bg-card` inset).
- **sheet**: scrim frost + panel G1.
- **card**: add a `variant="glass"` (G1) used by dashboard widgets and empty states — default
  card stays opaque (G0 rule).
- **tabs / view-mode-toggle**: container `bg-muted` → thin glass strip; active pill stays solid
  (readability).
- **tooltip**: keep inverted solid (tiny text over arbitrary context — glass would hurt).
- **sonner toasts**: G1 glass + grain.
- **skeleton**: already shimmer; ensure shimmer runs on glass surfaces without banding.

## 4. Interactive-element pass (Phase 3)

The interaction grammar is already defined (hover icon-scale, `.n9-press`, focus rings, active
pills). The revamp adds three moves, implemented once each in `globals.css` / the primitive:

1. **Sheen sweep on hover** for primary buttons and interactive cards: a 600ms one-shot gradient
   sweep (`::after` translating diagonal highlight), token curve, `@media (hover:hover)` only,
   disabled under reduced motion.
2. **Press depth**: unify all press states on `.n9-press` (scale .96) — audit stragglers
   (`active:scale-[0.985]` variants in rails/nav are fine; buttons missing any press get it).
3. **Focus**: keep the 3px `ring-ring/50` everywhere; glass surfaces get the accent-mix border
   change (already in composer) so focus is visible against blur.

Checklist per Tier-S/A primitive (button, input, select, badge, dialog, table-row, tabs,
dropdown items, checkbox, switch): hover / press / focus / disabled / invalid each observable in
`/ui-gallery`, in both themes, with reduced-motion fallback.

## 5. Page-load choreography — fixing the "hollow effect" glitch

**Diagnosis (why it feels wrong today):**
- Three uncoordinated systems fire on navigation: the 360ms `PageTransition` fade/lift (keyed on
  pathname), route-level `loading.tsx` skeletons (App Router Suspense), and per-component client
  fetch spinners/skeletons. They overlap → content fades in, then goes hollow, then pops.
- Skeletons appear instantly even for <100ms loads (flash) and disappear the exact frame data
  lands (snap) — the "time doesn't match" feeling.
- Two skeleton systems still exist in places (`animate-pulse` vs `.n9-skeleton-shimmer`).

**Design (the choreography contract):**
1. **One gate.** `hooks/use-skeleton-gate.ts` (shipped): skeletons wait 150ms before appearing
   (fast loads show nothing) and once visible stay ≥350ms (no snap). Every client-side
   loading state migrates to it — rails (`SideRailSkeleton` call sites), list pages, dashboard
   widgets, chat history.
2. **One entrance.** Content reveals through `MotionReveal`/`MotionList` exactly once — the
   component that owned the skeleton owns the reveal. `PageTransition` remains the *only*
   route-level animation; remove per-page mount fades that double it.
3. **Skeletons mirror real layout.** Each route's `loading.tsx` uses the shared
   `components/loading/page-skeletons.tsx` shapes (same grid, same card sizes, shimmer). A
   skeleton that matches the destination layout makes the swap invisible; that mismatch is most
   of the "glitchy" feel.
4. **Prefetch the heavy routes.** Rails and nav links use Next `prefetch`; detail pages fetch
   their sibling-list data in parallel with content (already the pattern in detail clients).
5. **Streaming order.** Server components stream chrome first (heading, toolbar), Suspense
   boundaries around data islands — never a whole-page skeleton when only a widget is pending.

**Verification:** throttle to Fast 3G and to localhost-fast; in both cases navigation should show
either (a) instant content, or (b) one skeleton beat ≥350ms → settled swap. No flash, no double
fade, no hollow-after-content.

## 6. Performance budget (glass is GPU work)

- Max **2 stacked backdrop-filter regions** in any viewport area (e.g. header over rail is fine;
  never blur-inside-blur-inside-blur). Composer inside a glass rail: rail keeps blur, composer
  inside drops to fill+grain only (`backdrop-filter` omitted when ancestor already blurs —
  add `.n9-composer--nested` for this).
- Blur radius caps at `--glass-blur-strong` (22px). No arbitrary larger values.
- Grain is one shared 140px SVG tile (data-URI, cached, zero requests) — never per-component
  noise images.
- Animate only `transform`/`opacity`/`box-shadow`; never animate `backdrop-filter`.
- Audit with Chrome tracing on the dashboard (most widgets) after Phase 2.

## 7. Phases & sequencing

| Phase | Scope | Risk | Gate |
|---|---|---|---|
| **0 (done)** | tokens, `.n9-grain`, composer prominence, `useSkeletonGate`, ghost scrollbars, `SideRail` | — | typecheck ✅ |
| **1** | `prefers-reduced-transparency`/`prefers-contrast` fallbacks; grain+highlight onto `.glass-panel`, `.n9-glass`, header; gallery "Sandglass" section | low | /ui-gallery both themes |
| **2** | primitives (§3): menus/popovers → dialogs/sheets → card glass variant → tabs/toasts | medium | gallery + spot pages |
| **3** | interactive pass (§4): sheen sweep, press audit | low | gallery |
| **4** | load choreography (§5): migrate skeleton call sites to the gate, loading.tsx parity audit, kill double fades | medium | throttled nav test |
| **5** | page polish: dashboard widgets, literature panels, settings — apply taxonomy §2 | low | per-page |

Each phase is one reviewable PR; nothing in a later phase blocks an earlier one from shipping.
