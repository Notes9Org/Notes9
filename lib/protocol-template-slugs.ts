/**
 * Map free-text section titles to canonical slugs (protocol-relevant only).
 */
const RULES: { slug: string; test: RegExp }[] = [
  { slug: "aims", test: /\b(aims?|objectives?|purpose|scope)\b/i },
  { slug: "materials_required", test: /\b(materials?\s*(required|and\s*reagents?)?|reagents?|consumables?)\b/i },
  { slug: "methods", test: /\b(methods?|methodology|experimental\s*design)\b/i },
  { slug: "procedure", test: /\b(procedure|steps?|protocol\s*steps?|workflow|instructions?)\b/i },
  { slug: "safety", test: /\b(safety|hazards?|ppe|precautions?)\b/i },
  { slug: "equipment", test: /\b(equipment|apparatus|instruments?)\b/i },
  { slug: "references", test: /\b(references?|bibliography|citations?)\b/i },
  {
    slug: "approval_signatories",
    test:
      /\b(author(ed)?|review(ed)?|approv(ed)?|signator|signature|prepared\s*by|verified\s*by|docusign)\b/i,
  },
  { slug: "introduction", test: /\b(introduction|background)\b/i },
  { slug: "results", test: /\b(results?|expected\s*outcomes?)\b/i },
]

export function inferSectionSlug(rawTitle: string): string {
  const t = rawTitle.trim()
  if (!t) return "other"
  for (const { slug, test } of RULES) {
    if (test.test(t)) return slug
  }
  return "other"
}

/** Deduplicate by normalized title, cap length */
export function dedupeHeadings(
  titles: { title: string }[],
  max = 24
): { slug: string; title: string; order: number }[] {
  const seen = new Set<string>()
  const out: { slug: string; title: string; order: number }[] = []
  for (const row of titles) {
    const title = row.title.trim()
    if (!title) continue
    const slug = inferSectionSlug(title)
    const key = title.toLowerCase().slice(0, 120)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ slug, title, order: out.length })
    if (out.length >= max) break
  }
  return out.map((r, i) => ({ ...r, order: i }))
}
