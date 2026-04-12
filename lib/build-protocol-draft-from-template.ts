import type { ProtocolTemplateExtracted } from "./protocol-template-types"

function assetUrl(templateId: string, imageIndex: number): string {
  return `/api/protocol-templates/asset?templateId=${encodeURIComponent(templateId)}&i=${imageIndex}`
}

/**
 * TipTap-friendly HTML: logos + section headings with placeholders (no full procedure import).
 */
export function buildProtocolDraftHtmlFromExtracted(params: {
  templateId: string
  extracted: ProtocolTemplateExtracted
}): string {
  const { templateId, extracted } = params
  const parts: string[] = []

  if (extracted.logos.length > 0) {
    parts.push('<div class="protocol-template-logos flex flex-wrap items-center gap-4 mb-4">')
    for (const logo of extracted.logos) {
      const alt = logo.alt ?? "Logo"
      parts.push(
        `<figure class="inline-block"><img src="${assetUrl(templateId, logo.index)}" alt="${escapeAttr(alt)}" class="max-h-16 w-auto object-contain" /></figure>`
      )
    }
    parts.push("</div>")
  }

  const useSections =
    extracted.sectionHeadings.length > 0
      ? extracted.sectionHeadings
      : [{ slug: "procedure", title: "Procedure", order: 0 }]

  for (const sec of useSections) {
    parts.push(`<h2>${escapeHtml(sec.title)}</h2>`)
    if (sec.slug === "approval_signatories") {
      parts.push(`
<table class="min-w-[280px] border-collapse text-sm">
<tbody>
<tr><td class="border border-border px-2 py-1 font-medium">Prepared by</td><td class="border border-border px-2 py-1">&nbsp;</td><td class="border border-border px-2 py-1">Date</td><td class="border border-border px-2 py-1">&nbsp;</td></tr>
<tr><td class="border border-border px-2 py-1 font-medium">Reviewed by</td><td class="border border-border px-2 py-1">&nbsp;</td><td class="border border-border px-2 py-1">Date</td><td class="border border-border px-2 py-1">&nbsp;</td></tr>
<tr><td class="border border-border px-2 py-1 font-medium">Approved by</td><td class="border border-border px-2 py-1">&nbsp;</td><td class="border border-border px-2 py-1">Date</td><td class="border border-border px-2 py-1">&nbsp;</td></tr>
</tbody>
</table>
<p class="text-xs text-muted-foreground mt-2">Add electronic signatures (e.g. DocuSign) as required by your organization.</p>`)
    } else {
      parts.push(
        `<p><em>Add ${escapeHtml(sec.title.toLowerCase())} content here.</em></p>`
      )
    }
  }

  if (extracted.warnings?.length) {
    parts.push(
      `<blockquote><p class="text-xs text-muted-foreground"><strong>Template import notes:</strong> ${escapeHtml(extracted.warnings.join(" "))}</p></blockquote>`
    )
  }

  return parts.join("\n")
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;")
}
