import type { SupabaseClient } from "@supabase/supabase-js"
import { extractProtocolTemplateFromDocx } from "./protocol-template-extract-docx"
import { extractProtocolTemplateFromPdf } from "./protocol-template-extract-pdf"
import type { ProtocolTemplateExtracted } from "./protocol-template-types"
import { PROTOCOL_TEMPLATE_ALLOWED_MIME } from "./protocol-template-types"

export async function extractProtocolTemplateFromFile(params: {
  mimeType: string
  arrayBuffer: ArrayBuffer
  supabase: SupabaseClient
  organizationId: string
  templateId: string
}): Promise<ProtocolTemplateExtracted> {
  const { mimeType, arrayBuffer, supabase, organizationId, templateId } = params
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractProtocolTemplateFromDocx({
      arrayBuffer,
      supabase,
      organizationId,
      templateId,
    })
  }
  if (mimeType === "application/pdf") {
    return extractProtocolTemplateFromPdf(arrayBuffer)
  }
  throw new Error(`Unsupported MIME type: ${mimeType}`)
}

export function isAllowedProtocolTemplateMime(mime: string): boolean {
  return PROTOCOL_TEMPLATE_ALLOWED_MIME.has(mime)
}
