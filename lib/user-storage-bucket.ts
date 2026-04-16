/**
 * Single Supabase Storage bucket for user/org-owned objects.
 *
 * Path taxonomy (object key = name in storage.objects):
 *
 * 1. Personal (RLS: first segment = auth.uid())
 *    - `{userId}/literature/{literatureId}/...` — literature PDFs (unchanged)
 *    - `{userId}/temp/...` — staging uploads
 *    - `{userId}/profile/avatar.{ext}` — profile photo
 *    - `{userId}/lab-notes/public/{noteId}.json` — published lab note JSON (writes; reads via API or policy)
 *
 * 2. Org-scoped (RLS: first segment = profiles.organization_id, second = domain)
 *    - `{orgId}/protocol/{templateId}/...` — protocol document templates
 *    - `{orgId}/experiment/{experimentId}/{experimentDataId}/{fileName}` — experiment data files
 *
 * @see scripts/036_literature_catalog_placement.sql
 * @see scripts/041_protocol_templates_user_bucket.sql
 * @see scripts/045_user_bucket_experiment_and_profile_rls.sql
 */

import { LITERATURE_STORAGE_BUCKET } from "@/types/literature-pdf"

/** Canonical bucket id for all app-managed files (matches literature bucket). */
export const USER_STORAGE_BUCKET = LITERATURE_STORAGE_BUCKET

/** Public URL segment after which the object path begins (Supabase public object URL shape). */
export const USER_STORAGE_PUBLIC_URL_MARKER = "/object/public/user/"

export function sanitizeExperimentStorageFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 240)
}

/**
 * Org-scoped experiment attachment key (matches storage RLS in 045).
 * Caller should use a client-generated `experimentDataId` before insert when needed.
 */
export function createExperimentDataStoragePath(
  organizationId: string,
  experimentId: string,
  experimentDataId: string,
  fileName: string
): string {
  const safe = sanitizeExperimentStorageFileName(fileName)
  return `${organizationId}/experiment/${experimentId}/${experimentDataId}/${safe}`
}

export function createProfileAvatarStoragePath(userId: string, ext: string): string {
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
  return `${userId}/profile/avatar.${e}`
}

export function createPublishedLabNoteStoragePath(userId: string, noteId: string): string {
  return `${userId}/lab-notes/public/${noteId}.json`
}

/** Fallback import path when no experiment id yet (RLS: first segment = uploader). */
export function createUserDataTransferStagingPath(userId: string, dataFileId: string, fileName: string): string {
  return `${userId}/data-transfer/${dataFileId}/${sanitizeExperimentStorageFileName(fileName)}`
}

/**
 * Extract object path within the `user` bucket from a Supabase public object URL.
 */
export function extractUserBucketObjectPathFromPublicUrl(url: string): string | null {
  if (!url) return null
  const idx = url.indexOf(USER_STORAGE_PUBLIC_URL_MARKER)
  if (idx < 0) return null
  const rest = url.slice(idx + USER_STORAGE_PUBLIC_URL_MARKER.length)
  const path = decodeURIComponent(rest.split("?")[0] ?? "")
  return path.length > 0 ? path : null
}

/** Legacy experiment-files bucket URL → object path (for migration / dual-parse). */
export function extractLegacyExperimentFilesPathFromPublicUrl(url: string): string | null {
  if (!url) return null
  const marker = "/experiment-files/"
  const i = url.indexOf(marker)
  if (i < 0) return null
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0] ?? "")
}

/**
 * Resolve storage object path for an experiment_data row: prefer metadata.storage_path, else parse file_url.
 */
export function resolveExperimentDataStoragePath(row: {
  file_url?: string | null
  metadata?: { storage_path?: string } | null
}): string | null {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata.storage_path : undefined
  if (typeof meta === "string" && meta.length > 0) return meta
  const url = typeof row.file_url === "string" ? row.file_url : ""
  return (
    extractUserBucketObjectPathFromPublicUrl(url) ?? extractLegacyExperimentFilesPathFromPublicUrl(url)
  )
}
