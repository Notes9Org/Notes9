"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  Books,
  Check,
  Flask as FlaskConical,
  FolderPlus,
  GraduationCap,
  Microscope,
  NotePencil as NotebookPen,
  Sparkle as Sparkles,
  Users,
} from "@phosphor-icons/react/ssr"
import type { Icon as PhosphorIcon } from "@phosphor-icons/react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { createClient } from "@/lib/supabase/client"
import { createProject } from "@/lib/projects"
import { createExperiment } from "@/lib/experiments"
import { completeWelcomeAction } from "@/app/actions/onboarding"
import { getUniqueNameErrorMessage } from "@/lib/unique-name-error"
import { recordRumEvent } from "@/lib/rum"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { cn } from "@/lib/utils"

export type WelcomeResult = {
  jobTitle: string
  researchField: string
  primaryGoal: string
  projectId: string | null
}

/**
 * Question phases are skippable; `project` is not. A user must leave onboarding
 * with a project of their own, because every experiment, note and paper in
 * Notes9 hangs off one — landing on an empty workspace has nowhere to put work.
 */
type Phase = "role" | "field" | "goal" | "seeding" | "project"

const QUESTION_PHASES: Phase[] = ["role", "field", "goal", "project"]

/** House easing — matches `--n9-ease` and the shared EASE_OUT constant. */
const EASE = [0.22, 1, 0.36, 1] as const

type OptionCard = { value: string; label: string; icon: PhosphorIcon; hint?: string }

const ROLES: OptionCard[] = [
  { value: "PhD / Graduate Student", label: "Grad student", icon: NotebookPen, hint: "PhD or masters" },
  { value: "Postdoctoral Researcher", label: "Postdoc", icon: Microscope, hint: "Early career" },
  { value: "Principal Investigator", label: "PI / lab head", icon: GraduationCap, hint: "Runs a group" },
  { value: "Research Scientist", label: "Industry researcher", icon: FlaskConical, hint: "Company R&D" },
]

const GOALS: OptionCard[] = [
  { value: "Organize my research", label: "Organise my research", icon: FlaskConical },
  { value: "Review the literature", label: "Review the literature", icon: Books },
  { value: "Analyse my data", label: "Analyse my data", icon: Sparkles },
  { value: "Write up results & papers", label: "Write up results & papers", icon: NotebookPen },
]

/** Ordered so the first four cover the seeded demo packs. */
const FIELD_SUGGESTIONS = [
  "Molecular biology",
  "Neuroscience",
  "Microbiology",
  "Chemistry",
  "Bioinformatics",
  "Immunology",
  "Genetics",
  "Materials science",
]

/** Nudges the project-name placeholder toward something the user recognises. */
function projectPlaceholder(field: string): string {
  const f = field.toLowerCase()
  if (f.includes("neuro")) return "e.g. Cortical excitability in layer 5"
  if (f.includes("micro") || f.includes("bacteri")) return "e.g. Resistance profiling of clinical isolates"
  if (f.includes("chem") || f.includes("material")) return "e.g. Ligand screen for biaryl coupling"
  if (f.includes("bioinformat") || f.includes("computat") || f.includes("genom"))
    return "e.g. RNA-seq differential expression"
  return "e.g. Antibody expression optimisation"
}

/**
 * First-login welcome wizard.
 *
 * Owns its own persistence, unlike the previous version: `completeWelcomeAction`
 * writes the answers and seeds field-matched starter content in one server
 * round-trip, so the demo pack can actually observe the research field. The
 * parent only learns that the flow finished.
 */
