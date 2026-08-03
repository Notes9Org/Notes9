# AI seam — implementation plan

Status: ready to dispatch. Written 2026-08-03.

Goal: attach a data file, describe what you need in plain language, get a **validated JSON
patch** against the `AnalysisSpec`. The model authors the *input* to the analysis. It never
computes a number and never draws a plot.

---

## The finding that shapes this plan

**No workspace promotion is needed.** An earlier draft called for making the orphaned
spec-driven workspace live first. Tracing the live component shows that is unnecessary:
`components/data-analysis/data-analysis-workspace.tsx` (2,541 lines, the component actually
serving `/data-analysis`) already has both halves of the round trip.

| Direction | Exists today | Where |
|---|---|---|
| chart state → `AnalysisSpec` | ✅ `specFromChartState()` → `derivedSpec` | `lib/data-analysis/workspace/chart-state-spec.ts:138`, used at `data-analysis-workspace.tsx:698` |
| flat config → chart state | ✅ `applyConfig(c)`, already used for template restore | `data-analysis-workspace.tsx:~1428` |
| `AnalysisSpec` → chart state | ❌ **missing — the only gap** | — |

`FIGURE_KIND_TO_CHART_TYPE` already exists in `chart-state-spec.ts:51` with the comment
*"the reverse direction, for when a spec drives the rail"*. The inverse function was
anticipated and never written.

So the seam is:

```
prompt + resolved Table
  → route: gate → screenRequest → buildContextBundle → proxy
  → Catalyst POST /analysis/spec-author  (run_text via llm/gateway)
  → validateProposal + sanitiseRationale + containsFabricatedStatistic
  → SpecMutation[]
  → applyAiPatch(derivedSpec, mutations)      [exists: spec/mutations.ts]
  → chartStateFromSpec(nextSpec, table)       [NEW — the one missing piece]
  → applyConfig(...)                          [exists]
```

Everything except `chartStateFromSpec` is already built. The orphaned
`components/data-analysis/workspace/*` shell and `hooks/use-analysis-spec.ts` stay parked and
are **out of scope** — do not import them, do not delete them.

---

## Wire contract — freeze this first

Every parallel agent codes against this. Do not change it without updating all three sides.

**`POST /api/data-analysis/spec-author`** (Notes9) and **`POST /analysis/spec-author`** (Catalyst)
share one body shape.

```jsonc
// Request — Notes9 route accepts this from the client
{
  "prompt": "compare treated vs control",
  "spec":   { /* current AnalysisSpec */ },
  "table":  { "columns": ["..."], "rows": [{ "rowId": "row-2", "values": {} }] }
}

// Request — what the route forwards to Catalyst (NO raw rows)
{
  "bundle": { /* output of buildContextBundle() */ },
  "prompt": "compare treated vs control"
}

// Response — both hops, same shape
{
  "rationale": "…prose, no numbers…",
  "mutations": [ { "kind": "analysis.setTest", "value": "t-unpaired" } ],
  "clarificationNeeded": null       // or a question string
}

// Refusals — HTTP 200 with an outcome, never a 500
{ "outcome": "refused",   "reason": "…", "alternative": "…" }   // screenRequest
{ "outcome": "no-table",  "reason": "…" }                        // HTTP 400
```

Hard rules, enforced in code and asserted in tests:

1. **No table → HTTP 400.** At the route, not only in the UI.
2. **Raw rows never leave Notes9.** Only `buildContextBundle()` output is forwarded.
3. **Validation runs server-side.** Anything failing `validateProposal` is dropped before the
   response is written, so no client code path can render a model-authored number.
4. **`max 40` mutations**, per the existing schema in `ai/spec-author.ts`.
5. Catalyst imports **no provider SDK** — only `llm.gateway.run_text`. A layering test enforces it.

---

## Phase 0 — setup (sequential, blocking)

One agent. Nothing else starts until this is green.

- Notes9 is on `data-analysis-ai`. ✅ already done.
- **AI repo is on `context_management`.** Create and switch to a working branch off it for this
  work. Confirm `catalyst/core/tools/_sandbox.py` is present and `pytest` is green before any
  change, so a later failure is attributable.
- Confirm `AI_SERVICE_BEARER_TOKEN` and the Catalyst base URL resolve via `lib/catalyst-client.ts`.

---

## Phase 1 — three agents IN PARALLEL

File ownership is disjoint. No two agents touch the same file.

### Agent A1 · `chartStateFromSpec` (Notes9)

**Owns:** `lib/data-analysis/workspace/chart-state-spec.ts`, `…/chart-state-spec.test.ts`

Write the inverse of `specFromChartState`. Signature:

```ts
export function chartStateFromSpec(spec: AnalysisSpec, table: Table): Partial<ChartState>
```

- Map `spec.figure.kind` → chart type through the existing `FIGURE_KIND_TO_CHART_TYPE`.
- Carry across: title, subtitle, axis labels and units, log flags, min/max, error bars, palette,
  legend, gridlines, series styles, font sizes, dimensions.
