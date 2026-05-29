import type { AwsRum } from 'aws-rum-web'

// ---------------------------------------------------------------------------
// Constants — CloudWatch RUM App Monitor (public resource policy, unsigned)
// Production reads from env. Dev falls back to historical values so local dev
// continues to work without env wiring.
// ---------------------------------------------------------------------------

const DEV_FALLBACK_APP_ID = 'dcab8f83-af35-4768-873c-3e0918faccdb'
const DEV_FALLBACK_IDENTITY_POOL_ID = 'us-east-1:fdab262d-f18d-4d45-933b-756a1a2f7093'

function readPublicEnv(key: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined
  const v = process.env[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

const IS_PROD = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production')

export const RUM_APP_ID =
  readPublicEnv('NEXT_PUBLIC_CW_RUM_APP_ID') ??
  (IS_PROD ? '' : DEV_FALLBACK_APP_ID)
export const RUM_IDENTITY_POOL_ID =
  readPublicEnv('NEXT_PUBLIC_CW_RUM_IDENTITY_POOL_ID') ??
  (IS_PROD ? '' : DEV_FALLBACK_IDENTITY_POOL_ID)
export const RUM_ENDPOINT = 'https://dataplane.rum.us-east-1.amazonaws.com'
export const RUM_REGION = 'us-east-1'
export const RUM_APP_VERSION = '1.0.0'

export function isRumConfigured(): boolean {
  return RUM_APP_ID.length > 0 && RUM_IDENTITY_POOL_ID.length > 0
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RumConfig {
  sessionSampleRate: number
  identityPoolId: string
  endpoint: string
  telemetries: string[]
  allowCookies: boolean
  enableXRay: boolean
  signing: boolean
  sessionEventLimit?: number
}

// ---------------------------------------------------------------------------
// Module-level singleton — set by RumProvider on init
// ---------------------------------------------------------------------------

let rumClient: AwsRum | null = null

export function setRumClient(client: AwsRum | null): void {
  rumClient = client
}

export function getRumClient(): AwsRum | null {
  return rumClient
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Build the RUM configuration object from the hardcoded constants.
 */
export function buildRumConfig(): RumConfig {
  return {
    sessionSampleRate: 1,
    identityPoolId: RUM_IDENTITY_POOL_ID,
    endpoint: RUM_ENDPOINT,
    telemetries: ['performance', 'errors', 'http'],
    allowCookies: true,
    enableXRay: false,
    signing: false,
    sessionEventLimit: 0,
  }
}

/**
 * Extract session metadata from a user object.
 * Returns only the opaque user UUID — no PII (email, name, etc.).
 */
export function extractSessionMetadata(user: { id: string }): {
  userId: string
} {
  return { userId: user.id }
}

// ---------------------------------------------------------------------------
// Standalone event recorder
// ---------------------------------------------------------------------------

/**
 * Record a custom RUM event. No-ops silently when the client is null.
 * Wraps `client.recordEvent()` in try-catch so callers are never affected.
 */
export function recordRumEvent(type: string, data: Record<string, unknown>): void {
  if (!rumClient) return

  try {
    rumClient.recordEvent(type, data)
  } catch (err) {
    console.warn('[RUM] Failed to record event:', err)
  }
}
