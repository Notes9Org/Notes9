import "server-only"

import { cache } from "react"
import { after } from "next/server"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase-service-role"
import { seedDemoProject } from "@/lib/seed-demo-project"

type EnsureResult =
  | { ok: true; profile: { id: string; organization_id: string; first_name: string | null; last_name: string | null } }
  | { ok: false; reason: string }

// Warm-instance cache of users we've already confirmed seeded, to avoid a
// post-response DB read on every page load for long-standing users.
const seededThisInstance = new Set<string>()

/**
 * Seed the demo project for a new user exactly once, AFTER the response is sent
 * (so it never delays the first page — e.g. the auto-run literature search).
 * Reads the `demo_seeded_at` guard with the service-role client and tolerates
 * the column being absent (returns quietly), so this is safe to ship before the
 * scripts/099 migration is applied. Idempotent across concurrent requests: the
 * seed's project insert has a UNIQUE (org, name) constraint.
 */
function scheduleDemoSeed(userId: string, organizationId: string): void {
  if (seededThisInstance.has(userId)) return
  try {
    after(async () => {
      try {
        const admin = createServiceRoleClient()
        const prof = await admin
          .from("profiles")
          .select("demo_seeded_at")
          .eq("id", userId)
          .maybeSingle()
        // Column missing / read error → skip silently (migration not applied yet).
        if (prof.error) return
        if (prof.data?.demo_seeded_at) {
          seededThisInstance.add(userId)
          return
        }
        await seedDemoProject(admin, userId, organizationId)
        await admin
          .from("profiles")
          .update({ demo_seeded_at: new Date().toISOString() })
          .eq("id", userId)
        seededThisInstance.add(userId)
      } catch (err) {
        console.error("[ensureUserProfile] demo seed skipped:", err)
      }
    })
  } catch {
    // after() unavailable outside a request scope — skip.
  }
}

/**
 * Idempotently guarantees that an authenticated user has a `profiles` row and
 * a backing `organizations` row. Called once per request from the (app) layout
 * so that downstream client components (sidebar, picker, etc.) can assume the
 * profile exists.
 *
 * Returns the profile (including `organization_id`) on success. On failure,
 * returns a reason string suitable for logging; downstream UI should fall
 * back to an empty-workspace state.
 *
 * Wrapped in React `cache()` — same dedup technique as `requireUser()` in
 * lib/auth/current-user.ts — so every page in a request that needs
 * `organization_id` can call this instead of re-querying `profiles`
 * independently; within one render pass they share the same result as long
 * as they're called with the same (cached) `user` object.
 *
 * RLS note: this runs with the user's session via the request-scoped Supabase
 * client, so insert permission is governed by the same row-level policies that
 * gated the previous client-side path. No service-role key is used.
 */
export const ensureUserProfile = cache(async (user: User): Promise<EnsureResult> => {
  const supabase = await createClient()
  const existing = await supabase
    .from("profiles")
    .select("id, organization_id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle()

  if (existing.data?.organization_id) {
    scheduleDemoSeed(existing.data.id as string, existing.data.organization_id as string)
    return {
      ok: true,
      profile: {
        id: existing.data.id as string,
        organization_id: existing.data.organization_id as string,
        first_name: (existing.data.first_name as string | null) ?? null,
        last_name: (existing.data.last_name as string | null) ?? null,
      },
    }
  }

  if (existing.error && existing.error.code !== "PGRST116") {
    return { ok: false, reason: `profile lookup failed: ${existing.error.message}` }
  }

  // ── Name extraction from auth metadata ──
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const metaStr = (key: string): string => (typeof meta[key] === "string" ? (meta[key] as string) : "")
  const fullNameParts = metaStr("name").split(" ").filter(Boolean)
  let firstName =
    metaStr("first_name") || metaStr("given_name") || fullNameParts[0] || ""
  let lastName =
    metaStr("last_name") || metaStr("family_name") || fullNameParts.slice(1).join(" ") || ""
  if (!firstName && !lastName && metaStr("full_name")) {
    const parts = metaStr("full_name").split(" ").filter(Boolean)
    firstName = parts[0] ?? ""
    lastName = parts.slice(1).join(" ") ?? ""
  }
  if (!firstName) firstName = user.email?.split("@")[0] || "User"

  // ── Find-or-create organization ──
  let orgId: string | null = null
  const existingOrg = await supabase
    .from("organizations")
    .select("id")
    .eq("email", user.email || "")
    .maybeSingle()

  if (existingOrg.data?.id) {
    orgId = existingOrg.data.id as string
  } else {
    const labName = `${firstName} ${lastName}`.trim() || firstName
    const insertOrg = await supabase
      .from("organizations")
      .insert({ name: `${labName}'s Lab`, email: user.email || "" })
      .select("id")
      .single()
    if (insertOrg.error) {
      // Concurrent bootstrap (duplicate email) — refetch.
      if (insertOrg.error.code === "23505" || insertOrg.error.message?.includes("duplicate")) {
        const dup = await supabase
          .from("organizations")
          .select("id")
          .eq("email", user.email || "")
          .maybeSingle()
        orgId = (dup.data?.id as string | undefined) ?? null
      }
      if (!orgId) return { ok: false, reason: `org create failed: ${insertOrg.error.message}` }
    } else {
      orgId = insertOrg.data?.id as string
    }
  }

  if (!orgId) return { ok: false, reason: "could not resolve organization_id" }

  // ── Create profile ──
  const insertProfile = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email || "",
    first_name: firstName || "User",
    last_name: lastName || "",
    role: metaStr("role") || "researcher",
    organization_id: orgId,
  })

  if (insertProfile.error) {
    // Race: profile inserted by another tab between lookup and insert.
    const isDup =
      insertProfile.error.code === "23505" ||
      insertProfile.error.message?.includes("duplicate")
    if (!isDup) {
      return { ok: false, reason: `profile create failed: ${insertProfile.error.message}` }
    }
  }

  const retry = await supabase
    .from("profiles")
    .select("id, organization_id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle()

  if (!retry.data?.organization_id) {
    return { ok: false, reason: "profile still missing after create" }
  }

  scheduleDemoSeed(retry.data.id as string, retry.data.organization_id as string)
  return {
    ok: true,
    profile: {
      id: retry.data.id as string,
      organization_id: retry.data.organization_id as string,
      first_name: (retry.data.first_name as string | null) ?? null,
      last_name: (retry.data.last_name as string | null) ?? null,
    },
  }
})
