import type { SupabaseClient } from "@supabase/supabase-js"

const DEFAULT_EXPIRES = 60 * 60 // 1 hour
export const USER_STORAGE_BUCKET = "user"

/**
 * Create a short-lived signed URL for a private storage object. Prefer this
 * over `getPublicUrl()` for anything other than truly public marketing assets.
 *
 * If the caller hands us an existing URL (legacy DB rows store the full public
 * URL), we extract the storage key and re-sign it; if extraction fails we
 * return the input unchanged so behavior degrades gracefully rather than
 * blowing up the page.
 */
export async function createBucketSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  pathOrUrl: string,
  expiresIn: number = DEFAULT_EXPIRES,
): Promise<string> {
  if (!pathOrUrl) return ""
  const path = extractStorageKey(bucket, pathOrUrl)
  if (!path) return pathOrUrl
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) return pathOrUrl
  return data.signedUrl
}

/**
 * Extract the storage key (path inside the bucket) from either a raw key or a
 * full Supabase storage URL (public or signed).
 */
export function extractStorageKey(bucket: string, pathOrUrl: string): string | null {
  if (!pathOrUrl) return null
  if (!pathOrUrl.includes("://")) return pathOrUrl
  // Match `…/object/(public|sign|authenticated)/<bucket>/<key>`
  const m = pathOrUrl.match(
    new RegExp(`/object/(?:public|sign|authenticated)/${bucket}/(.+?)(?:\\?|$)`),
  )
  return m?.[1] ?? null
}
