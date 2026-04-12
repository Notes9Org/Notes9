import type { SupabaseClient } from "@supabase/supabase-js"
import mammoth from "mammoth"
import { dedupeHeadings } from "./protocol-template-slugs"
import type { ProtocolTemplateExtracted, ProtocolTemplateLogo } from "./protocol-template-types"
import {
  createProtocolTemplateAssetKey,
  getProtocolTemplatesStorageBucket,
} from "./protocol-templates-storage"

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function extractHeadingTextsFromHtml(html: string): string[] {
  const titles: string[] = []
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const inner = stripHtmlTags(m[2] ?? "")
    if (inner.length > 0 && inner.length < 500) titles.push(inner)
  }
  return titles
}

/** Skip first heading if it looks like a lone document title (short single-line cover). */
function filterDocumentTitle(headings: string[]): string[] {
  if (headings.length <= 1) return headings
  const first = headings[0]!
  if (first.length < 120 && headings.length > 1) {
    return headings.slice(1)
  }
  return headings
}

export async function extractProtocolTemplateFromDocx(params: {
  arrayBuffer: ArrayBuffer
  supabase: SupabaseClient
  organizationId: string
  templateId: string
}): Promise<ProtocolTemplateExtracted> {
  const { arrayBuffer, supabase, organizationId, templateId } = params
  const bucket = getProtocolTemplatesStorageBucket()
  const logos: ProtocolTemplateLogo[] = []
  let imgSeq = 0

  const transparentGif =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const buffer = await image.readAsArrayBuffer()
        const ext =
          image.contentType?.includes("png") ? "png" : image.contentType?.includes("jpeg") ? "jpg" : "png"
        const idx = imgSeq
        imgSeq += 1
        const path = createProtocolTemplateAssetKey(organizationId, templateId, idx, ext)
        const body = new Uint8Array(buffer)
        const { error } = await supabase.storage
          .from(bucket)
          .upload(path, body, {
            contentType: image.contentType ?? "image/png",
            upsert: true,
          })
        if (error) {
          console.warn("[protocol-template] image upload failed", error.message)
          return { src: transparentGif }
        }
        logos.push({ storage_path: path, index: idx, alt: "Logo" })
        return { src: transparentGif }
      }),
    }
  )

  const html = result.value
  let titles = extractHeadingTextsFromHtml(html)
  titles = filterDocumentTitle(titles)

  if (titles.length === 0) {
    const fallback = html
      .split(/<\/p>/i)
      .map((chunk) => stripHtmlTags(chunk))
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && t.length < 200)
    for (const line of fallback.slice(0, 20)) {
      if (/^(aims?|methods?|materials?|procedure|introduction|references?)\b/i.test(line)) {
        titles.push(line)
      }
    }
  }

  const sectionHeadings = dedupeHeadings(titles.map((title) => ({ title })))

  const warnings: string[] = []
  if (result.messages?.length) {
    for (const msg of result.messages.slice(0, 5)) {
      if (msg.type === "warning") warnings.push(msg.message)
    }
  }

  return {
    sectionHeadings,
    logos,
    warnings: warnings.length ? warnings : undefined,
    _previewHtmlLength: html.length,
  }
}
