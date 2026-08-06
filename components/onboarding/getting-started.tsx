"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowRight,
  Books,
  Check,
  ChartLine,
  Compass,
  FolderPlus,
  Sparkle as Sparkles,
  UserCircle,
  X,
} from "@phosphor-icons/react/ssr"
import type { Icon as PhosphorIcon } from "@phosphor-icons/react"
import { Card } from "@/components/ui/card"
import { requestStartTour } from "@/components/tour/app-tour"
import {
  prioritiseForGoals,
  type ChecklistTaskId,
  type ResolvedChecklist,
  type ResolvedTask,
} from "@/lib/onboarding/checklist"
import {
  setChecklistDismissedAction,
  setChecklistTaskDoneAction,
} from "@/app/actions/onboarding"
import { recordRumEvent } from "@/lib/rum"
import { AnalyticsEvent } from "@/lib/analytics/events"
import { cn } from "@/lib/utils"

/** House easing, matches `--n9-ease`. */
const EASE = [0.22, 1, 0.36, 1] as const

const TASK_ICONS: Record<ChecklistTaskId, PhosphorIcon> = {
  personalise: UserCircle,
  create_project: FolderPlus,
  literature_search: Books,
  ask_catalyst: Sparkles,
  chart_data: ChartLine,
}

/**
 * The persistent Getting Started panel on the dashboard.
 *
 * This is the single recovery path for onboarding: whatever a user skips, the
 * wizard, the tour, a step in either, ends up here, and it stays available
 * until they finish or dismiss it. Progress is measured from real workspace rows
 * on the server (see lib/onboarding/measure-checklist.ts), so it also credits
 * work the user did before ever noticing the list.
 */
export function GettingStarted({
  checklist,
  primaryGoal,
}: {
  checklist: ResolvedChecklist
  primaryGoal: string | null
}) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [isPending, startTransition] = useTransition()
  const [hidden, setHidden] = useState(false)

  const tasks = prioritiseForGoals(checklist.tasks, primaryGoal)

  const markDone = (taskId: ChecklistTaskId, done: boolean) => {
    if (done) {
      recordRumEvent(AnalyticsEvent.CHECKLIST_TASK_COMPLETED, { taskId, source: "manual" })
    }
    startTransition(async () => {
      await setChecklistTaskDoneAction(taskId, done)
      router.refresh()
    })
  }

  const dismiss = () => {
    recordRumEvent(AnalyticsEvent.CHECKLIST_DISMISSED, {
      completedCount: checklist.completedCount,
      totalCount: checklist.totalCount,
    })
    // Hide optimistically, waiting on the round-trip makes the X feel broken.
    setHidden(true)
    startTransition(async () => {
      await setChecklistDismissedAction(true)
      router.refresh()
    })
  }

  if (hidden) return null

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE }}
    >
      <Card className="overflow-hidden p-0">
        <header className="flex items-start gap-4 border-b border-border/60 bg-muted/25 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {checklist.allComplete ? "You're all set" : "Getting started"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {checklist.allComplete
                ? "You've covered the essentials. Dismiss this whenever you like."
                : "A few steps to get Notes9 working for your research."}
            </p>

            <div className="mt-3 flex items-center gap-3">
              <div
                className="relative h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-border"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={checklist.totalCount}
                aria-valuenow={checklist.completedCount}
                aria-label="Getting started progress"
              >
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  initial={false}
                  animate={{ width: `${checklist.percent}%` }}
                  transition={{ duration: 0.42, ease: EASE }}
                />
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                {checklist.completedCount} of {checklist.totalCount}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss getting started"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <ul className="divide-y divide-border/50">
          <AnimatePresence initial={false}>
            {tasks.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                index={i}
                busy={isPending}
                reduceMotion={reduceMotion}
                onMarkDone={markDone}
              />
            ))}
          </AnimatePresence>

          <TourRow reduceMotion={reduceMotion} index={tasks.length} />
        </ul>
      </Card>
    </motion.div>
  )
}

function TaskRow({
  task,
  index,
  busy,
  reduceMotion,
  onMarkDone,
}: {
  task: ResolvedTask
  index: number
  busy: boolean
  reduceMotion: boolean | null
  onMarkDone: (id: ChecklistTaskId, done: boolean) => void
}) {
  const Icon = TASK_ICONS[task.id]

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: reduceMotion ? 0 : index * 0.05 }}
      className={cn(
        "flex items-center gap-3.5 px-5 py-3.5 transition-colors",
        task.completed ? "bg-transparent" : "hover:bg-muted/25"
      )}
    >
      <StatusMedia icon={Icon} completed={task.completed} reduceMotion={reduceMotion} />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium leading-tight",
            task.completed ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {task.title}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{task.description}</p>
      </div>

      {task.completed ? (
        // Only offer "Undo" where the user set the state by hand, undoing a real
        // signal would be a lie the next page load would immediately overwrite.
        task.manuallyCompleted ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onMarkDone(task.id, false)}
            className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Undo
          </button>
        ) : (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Done</span>
        )
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          {!task.autoOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMarkDone(task.id, true)}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Mark as done
            </button>
          )}
          {task.href && (
            <Link
              href={task.href}
              className="n9-press inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-muted"
            >
              {task.cta}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </motion.li>
  )
}

/**
 * The 12-step product tour, offered rather than forced. It used to fire
 * automatically the moment the welcome wizard closed; here it waits to be asked
 * for and never expires.
 */
function TourRow({ reduceMotion, index }: { reduceMotion: boolean | null; index: number }) {
  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: reduceMotion ? 0 : index * 0.05 }}
      className="flex items-center gap-3.5 bg-muted/20 px-5 py-3.5"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
        <Compass className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight text-foreground">
          Take the 2-minute tour
        </p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          A quick walk through the workspace. Available any time from the ? button.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          recordRumEvent(AnalyticsEvent.TOUR_STARTED_FROM_CHECKLIST)
          requestStartTour()
        }}
        className="n9-press inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-muted"
      >
        Start tour
        <ArrowRight className="size-3.5" aria-hidden />
      </button>
    </motion.li>
  )
}

/** Icon that swaps to a check when the task completes, with a small spring. */
function StatusMedia({
  icon: Icon,
  completed,
  reduceMotion,
}: {
  icon: PhosphorIcon
  completed: boolean
  reduceMotion: boolean | null
}) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
        completed
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground ring-1 ring-border"
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {completed ? (
          <motion.span
            key="check"
            initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduceMotion ? undefined : { scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.8 }}
          >
            <Check className="size-4" aria-hidden weight="bold" />
          </motion.span>
        ) : (
          <motion.span
            key="icon"
            initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduceMotion ? undefined : { scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <Icon className="size-4" aria-hidden />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
