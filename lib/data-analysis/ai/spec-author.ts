import { z } from "zod"
import type { AnalysisSpec, TestKind } from "@/lib/data-analysis/spec/analysis-spec"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import { MUTATION_CONTRACT, parseMutation } from "@/lib/data-analysis/spec/mutation-schema"

/**
 * L7, AI orchestration.
 *
 * The model authors and revises the ANALYSIS SPEC. It never computes, and it
 * never sees a number it could be tempted to repeat as fact. Concretely (§6.6):
 *
 *   - it receives the project record, a DATA PROFILE (schema + summary
 *     statistics, not raw rows where avoidable), the current spec, and the edit
 *     history;
 *   - it returns a spec patch plus a plain-language rationale;
 *   - invalid patches are rejected and repaired, never rendered;
 *   - no statistic may originate from the model. This is enforced below by
 *     construction: the tool schema has no field capable of carrying one.
 *
 * The guardrails in `screenRequest` are the §8.1 half of the job. The document
 * is explicit that the assistant "will not action 'remove points until
 * significant' and will instead offer a documented sensitivity analysis", so
 * that refusal lives in code, not in a system prompt that a determined user can
 * talk their way around.
 */

/* ── Wire bounds, mirrored from Catalyst ───────────────────────────────────*/

/**
 * Hard bounds mirrored from Catalyst's own pydantic model, `SpecAuthorRequest`
 * in the AI repo at catalyst/api/analysis_spec.py:70-84. A violation over
 * there is a 422 raised by pydantic before any handler code runs, and until
 * now Notes9 did not know these numbers existed: an over-long prompt made the
 * round trip anyway and came back reported as a generic outage, not as the
 * malformed request it was (ADR-004). Checking here, before the request
 * leaves this process, turns that into a message the researcher can act on.
 *
 * Exported by name and re-exported nowhere else: this is the one place either
 * number is allowed to live, so a sibling that needs one (the spec-prompt
 * textarea's character cap, for instance) imports it rather than repeating it.
 */
/** Mirrors `prompt: str = Field(min_length=1, max_length=4000)`. */
export const SPEC_AUTHOR_PROMPT_MAX_CHARS = 4000
/** Mirrors `system: str = Field(max_length=8000)`. */
export const SPEC_AUTHOR_SYSTEM_MAX_CHARS = 8000

/* ── The tool schema the model emits ───────────────────────────────────────*/

/**
 * A patch is a list of typed mutations plus a rationale. Deliberately NOT a
 * whole spec: asking a model to re-emit the entire object invites it to quietly
 * drop the user's hand edits, whereas a patch collides visibly and is caught by
 * the sticky rule.
 */
export const SpecPatchProposal = z.object({
  /** Plain-language explanation, shown to the user with the change (§6.6). */
  rationale: z.string().min(1).max(2000),
  mutations: z.array(z.record(z.string(), z.unknown())).max(40),
  /**
   * Set when the request cannot be actioned as asked. The UI shows this instead
   * of applying anything.
   */
  clarificationNeeded: z.string().max(1000).nullable().default(null),
})
export type SpecPatchProposal = z.infer<typeof SpecPatchProposal>

/** Mutation kinds the assistant is allowed to author. */
export const ALLOWED_MUTATION_KINDS = new Set<SpecMutation["kind"]>([
  "figure.setKind",
  "figure.setTitle",
  "figure.setSubtitle",
  "figure.setPalette",
  "figure.setLegend",
  "figure.setGridlines",
  "figure.setDimensions",
  "figure.setFont",
  "figure.setSeriesStyle",
  "figure.addAnnotation",
  "figure.updateAnnotation",
  "figure.removeAnnotation",
  "figure.setShowExcluded",
  "axis.set",
  "figure.setErrorBars",
  "analysis.setTest",
  "analysis.setPostHoc",
  "analysis.setTails",
  "analysis.setAlpha",
  "analysis.setColumns",
  "analysis.setReferenceLevel",
  "analysis.setMissingValues",
  "analysis.setNonlinear",
  "data.addTransform",
  "data.removeTransform",
  "data.setFilters",
  "design.set",
  "roles.set",
])