- Carry the analysis side that the rail exposes: test, post-hoc, alpha, tails, group column,
  response columns, reference level.
- Return `Partial<ChartState>` — only what the spec actually determines. The caller merges.
- Pure. No React, no I/O.

**Test:** round-trip property — for a representative spread of chart kinds,
`specFromChartState(chartStateFromSpec(spec, table), table)` reproduces the figure and analysis
slices of `spec`. Include at least: bar-scatter-error, box, xy-scatter-fit, dose-response,
kaplan-meier, heatmap. Assert the chart-type map is total in both directions.

### Agent A2 · Catalyst endpoint (AI repo)

**Owns:** `catalyst/api/analysis_spec.py`, `catalyst/tests/test_analysis_spec_router.py`;
edits `catalyst/api/__init__.py` and `catalyst/main.py` (registration lines only)

- One route: `POST /analysis/spec-author`.
- Call the model with `llm.gateway.run_text`. Follow the pattern in `catalyst/core/verification.py:160`:

  ```python
  from llm.gateway import run_text
  run_text("simple", "spec_author",
           system=SPEC_AUTHOR_SYSTEM_PROMPT, prompt=prompt,
           temperature=0.0, max_tokens=2048, call_site="analysis_spec_author")
  ```

  **`temperature=0.0`** — a spec that changes between identical requests is not reproducible.
- Choose the tier deliberately and say why in a comment; `simple` is the starting assumption.
- Parse the model's JSON defensively — reuse the repo's existing `parse_llm_json` helper rather
  than a bare `json.loads`.
- **No statistics.** No numeric computation of any kind in this file.
- Registration mirrors the other routers in `main.py`.

**Test:** the router returns the contract shape; a malformed model reply yields a structured
error rather than a 500; the existing **layering guardrail test passes** (no provider SDK import,
no layer crossed).

### Agent A3 · Notes9 seam route

**Owns:** `app/api/data-analysis/spec-author/route.ts`, `…/route.test.ts`

Mirror `app/api/ai/paper-chat/route.ts` for auth and proxying. In order:

1. `getCurrentUser` — 401 if absent.
2. **400 if no resolved `Table`** in the body.
3. `screenRequest(prompt)` — return the refusal + alternative *before* spending a model call.
4. `buildContextBundle()` → forward via `aiServiceBaseUrl()` + `AI_SERVICE_BEARER_TOKEN` from
   `lib/catalyst-client.ts`. **Never forward raw rows.**
5. On the reply: `validateProposal()`, then `sanitiseRationale()`, then drop anything
   `containsFabricatedStatistic()` flags. Return survivors plus a `rejected[]` list.
6. Fail closed and legibly when Catalyst env is unset — deterministic analysis must keep working
   with the seam unavailable.

All helpers are already exported from `lib/data-analysis/ai/spec-author.ts`. **Do not modify that
file** — it is the thing being wired up.

**Test (the three that must fail loudly):**
1. a proposal whose rationale contains a statistic is rejected;
2. a request with no table is refused at the route with 400;
3. a proposed test absent from `offerableTests` is rejected, not returned.

---

## Phase 2 — sequential, after Phase 1

### Agent B1 · client shim
**Owns:** `lib/data-analysis/ai/spec-author-client.ts` (+ test). **Needs A3.**

Posts to the route; returns `{ mutations, rationale, rejected, clarificationNeeded }`. No React.
Surfaces transport failure as a typed result, never a thrown string.

### Agent B2 · UI wiring
**Owns:** `components/data-analysis/data-analysis-workspace.tsx`. **Needs A1 + B1.**

- Prompt input, **disabled until a `Table` resolves** — the hard constraint in the UI.
- On submit: call B1 → `applyAiPatch(derivedSpec, mutations)` → `chartStateFromSpec(next, table)`
  → `applyConfig(...)`.
- Render `rationale`, `clarificationNeeded`, and any `rejected[]` reasons. A rejection is
  information, not an error toast.
- Keep it small. This is a 2,541-line file — add a section, do not restructure it.

---

## Phase 3 — verification (parallel)

| Agent | Command / action |
|---|---|
| V1 | `pnpm test lib/data-analysis` and `pnpm tsc --noEmit` |
| V2 | `cd AI/catalyst && .venv/bin/pytest` — includes the layering guardrail |
| V3 | Manual: attach a CSV, type *"compare treated vs control"*, confirm a spec comes back, the engine computes it, the figure redraws, and the rationale carries no invented numbers |

`tsc` and passing tests are **not** sufficient evidence the UI works — V3 is required before this
is called done.

---

## Out of scope

Plotly/Kaleido migration of `create_figure_from_code.py`; dropping `matplotlib>=3.8`;
self-hosting Pyodide; the `runtime` field on `AnalysisSpec`; promoting or deleting the orphaned
`components/data-analysis/workspace/*` shell; `pivotLonger` and control-relative `normalise`.

All remain tracked in the design artifact.