export function WelcomeDialog({
  open,
  firstName,
  onComplete,
}: {
  open: boolean
  firstName: string
  onComplete: (result: WelcomeResult) => void
}) {
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState<Phase>("role")
  const [jobTitle, setJobTitle] = useState("")
  // Field and goal accept several answers — researchers rarely sit in one field,
  // and most arrive wanting to do more than one thing. Stored comma-separated
  // (first choice first) so the existing text columns still work and
  // `resolveDemoPack` can honour the user's ordering.
  const [fields, setFields] = useState<string[]>([])
  const [customField, setCustomField] = useState("")
  const [goals, setGoals] = useState<string[]>([])
  const [projectName, setProjectName] = useState("")
  const [experimentName, setExperimentName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const getSupabase = () => (supabaseRef.current ??= createClient())

  const stepIndex = QUESTION_PHASES.indexOf(phase)

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  /** Selected chips first, then anything typed in the "other" box. */
  const researchField = [...fields, customField.trim()].filter(Boolean).join(", ")
  const primaryGoal = goals.join(", ")

  /**
   * Persist answers and seed starter content, then move to the project step.
   * Deliberately keeps a floor on how long the seeding screen shows: the action
   * often resolves in a few hundred ms, and a panel that flashes past reads as a
   * glitch rather than as work being done.
   */
  const runSeeding = useCallback(async () => {
    setPhase("seeding")
    // Counts only — never the free-text field the user typed.
    recordRumEvent(AnalyticsEvent.ONBOARDING_QUESTION_ANSWERED, {
      hasRole: Boolean(jobTitle),
      fieldCount: fields.length + (customField.trim() ? 1 : 0),
      goalCount: goals.length,
    })
    const started = Date.now()
    try {
      await completeWelcomeAction({
        jobTitle: jobTitle.trim(),
        researchField,
        primaryGoal,
      })
    } catch (err) {
      // A failed seed must never trap the user — ensureUserProfile retries later.
      console.error("[welcome] seeding failed", err)
    }
    const elapsed = Date.now() - started
    const floor = reduceMotion ? 0 : 1500
    if (elapsed < floor) await new Promise((r) => setTimeout(r, floor - elapsed))
    setPhase("project")
  }, [jobTitle, fields, customField, goals, researchField, primaryGoal, reduceMotion])

  /** Creates the user's first project (required) plus an optional experiment. */
  const submitProject = async () => {
    const name = projectName.trim()
    if (!name || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const supabase = getSupabase()
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error("Your session expired — please sign in again.")

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle()
      const organizationId = profile?.organization_id as string | undefined
      if (!organizationId) throw new Error("We couldn't find your lab. Try reloading the page.")

      const { data: project, error: projectError } = await createProject(supabase, {
        name,
        organizationId,
        createdBy: userId,
        status: "active",
        priority: "medium",
      })

      if (projectError || !project) {
        setError(
          projectError
            ? getUniqueNameErrorMessage(projectError, "project")
            : "We couldn't create that project. Please try again."
        )
        setSubmitting(false)
        return
      }

      const expName = experimentName.trim()
      if (expName) {
        // Non-fatal: the project is the required artefact, the experiment is a bonus.
        const { error: expError } = await createExperiment(supabase, {
          name: expName,
          projectId: project.id as string,
          assignedTo: userId,
          createdBy: userId,
        })
        if (expError) console.error("[welcome] first experiment failed", expError)
      }

      recordRumEvent(AnalyticsEvent.ONBOARDING_COMPLETED, {
        withExperiment: Boolean(expName),
      })

      onComplete({
        jobTitle: jobTitle.trim(),
        researchField,
        primaryGoal,
        projectId: project.id as string,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="overflow-hidden border-border/70 p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Welcome to Notes9</DialogTitle>

        <ProgressHeader stepIndex={stepIndex} total={QUESTION_PHASES.length} />

        <AnimatePresence mode="wait" initial={false}>
          {phase === "role" && (
            <Panel key="role" reduceMotion={reduceMotion}>
              <Heading
                title={`Welcome to Notes9, ${firstName}`}
                subtitle="Three quick questions so we can set up your workspace. Under a minute."
              />
              <CardGrid
                options={ROLES}
                selected={jobTitle ? [jobTitle] : []}
                onSelect={(v) => {
                  setJobTitle(v)
                  setPhase("field")
                }}
                columns={2}
                withHint
                reduceMotion={reduceMotion}
              />
              <NavRow onSkip={() => setPhase("field")} />
            </Panel>
          )}

          {phase === "field" && (
            <Panel key="field" reduceMotion={reduceMotion}>
              <Heading
                title="What do you work on?"
                subtitle="Pick as many as apply — your first choice decides the starter content."
              />
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {FIELD_SUGGESTIONS.map((f) => (
                  <Chip
                    key={f}
                    label={f}
                    selected={fields.includes(f)}
                    onClick={() => setFields((prev) => toggle(prev, f))}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </div>
              <Input
                value={customField}
                onChange={(e) => setCustomField(e.target.value)}
                placeholder="Add another field…"
                className="mt-4"
                aria-label="Other research field"
              />
              <NavRow
                onBack={() => setPhase("role")}
                onNext={() => setPhase("goal")}
                nextDisabled={!researchField}
                onSkip={() => setPhase("goal")}
              />
            </Panel>
          )}

          {phase === "goal" && (
            <Panel key="goal" reduceMotion={reduceMotion}>
              <Heading
                title="What would you like to do?"
                subtitle="Pick as many as apply — we'll order your getting-started list around them."
              />
              <CardGrid
                options={GOALS}
                selected={goals}
                onSelect={(v) => setGoals((prev) => toggle(prev, v))}
                columns={1}
                reduceMotion={reduceMotion}
              />
              <NavRow
                onBack={() => setPhase("field")}
                onNext={() => void runSeeding()}
                nextDisabled={goals.length === 0}
                onSkip={() => void runSeeding()}
              />
            </Panel>
          )}

          {phase === "seeding" && (
            <Panel key="seeding" reduceMotion={reduceMotion}>
              <SeedingPanel field={researchField} reduceMotion={reduceMotion} />
            </Panel>
          )}

          {phase === "project" && (
            <Panel key="project" reduceMotion={reduceMotion}>
              <Heading
                icon={FolderPlus}
                title="Create your first project"
                subtitle="Experiments, notes, protocols and papers all live inside a project — so you'll need one to start."
              />

              <form
                className="mt-5 space-y-4 text-left"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitProject()
                }}
              >
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    Project name
                  </span>
                  <Input
                    autoFocus
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder={projectPlaceholder(researchField)}
                    aria-label="Project name"
                    aria-invalid={Boolean(error)}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-foreground">
                    First experiment{" "}
                    <span className="font-normal text-muted-foreground">— optional</span>
                  </span>
                  <Input
                    value={experimentName}
                    onChange={(e) => setExperimentName(e.target.value)}
                    placeholder="e.g. Pilot run — conditions A vs B"
                    aria-label="First experiment name"
                  />
                </label>

                <AnimatePresence initial={false}>
                  {error && (
                    <motion.p
                      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0 }}
                      transition={{ duration: 0.18, ease: EASE }}
                      role="alert"
                      className="text-xs font-medium text-destructive"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={!projectName.trim() || submitting}
                  className="n9-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Spinner className="size-4" />
                      Creating…
                    </>
                  ) : (
                    <>
                      Create project and finish
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-muted-foreground">
                  We&apos;ve also added a sample project so you have something to explore — you can
                  delete it any time.
                </p>
              </form>
            </Panel>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- subcomponents ------------------------------ */

function ProgressHeader({ stepIndex, total }: { stepIndex: number; total: number }) {
  // The seeding phase reports -1; hold the bar at the last completed question.
  const filled = stepIndex < 0 ? total - 1 : stepIndex
  return (
    <div className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-6 py-3">
      <img
        src="/notes9-mascot-ui.png"
        alt=""
        aria-hidden
        className="size-7 shrink-0 rounded-full object-contain"
      />
      <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={filled + 1}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              initial={false}
              animate={{ width: i <= filled ? "100%" : "0%" }}
              transition={{ duration: 0.42, ease: EASE }}
            />
          </span>
        ))}
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {Math.min(filled + 1, total)} / {total}
      </span>
    </div>
  )
}

function Panel({
  children,
  reduceMotion,
}: {
  children: React.ReactNode
  reduceMotion: boolean | null
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, x: -20 }}
      transition={{ duration: 0.24, ease: EASE }}
      className="px-6 pb-6 pt-6"
    >
      {children}
    </motion.div>
  )
}

function Heading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon?: PhosphorIcon
  title: string
  subtitle: string
}) {
  return (
    <div className="text-center">
      {Icon && (
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--n9-accent-light)]">
          <Icon className="size-5 text-primary" aria-hidden />
        </div>
      )}
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {subtitle}
      </p>
    </div>
  )
}