/**
 * Mutations the assistant may NEVER author, whatever it is asked.
 *
 * Excluding a data point requires a reason, an author and a timestamp (§8.1),
 * and the author must be a person. An assistant that can exclude rows is an
 * assistant that can be talked into excluding the inconvenient ones, so the
 * capability simply does not exist on this path, the user excludes points
 * through the figure, and the record says they did.
 */
export const FORBIDDEN_MUTATION_KINDS = new Set<string>([
  "data.excludeRow",
  "data.restoreRow",
  "figure.moveBracket",
  // The caption doc comment on `FigureSpec` (analysis-spec.ts) is explicit:
  // once a researcher has worded it, it is "never regenerated over." That is
  // the same sticky, human-owned status as the fields above, so the assistant
  // does not get a mutation for it either.
  "figure.setCaption",
])

/* ── Guardrails (§7 adversarial set, §8.1) ─────────────────────────────────*/

export interface RequestScreen {
  allowed: boolean
  /** Shown to the user instead of a patch when `allowed` is false. */
  response: string
  /** What the assistant offers instead. */
  alternative?: string
  reason:
    | "p-hacking"
    | "exclusion-by-assistant"
    | "significance-shopping"
    | "ok"
}

const P_HACKING_PATTERNS: { re: RegExp; reason: RequestScreen["reason"] }[] = [
  // "remove the outlier so it's significant", "drop points until p < 0.05".
  // `signific\w*` rather than `\bsignific\b`: the latter demands a word boundary
  // in the middle of "significant" and so never fires.
  {
    re: /\b(remove|drop|exclude|delete|get rid of)\b[^.?!]{0,80}\b(until|so|to make|to get|so that)\b[^.?!]{0,60}(signific\w*|p\s*[<=]|p-?value)/i,
    reason: "p-hacking",
  },
  // "make it significant", "get p below 0.05"
  {
    re: /\b(make|get|force|push|nudge)\b[^.?!]{0,50}\b(it|this|the (result|p-?value|data))\b[^.?!]{0,30}\bsignificant\b/i,
    reason: "significance-shopping",
  },
  { re: /\bget\b[^.?!]{0,40}\bp\s*(<|below|under)\s*0?\.0\d/i, reason: "significance-shopping" },
  // "try every test until one works"
  {
    re: /\b(try|run)\b[^.?!]{0,40}\b(every|all|different|other)\b[^.?!]{0,30}\btests?\b[^.?!]{0,40}\b(until|till)\b/i,
    reason: "significance-shopping",
  },
  // Asking the assistant itself to exclude points.
  {
    re: /\b(remove|exclude|drop|delete)\b[^.?!]{0,40}\b(outlier|point|well|replicate|row)s?\b/i,
    reason: "exclusion-by-assistant",
  },
]

/**
 * Screen a request before it reaches the model.
 *
 * Doing this in code rather than in the prompt matters: a system-prompt rule is
 * a request, and this is a refusal. The alternative offered is always a real,
 * documented one, the point is not to obstruct the researcher but to route the
 * legitimate version of what they want through the governed path.
 */
export function screenRequest(prompt: string): RequestScreen {
  for (const { re, reason } of P_HACKING_PATTERNS) {
    if (!re.test(prompt)) continue

    if (reason === "exclusion-by-assistant") {
      return {
        allowed: false,
        reason,
        response:
          "I can't exclude data points for you. An exclusion has to carry a reason and the name of the person who made it, so it stays part of the record.",
        alternative:
          "Click the point on the figure to exclude it yourself and choose a reason, or ask me to run a sensitivity analysis that reports the result with and without it.",
      }
    }
    return {
      allowed: false,
      reason,
      response:
        "I can't change the analysis in order to reach a particular p-value. Choosing a test after seeing which one gives the answer you want makes the p-value uninterpretable.",
      alternative:
        "I can run a documented sensitivity analysis instead, showing the result with and without the points in question, so the effect of that choice is visible rather than hidden.",
    }
  }

  return { allowed: true, reason: "ok", response: "" }
}

/* ── Context bundle (§6.6) ─────────────────────────────────────────────────*/

export interface ColumnProfile {
  name: string
  kind: "numeric" | "categorical" | "datetime" | "text"
  /** Distinct level names for categoricals, capped, they drive test choice. */
  levels?: string[]
  missing: number
  /** Summary statistics only. Never raw values. */
  summary?: { n: number; min: number; max: number; mean: number; sd: number }
}

