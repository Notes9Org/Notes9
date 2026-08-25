import { z } from "zod"
import type { SpecMutation } from "./mutations"
import {
  AnalysisConfig,
  Annotation,
  AxisSpec,
  BRACKET_STYLE_FIELDS,
  ColumnRole,
  DesignDeclaration,
  ErrorBarKind,
  Exclusion,
  FigureKind,
  FigureSpec,
  MissingValueStrategy,
  PostHocKind,
  RowFilter,
  SeriesStyle,
  SignificanceBracket,
  TestKind,
  Transform,
} from "./analysis-spec"

/**
 * P1, the contract.
 *
 * `mutations.ts` defines what a mutation IS (the TS discriminated union the
 * rest of the app pattern-matches on). This file defines what a mutation is
 * ALLOWED TO LOOK LIKE on the wire, as one zod schema that mirrors that union
 * branch for branch. It exists because an LLM authors mutations as untyped
 * JSON: before this file the cast at the parse boundary (`spec-author.ts`)
 * simply trusted the model, and a malformed patch would not be caught until
 * something downstream, `describeMutation`, `applyMutation`, read a field
 * that was not there.
 *
 * Every payload schema below is REUSED from `analysis-spec.ts`, not
 * redeclared, so the two files cannot silently disagree about what a
 * `RowFilter` or a `SeriesStyle` is. `MUTATION_CONTRACT` then walks this
 * schema to produce the prompt text, so the prompt cannot drift from the
 * validator either. There is exactly one place a new mutation kind is
 * taught to the system: this file.
 */

/* ── The payload schemas, mirroring `mutations.ts` branch for branch ────────*/

/**
 * The pick mask for a bracket style patch, built from the ONE list that names
 * those fields (`BRACKET_STYLE_FIELDS`, which is also what regeneration and the
 * reopen residue copy). Hand-writing the field list here would let the mutation
 * accept a field regeneration then drops, which is the silent half of a restyle
 * that reports success and disappears on the next recompute.
 */
const BRACKET_STYLE_MASK = Object.fromEntries(
  BRACKET_STYLE_FIELDS.map((field) => [field, true])
) as { [K in (typeof BRACKET_STYLE_FIELDS)[number]]: true }


export const SpecMutationSchema = z.discriminatedUnion("kind", [
  /* Figure, style. */
  z.object({ kind: z.literal("figure.setKind"), value: FigureKind }),
  z.object({ kind: z.literal("figure.setTitle"), value: FigureSpec.shape.title }),
  z.object({ kind: z.literal("figure.setCaption"), value: FigureSpec.shape.caption }),
  z.object({ kind: z.literal("figure.setSubtitle"), value: FigureSpec.shape.subtitle }),
  z.object({ kind: z.literal("figure.setPalette"), value: FigureSpec.shape.palette }),
  z.object({
    kind: z.literal("figure.setLegend"),
    show: z.boolean(),
    position: FigureSpec.shape.legendPosition.optional(),
  }),
  z.object({ kind: z.literal("figure.setGridlines"), value: z.boolean() }),
  z.object({
    kind: z.literal("figure.setDimensions"),
    width: FigureSpec.shape.width.optional(),
    height: FigureSpec.shape.height.optional(),
  }),
  z.object({
    kind: z.literal("figure.setFont"),
    family: FigureSpec.shape.fontFamily.optional(),
    titleSize: FigureSpec.shape.titleFontSize.optional(),
    axisSize: FigureSpec.shape.axisFontSize.optional(),
  }),
  z.object({
    kind: z.literal("figure.setSeriesStyle"),
    seriesKey: z.string().max(256),
    patch: SeriesStyle.omit({ key: true }).partial(),
  }),
  z.object({ kind: z.literal("figure.addAnnotation"), annotation: Annotation }),
  z.object({
    kind: z.literal("figure.updateAnnotation"),
    id: z.string().max(64),
    // `Partial<Annotation>` in TS terms: a partial match against any ONE of the
    // annotation shapes, not a fresh looser object, so a caller cannot mix
    // "text"-only fields with "arrow"-only fields under a missing discriminant.
    // Indexed rather than `.map()`ed: `.map()` widens each branch's precise
    // object type down to `ZodTypeAny` (whose inferred output is `any`),
    // which would make `z.infer<typeof SpecMutationSchema>` silently drift
    // from `SpecMutation` instead of catching a real shape mismatch.
    patch: z.union([
      Annotation.options[0].partial(),
      Annotation.options[1].partial(),
      Annotation.options[2].partial(),
    ]),
  }),
  z.object({ kind: z.literal("figure.removeAnnotation"), id: z.string().max(64) }),
  z.object({ kind: z.literal("figure.moveBracket"), id: z.string().max(64), offsetY: z.number() }),
  z.object({
    kind: z.literal("figure.setBracketStyle"),
    id: z.string().max(64),
    // Sparse: every field is optional, and an absent one means "leave it alone",
    // not "reset it". That is what lets a restyle survive regeneration — only
    // the fields the researcher actually set are ever carried across.
    patch: SignificanceBracket.pick(BRACKET_STYLE_MASK).partial(),
  }),
  z.object({ kind: z.literal("figure.setShowExcluded"), value: z.boolean() }),
  /* Axes. */
  z.object({
    kind: z.literal("axis.set"),
    axis: z.enum(["x", "y", "y2"]),
    patch: AxisSpec.partial(),
  }),
  z.object({ kind: z.literal("figure.setErrorBars"), value: ErrorBarKind }),
  /* Analysis. */
  z.object({ kind: z.literal("analysis.setTest"), value: TestKind }),
  z.object({ kind: z.literal("analysis.setPostHoc"), value: PostHocKind }),
  z.object({ kind: z.literal("analysis.setTails"), value: AnalysisConfig.shape.tails }),
  z.object({ kind: z.literal("analysis.setAlpha"), value: z.number() }),
  z.object({
    kind: z.literal("analysis.setColumns"),
    response: AnalysisConfig.shape.responseColumns.optional(),
    group: AnalysisConfig.shape.groupColumn.optional(),
    secondFactor: AnalysisConfig.shape.secondFactorColumn.optional(),
  }),
  z.object({ kind: z.literal("analysis.setReferenceLevel"), value: AnalysisConfig.shape.referenceLevel }),
  z.object({ kind: z.literal("analysis.setMissingValues"), value: MissingValueStrategy }),
  z.object({
    kind: z.literal("analysis.setNonlinear"),
    // `nonlinear` is `ZodDefault<ZodNullable<ZodObject<...>>>` on `AnalysisConfig`;
    // unwrap down to the object so the patch is a genuine partial of it, not a
    // hand-copied field list that can drift from the stored shape.
    patch: AnalysisConfig.shape.nonlinear.removeDefault().unwrap().partial(),
  }),
  /* Data. */
  z.object({ kind: z.literal("data.addTransform"), transform: Transform }),
  z.object({ kind: z.literal("data.removeTransform"), index: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("data.setFilters"), filters: z.array(RowFilter) }),
  z.object({ kind: z.literal("data.excludeRow"), exclusion: Exclusion }),
  z.object({ kind: z.literal("data.restoreRow"), rowId: z.string().max(128) }),
  /* Roles and design. */
  z.object({ kind: z.literal("design.set"), patch: DesignDeclaration.partial() }),
  z.object({ kind: z.literal("roles.set"), roles: z.array(ColumnRole) }),
])
export type SpecMutationSchema = z.infer<typeof SpecMutationSchema>

