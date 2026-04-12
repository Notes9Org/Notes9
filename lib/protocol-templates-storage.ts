import type { SupabaseClient } from "@supabase/supabase-js"

import { LITERATURE_STORAGE_BUCKET } from "@/types/literature-pdf"

/**
 * Same Supabase Storage bucket as literature PDFs (`user`).
 * Object keys: `{organization_id}/protocol/{template_id}/...` — mirrors the literature pattern
 * `{user_id}/literature/{record_id}/...` but uses org as the first segment so all org members can read/write
 * per policies in scripts/041_protocol_templates_user_bucket.sql.
 */
export function getProtocolTemplatesStorageBucket(): string {
  return LITERATURE_STORAGE_BUCKET
}

export function createProtocolTemplateBasePath(organizationId: string, templateId: string): string {
  return `${organizationId}/protocol/${templateId}`
}

export function createProtocolTemplateSourceKey(
  organizationId: string,
  templateId: string,
  ext: "pdf" | "docx"
): string {
  return `${createProtocolTemplateBasePath(organizationId, templateId)}/source.${ext}`
}

export function createProtocolTemplateAssetKey(
  organizationId: string,
  templateId: string,
  imageIndex: number,
  ext: string
): string {
  const lower = ext.toLowerCase()
  const normalized = lower === "jpeg" ? "jpg" : lower === "jpg" || lower === "png" || lower === "gif" ? lower : "png"
  return `${createProtocolTemplateBasePath(organizationId, templateId)}/assets/img-${imageIndex}.${normalized}`
}

/**
 * New layout uses bucket `user` with a `protocol` path segment.
 * Legacy uploads used bucket `protocol-templates` with `{org}/{template}/...` (no `protocol` segment).
 */
/** True when `storagePath` matches the reserved key for this org + template + extension. */
export function isReservedProtocolTemplateSourcePath(
  organizationId: string,
  templateId: string,
  storagePath: string
): boolean {
  return (
    storagePath === createProtocolTemplateSourceKey(organizationId, templateId, "pdf") ||
    storagePath === createProtocolTemplateSourceKey(organizationId, templateId, "docx")
  )
}

export function resolveProtocolTemplateStorageBucket(storagePath: string): "user" | "protocol-templates" {
  const parts = storagePath.split("/").filter(Boolean)
  if (parts.length >= 2 && parts[1] === "protocol") {
    return "user"
  }
  return "protocol-templates"
}

export async function removeProtocolTemplateStorageObjects(
  supabase: SupabaseClient,
  paths: string[]
): Promise<void> {
  const byBucket = new Map<string, string[]>()
  for (const p of paths) {
    if (!p) continue
    const bucket = resolveProtocolTemplateStorageBucket(p)
    const list = byBucket.get(bucket) ?? []
    list.push(p)
    byBucket.set(bucket, list)
  }
  for (const [bucket, keys] of byBucket) {
    if (keys.length === 0) continue
    const { error } = await supabase.storage.from(bucket).remove(keys)
    if (error) {
      console.warn(`[protocol-templates-storage] remove from ${bucket}`, error.message)
    }
  }
}