export interface DataProfile {
  fileName: string
  rowCount: number
  columns: ColumnProfile[]
}

export interface ProjectContext {
  projectName?: string
  experimentName?: string
  /** Design as recorded in notes9, which outranks inference from the numbers. */
  recordedDesign?: {
    paired?: boolean
    repeatedMeasures?: boolean
    subjectColumn?: string | null
    replicateType?: string
  }
  protocolNames?: string[]
}

export interface SpecAuthorContext {
  prompt: string
  spec: AnalysisSpec
  profile: DataProfile
  project?: ProjectContext
  /** Recent edits, so the assistant knows what the user changed by hand. */
  recentEdits?: { description: string; origin: "user" | "ai" }[]
  /**
   * The current result is passed for CONTEXT ONLY, so the assistant can say
   * "the variance check failed, consider Welch". It must never quote a value
   * from here as its own; the report sentence the engine produced is the only
   * sanctioned wording.
   */
  result?: EngineResult | null
  /**
   * The legal test set for this data shape (lib/data-analysis/semantic/infer.ts),
   * computed server-side from assumption checks the model cannot run itself.
   * Without this the model can only guess at `analysis.setTest`'s domain from
   * the contract's bare enum; with it, it knows which tests are actually valid
   * for what's loaded and why the rest are not.
   */
  offerableTests?: { test: TestKind; legal: boolean; reason?: string; recommended: boolean }[]
}

/**
 * Build the model's context. Note what is absent: raw rows. §11 decision 10
 * ("scope of what the model sees") directly affects the privacy claim we can
 * make, and profile-only is the strongest defensible position, we can say the
 * model never sees the data.
 */
export function buildContextBundle(ctx: SpecAuthorContext): Record<string, unknown> {
  return {
    request: ctx.prompt,
    project: ctx.project ?? null,
    data: {
      fileName: ctx.profile.fileName,
      rowCount: ctx.profile.rowCount,
      columns: ctx.profile.columns.map((c) => ({
        name: c.name,
        kind: c.kind,
        levels: c.levels?.slice(0, 20),
        missing: c.missing,
        summary: c.summary,
      })),
    },
    currentSpec: {
      figure: ctx.spec.figure.kind,
      test: ctx.spec.analysis.test,
      postHoc: ctx.spec.analysis.postHoc,
      groupColumn: ctx.spec.analysis.groupColumn,
      responseColumns: ctx.spec.analysis.responseColumns,
      design: ctx.spec.design,
      transforms: ctx.spec.transforms.map((t) => t.kind),
      exclusionCount: ctx.spec.exclusions.length,
    },
    // Whole filter objects, not a count: `data.setFilters` replaces the array
    // wholesale, so a filter the model wants to keep has to be re-emitted, it
    // can only do that if it was told the full, exact objects to begin with.
    filters: ctx.spec.filters,
    // The legal kinds and their exact payload shapes, walked from
    // `SpecMutationSchema` (mutation-schema.ts), see that file for why this is
    // generated rather than prose.
    contract: MUTATION_CONTRACT,
    // Which tests this data shape can actually support, and why the rest can't
    // (lib/data-analysis/semantic/infer.ts). Withholding this used to leave the
    // model guessing at `analysis.setTest`'s domain from the bare enum alone.
    offerableTests: ctx.offerableTests ?? [],
    recentEdits: (ctx.recentEdits ?? []).slice(-10),
    // Assumption verdicts only, no statistics.
    assumptionFlags:
      ctx.result?.test?.assumptions
        .filter((a) => !a.passed)
        .map((a) => ({ check: a.name, alternative: a.alternative })) ?? [],
  }
}

/* ── Validation and repair ─────────────────────────────────────────────────*/

export interface ValidatedPatch {
  ok: boolean
  mutations: SpecMutation[]
  rationale: string
  clarificationNeeded: string | null
  /** Why individual mutations were dropped; fed back for a repair attempt. */
  rejected: { mutation: unknown; reason: string }[]
}

/**
 * Validate a raw model proposal into typed mutations.
 *
 * Anything unrecognised is DROPPED with a reason rather than passed through, so
 * a malformed patch degrades to a smaller valid patch instead of corrupting the
 * spec. The rejects are returned so the orchestrator can run one repair round
 * (§6.6) before giving up.
 */
