/**
 * app/api/telemetry/events/route.ts
 *
 * Product-telemetry ingest route (Workstream A).
 *
 * Accepts a batch of client-side product events from lib/telemetry/track.ts,
 * resolves user_id server-side from the auth cookie (never trusts client-sent
 * identity), and bulk-inserts into public.usage_events via the service-role
 * client.
 *
 * Design constraints
 * ------------------
 * - user_id is derived from verifyAccessTokenLocally / getCurrentUser — the
 *   same zero-DB-round-trip JWT verification used everywhere else in Notes9.
 *   No per-request DB lookup for user identity (connection-pool discipline).
 * - organization_id: NOT looked up per-request to avoid a DB round-trip. It
 *   is left null in usage_events and is joinable via profiles for analytics
 *   queries. The Nani dashboard can backfill it via a JOIN on user_id.
 * - Fail-soft: a DB insert failure returns 202 anyway. Telemetry must NEVER
 *   break the user's app experience.
 * - Limit guards from lib/limits/guards.ts protect against oversized bodies
 *   and large batches (shadow-mode default, same pattern as other routes).
 * - Unauthenticated callers are allowed through (user_id = null). All events
 *   are low-sensitivity product metrics; requiring auth would lose pre-login
 *   funnel data. The client_session_id provides session-level grouping.
 */

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-service-role'
import { getCurrentUser } from '@/lib/auth/current-user'
import {
  enforceLimits,
  checkBodyBytes,
  type LimitVerdict,
} from '@/lib/limits/guards'
import { TELEMETRY_BATCH_MAX } from '@/lib/limits/config'

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawEvent {
  event_name?: unknown
  feature?: unknown
  surface?: unknown
  properties?: unknown
  duration_ms?: unknown
  occurred_at?: unknown
  client_session_id?: unknown
}

interface InsertRow {
  event_name: string
  feature: string | null
  surface: string | null
  user_id: string | null
  organization_id: string | null
  client_session_id: string | null
  properties: Record<string, unknown>
  duration_ms: number | null
  occurred_at: string
  received_at?: undefined // always default now() from DB
}

// ---------------------------------------------------------------------------
// Batch-size guard (mirrors checkRegisterItems pattern)
// ---------------------------------------------------------------------------

function checkTelemetryBatch(events: unknown[]): LimitVerdict | null {
  if (events.length > TELEMETRY_BATCH_MAX) {
    return {
      code: 'telemetry_batch_too_large',
      httpStatus: 422,
      detail: `events array exceeds the ${TELEMETRY_BATCH_MAX} item ceiling.`,
      observed: events.length,
      limit: TELEMETRY_BATCH_MAX,
      scope: 'events',
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Row validation / clamping
// ---------------------------------------------------------------------------

/**
 * Validate and clamp a single raw event into an insert row.
 * Returns null for invalid events (missing event_name); they are silently
 * dropped so one bad event never 500s the whole batch.
 */
function validateEvent(
  raw: RawEvent,
  userId: string | null
): InsertRow | null {
  // event_name is required and must be a non-empty string.
  if (typeof raw.event_name !== 'string' || raw.event_name.trim().length === 0) {
    return null
  }

  // properties must be a plain object (or absent).
  let properties: Record<string, unknown> = {}
  if (raw.properties !== undefined && raw.properties !== null) {
    if (
      typeof raw.properties !== 'object' ||
      Array.isArray(raw.properties)
    ) {
      // Invalid properties type — drop the field, keep the event.
      properties = {}
    } else {
      properties = raw.properties as Record<string, unknown>
    }
  }

  // duration_ms must be a non-negative integer if present.
  let durationMs: number | null = null
  if (raw.duration_ms !== undefined && raw.duration_ms !== null) {
    const d = Number(raw.duration_ms)
    if (Number.isFinite(d) && d >= 0) {
      durationMs = Math.round(d)
    }
    // Out-of-range or non-numeric: clamp to null (drop field, keep event).
  }

  // occurred_at must be a valid ISO timestamp string.
  let occurredAt: string
  if (typeof raw.occurred_at === 'string' && raw.occurred_at.length > 0) {
    const ts = new Date(raw.occurred_at)
    if (isNaN(ts.getTime())) {
      // Unparseable timestamp — use server time.
      occurredAt = new Date().toISOString()
    } else {
      occurredAt = ts.toISOString()
    }
  } else {
    occurredAt = new Date().toISOString()
  }

  return {
    event_name: raw.event_name.trim().slice(0, 100),
    feature:
      typeof raw.feature === 'string' ? raw.feature.slice(0, 64) : null,
    surface:
      typeof raw.surface === 'string' ? raw.surface.slice(0, 64) : null,
    // user_id is ALWAYS from the server-verified token, never from the client.
    user_id: userId,
    // organization_id is intentionally omitted here (no per-request DB lookup).
    // Nani dashboard joins via profiles(user_id) → organization_id offline.
    organization_id: null,
    client_session_id:
      typeof raw.client_session_id === 'string'
        ? raw.client_session_id.slice(0, 128)
        : null,
    properties,
    duration_ms: durationMs,
    occurred_at: occurredAt,
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Pre-parse: Content-Length ceiling (same guard pattern as other routes).
  const preParseBlocked = enforceLimits('telemetry/events', [checkBodyBytes(request)])
  if (preParseBlocked) return preParseBlocked as unknown as NextResponse

  // 2. Parse body — fail gracefully on invalid JSON.
  let body: { events?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body.events)) {
    return NextResponse.json({ error: 'events must be an array' }, { status: 400 })
  }

  // 3. Post-parse: batch-size ceiling.
  const batchBlocked = enforceLimits('telemetry/events', [
    checkTelemetryBatch(body.events),
  ])
  if (batchBlocked) return batchBlocked as unknown as NextResponse

  // 4. Resolve user_id server-side. No DB round-trip — uses JWT local verify.
  //    Returns null for unauthenticated callers (pre-login funnel events).
  let userId: string | null = null
  try {
    const user = await getCurrentUser()
    userId = user?.id ?? null
  } catch {
    // Fail-open: anonymous event is fine.
    userId = null
  }

  // 5. Validate and clamp each event; silently drop bad rows.
  const rows: InsertRow[] = []
  for (const raw of body.events as RawEvent[]) {
    if (raw === null || typeof raw !== 'object') continue
    const row = validateEvent(raw, userId)
    if (row !== null) rows.push(row)
  }

  // 6. If all rows were invalid, still return 202 (client has nothing to retry).
  if (rows.length === 0) {
    return NextResponse.json({ accepted: 0 }, { status: 202 })
  }

  // 7. Bulk insert via service-role client (bypasses RLS — usage_events has none).
  try {
    const supabase = createServiceRoleClient()
    const { error } = await supabase.from('usage_events').insert(rows)
    if (error) {
      // Log for ops visibility but still return 202 — telemetry failure is
      // non-fatal for the user.
      console.warn(
        JSON.stringify({
          tag: 'telemetry_insert_failed',
          error: error.message,
          batch_size: rows.length,
        })
      )
    }
  } catch (err) {
    // Completely fail-soft: any unexpected error is swallowed.
    console.warn(
      JSON.stringify({
        tag: 'telemetry_insert_exception',
        error: String(err),
        batch_size: rows.length,
      })
    )
  }

  return NextResponse.json({ accepted: rows.length }, { status: 202 })
}
