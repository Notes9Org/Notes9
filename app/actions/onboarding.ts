"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase-service-role"
import { getCurrentUser } from "@/lib/auth/current-user"
import { seedStarterContentOnce } from "@/lib/onboarding/seed-starter-content"
import { parseChecklistState, type ChecklistTaskId } from "@/lib/onboarding/checklist"

export type WelcomeAnswers = {
  jobTitle: string
  researchField: string
  primaryGoal: string
}

/**
 * Completes the welcome wizard: persists the answers, then seeds field-matched
 * starter content.
 *
 * These two steps are deliberately in one server action rather than split
 * between a client write and a background job. The demo pack is chosen from
 * `research_field`, so seeding must observe the answers, doing the write and
 * the seed in sequence here removes the race that previously made personalised
 * starter content impossible.
 *
 * Safe to call twice (the seed is guarded by `profiles.demo_seeded_at`), and
 * never throws at the caller: a failed seed must not trap a new user inside the
 * wizard, so it is logged and swallowed. The `ensureUserProfile` safety net will
 * retry on a later page load.
 */
export async function completeWelcomeAction(
  answers: WelcomeAnswers
): Promise<{ seeded: boolean }> {
  const user = await getCurrentUser()
  if (!user) throw new Error("User not authenticated")

  const supabase = await createClient()

  const updates: Record<string, string> = {
    notes9_welcome_seen_at: new Date().toISOString(),
  }
  if (answers.jobTitle) updates.job_title = answers.jobTitle
  if (answers.researchField) updates.research_field = answers.researchField
  if (answers.primaryGoal) updates.primary_goal = answers.primaryGoal

  const { error: updateError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)

  if (updateError) {
    console.error("[onboarding] failed to persist welcome answers", {
      userId: user.id,
      error: updateError.message,
    })
  }

  let seeded = false
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profile?.organization_id) {
      const outcome = await seedStarterContentOnce(
        createServiceRoleClient(),
        user.id,
        profile.organization_id as string
      )
      seeded = outcome === "seeded"
    }
  } catch (err) {
    // Never block the user on seeding, ensureUserProfile retries later.
    console.error("[onboarding] starter seed failed", err)
  }

  revalidatePath("/dashboard")
  return { seeded }
}

/** Read-modify-write helper for the `onboarding_checklist` jsonb column. */
async function mutateChecklist(
  mutate: (state: ReturnType<typeof parseChecklistState>) => ReturnType<typeof parseChecklistState>
): Promise<{ success: boolean }> {
  const user = await getCurrentUser()
  if (!user) throw new Error("User not authenticated")

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_checklist")
    .eq("id", user.id)
    .maybeSingle()

  // Column missing → scripts/104 not applied yet. Skip rather than throw.
  if (error) return { success: false }

  const next = mutate(parseChecklistState(data?.onboarding_checklist))
  const { error: writeError } = await supabase
    .from("profiles")
    .update({ onboarding_checklist: next })
    .eq("id", user.id)

  if (writeError) {
    console.error("[onboarding] checklist write failed", {
      userId: user.id,
      error: writeError.message,
    })
    return { success: false }
  }

  revalidatePath("/dashboard")
  return { success: true }
}

/** "Mark as done" / undo on a single checklist row. */
export async function setChecklistTaskDoneAction(
  taskId: ChecklistTaskId,
  done: boolean
): Promise<{ success: boolean }> {
  return mutateChecklist((state) => ({
    ...state,
    done: done
      ? Array.from(new Set([...state.done, taskId]))
      : state.done.filter((id) => id !== taskId),
  }))
}

/** Collapse the dashboard panel to the sidebar pill, or restore it from Settings. */
export async function setChecklistDismissedAction(
  dismissed: boolean
): Promise<{ success: boolean }> {
  return mutateChecklist((state) => ({ ...state, dismissed }))
}