export function validateProposal(raw: unknown): ValidatedPatch {
  const parsed = SpecPatchProposal.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      mutations: [],
      rationale: "",
      clarificationNeeded: null,
      rejected: [{ mutation: raw, reason: "Proposal did not match the expected shape." }],
    }
  }

  const mutations: SpecMutation[] = []
  const rejected: ValidatedPatch["rejected"] = []

  for (const candidate of parsed.data.mutations) {
    const kind = candidate.kind
    if (typeof kind !== "string") {
      rejected.push({ mutation: candidate, reason: "Mutation has no kind." })
      continue
    }
    if (FORBIDDEN_MUTATION_KINDS.has(kind)) {
      rejected.push({
        mutation: candidate,
        reason: `The assistant may not author "${kind}". Exclusions, bracket placement, and the caption's wording are the researcher's own acts.`,
      })
      continue
    }
    if (!ALLOWED_MUTATION_KINDS.has(kind as SpecMutation["kind"])) {
      rejected.push({ mutation: candidate, reason: `Unknown mutation kind "${kind}".` })
      continue
    }
    const result = parseMutation(candidate)
    if (!result.ok) {
      rejected.push({ mutation: candidate, reason: result.reason })
      continue
    }
    // A calculatedColumn transform parses and applies, but the resolver deliberately
    // ignores it, formula evaluation belongs to the sheet, which already owns it, and a
    // second expression evaluator would be a second source of truth. Left through, it
    // would be proposed, executed and reported as applied while doing nothing: exactly
    // the silent-success the rest of this seam exists to remove. Refuse it here so it
    // lands in `rejected` and the researcher is told, rather than in the applied list.
    if (result.mutation.kind === "data.addTransform" && result.mutation.transform.kind === "calculatedColumn") {
      rejected.push({
        mutation: candidate,
        reason: "Calculated columns are the sheet's own formulas, add the column there and it becomes available here.",
      })
      continue
    }
    mutations.push(result.mutation)
  }

  return {
    ok: mutations.length > 0 || parsed.data.clarificationNeeded !== null,
    mutations,
    rationale: parsed.data.rationale,
    clarificationNeeded: parsed.data.clarificationNeeded,
    rejected,
  }
}

/**
 * Scan model prose for numbers that look like statistics it has invented.
 *
 * Law 2 says no number reaches the user that did not come from the engine. The
 * rationale is free text, so this is the backstop: if the model writes "p =
 * 0.03" in its explanation, that value did not come from the engine and must
 * not be shown as though it did.
 *
 * The test is inverted on purpose. This used to be a list of known statistic
 * phrasings, which can only ever catch what it enumerates: "p value of 0.03"
 * walked straight through a rule written for "p-value". So the default is now
 * deny. Every numeric literal in the prose counts as a fabricated statistic
 * unless its shape is obviously not a measurement:
 *
 *   - digits welded to letters, which name a thing rather than measure one:
 *     OD600, EC50, 384-well, plate_2, user-1
 *   - a bare integer below 100: groups, replicates, wells, degrees of freedom
 *   - a year
 *
 * Anything else is removed: every decimal fraction, every exponent, every
 * percentage, every bare integer of 100 or more.
 */
const NUMERIC_LITERAL = /\d+(?:,\d{3})*(?:\.\d+)?(?:[eE][+-]?\d+)?/g

export function containsFabricatedStatistic(rationale: string): boolean {
  NUMERIC_LITERAL.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = NUMERIC_LITERAL.exec(rationale)) !== null) {
    const literal = match[0]
    const before = rationale.slice(0, match.index)
    const after = rationale.slice(match.index + literal.length)

    // A fraction, an exponent or a percentage is never a plain count.
    if (/[.eE]/.test(literal) || after.startsWith("%")) return true

    // Digits welded to letters are part of a name, not a value.
    if (/[A-Za-z_]-?$/.test(before) || /^-?[A-Za-z_]/.test(after)) continue

    const value = Number(literal.replace(/,/g, ""))
    // ponytail: a bare integer below 100 is the known ceiling. An invented
    // integer-valued statistic ("the difference is 12 nM", "mean of 45 versus
    // 61") still slips through, and nothing structural separates it from the
    // counts that must survive: "There are 3 groups, so ANOVA is appropriate."
    // and "n = 8 wells" are the same shape. Telling them apart needs either a
    // list of measurement words — which is the enumerated gate this one replaced,
    // and it can only ever catch what it lists — or the engine result threaded in
    // here so a number can be ATTRIBUTED rather than guessed at. The call sites
    // have no result today; that is the upgrade path, not a cleverer regex.
    if (value < 100) continue
    if (value >= 1900 && value <= 2099) continue // a year

    return true
  }
  return false
}

