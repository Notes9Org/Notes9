"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  Beaker,
  Building2,
  Check,
  Compass,
  FlaskConical,
  GraduationCap,
  Landmark,
  Microscope,
  NotebookPen,
  Rocket,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type WelcomeResult = {
  jobTitle: string
  sector: string
  organizationName: string
  researchField: string
  primaryGoal: string
  startTour: boolean
}

type OptionCard = { value: string; label: string; icon: LucideIcon; hint?: string }

const ROLES: OptionCard[] = [
  { value: "Principal Investigator", label: "PI / Professor", icon: GraduationCap },
  { value: "Postdoctoral Researcher", label: "Postdoc", icon: Microscope },
  { value: "PhD / Graduate Student", label: "Grad student", icon: NotebookPen },
  { value: "Research Scientist", label: "Research scientist", icon: FlaskConical },
  { value: "Lab Manager / Technician", label: "Lab manager / tech", icon: Beaker },
  { value: "Other", label: "Something else", icon: Users },
]

const SECTORS: OptionCard[] = [
  { value: "Academic", label: "Academic", icon: GraduationCap, hint: "University or institute" },
  { value: "Industry", label: "Industry", icon: Building2, hint: "Company R&D / biotech" },
  { value: "Government", label: "Government", icon: Landmark, hint: "National or public lab" },
  { value: "Clinical", label: "Clinical", icon: Stethoscope, hint: "Hospital or clinic" },
]

const GOALS: OptionCard[] = [
  { value: "Organize my research", label: "Organize my research", icon: FlaskConical },
  { value: "Write up results & papers", label: "Write up results & papers", icon: NotebookPen },
  { value: "Collaborate with my team", label: "Collaborate with my team", icon: Users },
  { value: "Explore AI for my work", label: "Explore AI for my work", icon: Sparkles },
]

const FIELD_SUGGESTIONS = [
  "Molecular biology",
  "Chemistry",
  "Neuroscience",
  "Genetics",
  "Microbiology",
  "Immunology",
  "Materials science",
  "Bioinformatics",
]

const TOTAL_STEPS = 6 // splash + 4 questions + finish