function Chip({
  label,
  selected,
  onClick,
  reduceMotion,
}: {
  label: string
  selected: boolean
  onClick: () => void
  reduceMotion: boolean | null
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      whileHover={reduceMotion ? undefined : { y: -1 }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.16, ease: EASE }}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
      )}
    >
      {label}
    </motion.button>
  )
}

/**
 * Renders single- and multi-select alike — the caller decides by whether its
 * `onSelect` replaces the selection or toggles it. `selected` is always a list
 * so the checked state stays one code path.
 */
function CardGrid({
  options,
  selected: selectedValues,
  onSelect,
  columns,
  withHint = false,
  reduceMotion,
}: {
  options: OptionCard[]
  selected: string[]
  onSelect: (v: string) => void
  columns: 1 | 2
  withHint?: boolean
  reduceMotion: boolean | null
}) {
  return (
    <div className={cn("mt-5 grid gap-2.5", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
      {options.map(({ value: v, label, icon: Icon, hint }, i) => {
        const selected = selectedValues.includes(v)
        return (
          <motion.button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            aria-pressed={selected}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE, delay: reduceMotion ? 0 : i * 0.04 }}
            whileHover={reduceMotion ? undefined : { y: -2 }}
            whileTap={reduceMotion ? undefined : { scale: 0.99 }}
            className={cn(
              "group flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
              selected
                ? "border-primary bg-[var(--n9-accent-light)] ring-1 ring-primary"
                : "border-border bg-background hover:border-primary/40 hover:bg-muted/40"
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{label}</span>
              {withHint && hint && (
                <span className="block truncate text-xs text-muted-foreground">{hint}</span>
              )}
            </span>
            {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
          </motion.button>
        )
      })}
    </div>
  )
}

/**
 * Shown while `completeWelcomeAction` persists answers and seeds starter
 * content. The staggered ticks are honest about what is happening rather than a
 * generic spinner — the work really is those four things.
 */
function SeedingPanel({
  field,
  reduceMotion,
}: {
  field: string
  reduceMotion: boolean | null
}) {
  const steps = [
    field.trim() ? `Matching content to ${field.trim().toLowerCase()}` : "Matching starter content",
    "Creating a sample project",
    "Adding protocols and lab notes",
    "Saving reference papers",
  ]

  return (
    <div className="py-2 text-center">
      <div className="relative mx-auto mb-5 w-fit">
        <div className="absolute inset-0 -z-10 rounded-full bg-[var(--n9-accent-glow,rgba(150,80,52,0.18))] blur-2xl" />
        <img
          src="/notes9-mascot-ui.png"
          alt=""
          aria-hidden
          className="tour-mascot-animate size-20 rounded-full object-contain"
        />
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Setting up your lab</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">This takes a couple of seconds.</p>

      <ul className="mx-auto mt-6 max-w-xs space-y-2.5 text-left">
        {steps.map((label, i) => (
          <motion.li
            key={label}
            initial={reduceMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: reduceMotion ? 0 : 0.15 + i * 0.28 }}
            className="flex items-center gap-2.5 text-sm text-muted-foreground"
          >
            <motion.span
              initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 320,
                damping: 30,
                mass: 0.8,
                delay: reduceMotion ? 0 : 0.15 + i * 0.28,
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--n9-accent-light)]"
            >
              <Check className="size-3 text-primary" aria-hidden />
            </motion.span>
            {label}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Back / Skip / Continue row. There is intentionally no `onSkip` on the project
 * phase — that step is required, so it renders its own submit button instead.
 */
function NavRow({
  onBack,
  onNext,
  nextDisabled = false,
  onSkip,
}: {
  onBack?: () => void
  onNext?: () => void
  nextDisabled?: boolean
  onSkip?: () => void
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </button>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="n9-press inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
            <ArrowRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