/**
 * Strip a fabricated statistic rather than dropping the whole rationale: the
 * assistant's reasoning is still useful, and the sanctioned numbers are one
 * panel away in the results.
 *
 * What is left SAYS that something was taken, in both cases. The rationale is
 * the surface whose entire job is explaining a change, so a silent substitution
 * here is its own defect: "Filtered to concentrations above 0.5 uM, where the
 * assay is linear." is one sentence, it trips the gate on the threshold, and
 * swapping it for a bare pointer to the results panel loses the explanation AND
 * the fact that there ever was one. The researcher can only ask for it again if
 * they are told it went missing.
 */
export function sanitiseRationale(rationale: string): {
  text: string
  removed: boolean
} {
  if (!containsFabricatedStatistic(rationale)) return { text: rationale, removed: false }
  const kept = rationale
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !containsFabricatedStatistic(sentence))
    .join(" ")
    .trim()
  return {
    text:
      kept.length > 0
        ? `${kept} (The rest of the explanation was withheld: it carried numbers that did not come from the engine. The computed values are in the results panel.)`
        : "The assistant's explanation was withheld in full: it carried numbers that did not come from the engine. The computed values are in the results panel.",
    removed: true,
  }
}

/**
 * What stands in for a clarifying question the gate will not show.
 *
 * The question is prose, so it is held to the same standard as the rationale;
 * but it is a prompt the researcher has to ANSWER, so half of one is worse than
 * none and it is replaced whole rather than stripped.
 *
 * Replaced, and never nulled. `clarificationNeeded` is not only a message, it is
 * the P3 interlock: `canExecuteProposal` (workspace/spec-prompt.ts) withholds
 * Execute for any non-null value. Nulling a question the gate refused therefore
 * ENABLED Execute on the one proposal the model had itself flagged as ambiguous
 * — withholding the question made the seam less safe than not withholding it,
 * which is the wrong direction for a guard to fail in.
 *
 * Deliberately free of digits, so it survives its own gate.
 */
export const CLARIFICATION_WITHHELD =
  "The assistant had a question before making this change, but its wording carried a number that did not come from the engine, so it is not shown. Ask again and it can put the question without one."

/* ── The system prompt ─────────────────────────────────────────────────────*/

export const SPEC_AUTHOR_SYSTEM_PROMPT = `You configure statistical analyses for a research workspace by editing an Analysis Spec.

You do NOT compute anything. A separate, validated engine computes every number. Never state a p-value, test statistic, effect size, R², or EC50 in your reply: the researcher reads those from the results panel, and any figure you write would be an invention.

You return a patch: a JSON object with exactly three fields, "rationale" (a short plain-language explanation), "mutations" (an array of mutation objects), and "clarificationNeeded" (a string if you need to ask something instead of acting, otherwise null).

Every mutation object must have a "kind" field naming one of the mutations listed under "contract" in the bundle, plus exactly the other fields that kind's entry names, nothing more, nothing invented. A mutation of a kind not listed there, or missing a required field, is rejected outright and never reaches the researcher's analysis.

"data.setFilters" REPLACES the entire filter list; it does not append. If the bundle's "filters" already has entries you want to keep, re-emit them in full alongside whatever you are adding or changing, anything you leave out is gone.

How to choose a test:
- Prefer the design RECORDED in the project over the shape of the numbers. If the record says the same subjects were measured twice, the comparison is paired even if the columns look independent.
- If an assumption check has failed, propose the alternative the check names.
- If the request implies more than two groups, propose ANOVA with a post-hoc family rather than repeated t-tests, and say why.
- If the design is genuinely ambiguous, do not guess. Set clarificationNeeded and ask one specific question.
- If n is very small, say so plainly and note the limitation rather than proceeding silently.

You may not exclude data points or move significance brackets. Those are the researcher's own acts and carry their name in the record. If asked to remove points, offer a sensitivity analysis instead.

Respect edits the researcher made by hand. If your change would overwrite one, say so in the rationale.`