/* ── Parsing, with a reason a non-engineer can read ──────────────────────────*/

function issuePath(issue: z.ZodIssue): string {
  return issue.path.length > 0 ? issue.path.join(".") : "(root)"
}

/**
 * `parseMutation` is the ONLY place raw JSON becomes a `SpecMutation`. A
 * discriminated union dispatches to the one branch whose `kind` matched
 * before validating the rest, so `result.error.issues` already names the
 * field that was wrong for THAT kind rather than every kind at once, the
 * reason strings below lean on that.
 */
export function parseMutation(
  raw: unknown
): { ok: true; mutation: SpecMutation } | { ok: false; reason: string } {
  const result = SpecMutationSchema.safeParse(raw)
  if (result.success) {
    return { ok: true, mutation: result.data as SpecMutation }
  }

  const kind =
    typeof raw === "object" && raw !== null && "kind" in raw
      ? String((raw as Record<string, unknown>).kind)
      : undefined

  const first = result.error.issues[0]
  if (!first) {
    return { ok: false, reason: "Mutation did not match the expected shape." }
  }
  if (first.code === "invalid_union_discriminator") {
    return { ok: false, reason: `Unknown mutation kind "${kind ?? "(missing)"}".` }
  }
  if (first.path.length === 0 && first.code === "invalid_type") {
    return { ok: false, reason: "A mutation must be a JSON object with a \"kind\" field." }
  }
  const label = kind ? `"${kind}"` : "Mutation"
  return { ok: false, reason: `${label} at ${issuePath(first)}: ${first.message}` }
}

/* ── The prompt contract, walked from the schema so it cannot drift ─────────*/

/** Recursively unwrap the parts of a schema that don't change its shape. */
function bareType(schema: z.ZodTypeAny): z.ZodTypeAny {
  let s = schema
  for (;;) {
    if (s instanceof z.ZodDefault) {
      s = s.removeDefault()
    } else if (s instanceof z.ZodOptional || s instanceof z.ZodNullable) {
      s = s.unwrap()
    } else {
      return s
    }
  }
}

/** A one-line, LLM-readable rendering of a field's type, enum domain included. */
function describeType(schema: z.ZodTypeAny): string {
  const s = bareType(schema)
  if (s instanceof z.ZodEnum) return `enum(${s.options.join("|")})`
  if (s instanceof z.ZodLiteral) return JSON.stringify(s.value)
  if (s instanceof z.ZodString) return "string"
  if (s instanceof z.ZodNumber) return "number"
  if (s instanceof z.ZodBoolean) return "boolean"
  if (s instanceof z.ZodArray) return `${describeType(s.element)}[]`
  if (s instanceof z.ZodRecord) return `record<string, ${describeType(s.valueSchema)}>`
  if (s instanceof z.ZodObject) {
    const fields = Object.entries(s.shape).map(
      ([key, value]) => `${key}: ${describeType(value as z.ZodTypeAny)}`
    )
    return `{ ${fields.join(", ")} }`
  }
  if (s instanceof z.ZodDiscriminatedUnion || s instanceof z.ZodUnion) {
    return (s.options as z.ZodTypeAny[]).map(describeType).join(" | ")
  }
  return "unknown"
}

/**
 * The mutation contract, one line per kind, generated by walking
 * `SpecMutationSchema`. This is what `spec-author.ts` puts in front of the
 * model so it knows the legal kinds and their exact payload shapes, the
 * alternative, a hand-written list, is exactly the kind of prose that goes
 * stale the day someone adds a mutation and forgets to update it.
 */
export const MUTATION_CONTRACT: string = SpecMutationSchema.options
  .map((option) => {
    const kindField = option.shape.kind as z.ZodLiteral<string>
    const fields = Object.entries(option.shape)
      .filter(([key]) => key !== "kind")
      .map(([key, value]) => `${key}: ${describeType(value as z.ZodTypeAny)}`)
    return fields.length > 0 ? `${kindField.value}(${fields.join(", ")})` : kindField.value
  })
  .join("\n")