/**
 * First-login welcome wizard. Presentational only — persistence and tour launch
 * are handled by the parent via `onComplete`. Optional questions can each be
 * skipped; nothing blocks the user from reaching the workspace.
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
  const [step, setStep] = useState(0)
  const [jobTitle, setJobTitle] = useState("")
  const [sector, setSector] = useState("")
  const [organizationName, setOrganizationName] = useState("")
  const [researchField, setResearchField] = useState("")
  const [primaryGoal, setPrimaryGoal] = useState("")

  const result = useMemo<Omit<WelcomeResult, "startTour">>(
    () => ({
      jobTitle: jobTitle.trim(),
      sector: sector.trim(),
      organizationName: organizationName.trim(),
      researchField: researchField.trim(),
      primaryGoal: primaryGoal.trim(),
    }),
    [jobTitle, sector, organizationName, researchField, primaryGoal],
  )

  const finish = (startTour: boolean) => onComplete({ ...result, startTour })
  const next = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

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

        {/* Progress header */}
        {step > 0 && (
          <div className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-6 py-3">
            <img
              src="/notes9-mascot-ui.png"
              alt=""
              aria-hidden
              className="size-7 shrink-0 rounded-full object-contain"
            />
            <div className="flex flex-1 gap-1.5">
              {Array.from({ length: TOTAL_STEPS - 1 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors duration-300",
                    i < step ? "bg-primary" : "bg-border",
                  )}
                />
              ))}
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              {step} / {TOTAL_STEPS - 1}
            </span>
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {/* ---- 0: Splash ---- */}
          {step === 0 && (
            <Panel key="splash">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-5">
                  <div className="absolute inset-0 -z-10 rounded-full bg-[var(--n9-accent-glow,rgba(150,80,52,0.18))] blur-2xl" />
                  <img
                    src="/notes9-mascot-ui.png"
                    alt=""
                    aria-hidden
                    className="tour-mascot-animate size-24 rounded-full object-contain"
                  />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Welcome to Notes9, {firstName}
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Your AI-native lab notebook for planning experiments, capturing results, and
                  reasoning over your research. Let&apos;s set it up for the way{" "}
                  <span className="font-medium text-foreground">you</span> work — it takes under a
                  minute.
                </p>

                <div className="mt-6 grid w-full grid-cols-3 gap-2">
                  {[
                    { icon: FlaskConical, label: "Experiments" },
                    { icon: NotebookPen, label: "Lab notes" },
                    { icon: Sparkles, label: "Catalyst AI" },
                  ].map(({ icon: Icon, label }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-2 py-3"
                    >
                      <Icon className="size-5 text-primary" aria-hidden />
                      <span className="text-[11px] font-medium text-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <PrimaryButton onClick={next} label="Let's personalize it" full />
              <button
                type="button"
                onClick={() => finish(false)}
                className="mx-auto mt-3 block text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip setup
              </button>
            </Panel>
          )}

          {/* ---- 1: Role ---- */}
          {step === 1 && (
            <Panel key="role">
              <Heading
                icon={GraduationCap}
                title="What's your role?"
                subtitle="So Notes9 and Catalyst can speak your language."
              />
              <CardGrid
                options={ROLES}
                value={jobTitle}
                onSelect={(v) => {
                  setJobTitle(v)
                }}
                columns={2}
              />
              <NavRow onBack={back} onNext={next} canSkip onSkip={next} />
            </Panel>
          )}

          {/* ---- 2: Sector ---- */}
          {step === 2 && (
            <Panel key="sector">
              <Heading
                icon={Building2}
                title="Where do you work?"
                subtitle="Academia, industry, or somewhere else?"
              />
              <CardGrid
                options={SECTORS}
                value={sector}
                onSelect={setSector}
                columns={2}
                withHint
              />
              <NavRow onBack={back} onNext={next} canSkip onSkip={next} />
            </Panel>
          )}

          {/* ---- 3: Place of work + field ---- */}
          {step === 3 && (
            <Panel key="place">
              <Heading
                icon={Landmark}
                title="Tell us a bit more"
                subtitle="Optional — it helps tailor suggestions to your work."
              />

              <label className="mt-4 block text-left">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Institution or company
                </span>
                <Input
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="e.g. Stanford University, Genentech…"
                  aria-label="Institution or company"
                />
              </label>

              <div className="mt-4 text-left">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Research field
                </span>
                <div className="flex flex-wrap gap-2">
                  {FIELD_SUGGESTIONS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setResearchField(f)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        researchField === f
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <Input
                  value={researchField}
                  onChange={(e) => setResearchField(e.target.value)}
                  placeholder="Or type your own…"
                  className="mt-3"
                  aria-label="Research field"
                />
              </div>

              <NavRow onBack={back} onNext={next} canSkip onSkip={next} />
            </Panel>
          )}

          {/* ---- 4: Goal ---- */}
          {step === 4 && (
            <Panel key="goal">
              <Heading
                icon={Rocket}
                title="What would you like to do first?"
                subtitle="We'll point you in the right direction."
              />
              <CardGrid options={GOALS} value={primaryGoal} onSelect={setPrimaryGoal} columns={1} />
              <NavRow onBack={back} onNext={next} canSkip onSkip={next} nextLabel="Almost done" />
            </Panel>
          )}

          {/* ---- 5: Finish ---- */}
          {step === 5 && (
            <Panel key="finish">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--n9-accent-light)]">
                  <Check className="size-7 text-primary" aria-hidden />
                </div>
                <h2 className="text-xl font-semibold text-foreground">You&apos;re all set, {firstName}</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Take the interactive tour and we&apos;ll walk you through the workspace — you can
                  click around as we go. Or jump straight in; the{" "}
                  <span className="font-medium text-foreground">?</span> button reopens the tour
                  anytime.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => finish(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  <Compass className="size-4" />
                  Take the interactive tour
                </button>
                <button
                  type="button"
                  onClick={() => finish(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Explore on my own
                </button>
              </div>
              <button
                type="button"
                onClick={back}
                className="mx-auto mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                Back
              </button>
            </Panel>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- subcomponents ------------------------------ */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -28 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
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
  icon: LucideIcon
  title: string
  subtitle: string
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--n9-accent-light)]">
        <Icon className="size-5 text-primary" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function CardGrid({
  options,
  value,
  onSelect,
  columns,
  withHint = false,
}: {
  options: OptionCard[]
  value: string
  onSelect: (v: string) => void
  columns: 1 | 2
  withHint?: boolean
}) {
  return (
    <div className={cn("mt-5 grid gap-2.5", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
      {options.map(({ value: v, label, icon: Icon, hint }) => {
        const selected = value === v
        return (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            aria-pressed={selected}
            className={cn(
              "group flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
              selected
                ? "border-primary bg-[var(--n9-accent-light)] ring-1 ring-primary"
                : "border-border bg-background hover:border-primary/40 hover:bg-muted/40",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
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
          </button>
        )
      })}
    </div>
  )
}

function NavRow({
  onBack,
  onNext,
  canSkip = false,
  onSkip,
  nextLabel = "Continue",
}: {
  onBack: () => void
  onNext: () => void
  canSkip?: boolean
  onSkip?: () => void
  nextLabel?: string
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back
      </button>
      <div className="flex items-center gap-2">
        {canSkip && onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          {nextLabel}
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

function PrimaryButton({
  onClick,
  label,
  full = false,
}: {
  onClick: () => void
  label: string
  full?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mt-6 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90",
        full && "w-full",
      )}
    >
      {label}
      <ArrowRight className="size-4" />
    </button>
  )
}
