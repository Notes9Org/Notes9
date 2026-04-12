/** Stored in protocol_document_templates.extracted (jsonb) */
export type ProtocolTemplateLogo = {
  storage_path: string
  /** 0-based index for stable image URLs */
  index: number
  alt?: string
}

export type ProtocolTemplateSectionHeading = {
  slug: string
  title: string
  order: number
}

export type ProtocolTemplateExtracted = {
  sectionHeadings: ProtocolTemplateSectionHeading[]
  logos: ProtocolTemplateLogo[]
  warnings?: string[]
  /** Optional HTML from DOCX for debugging / preview (not inserted into protocol body) */
  _previewHtmlLength?: number
}

export const PROTOCOL_TEMPLATE_MAX_FILE_BYTES = 15 * 1024 * 1024

export const PROTOCOL_TEMPLATE_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

/** @see getProtocolTemplatesStorageBucket in lib/protocol-templates-storage.ts — uses shared `user` bucket */
