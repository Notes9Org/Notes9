import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MAX_EXCERPT_LENGTH = 120

/** Strip HTML tags and normalize whitespace for plain-text display. */
function stripHtmlAndNormalize(html: string): string {
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped
}

/** Truncate at word boundary and append ellipsis. */
function truncateExcerpt(text: string, maxLen: number): string {
  const t = text.trim()
  if (t.length <= maxLen) return t
  const slice = t.slice(0, maxLen)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > maxLen * 0.5 ? lastSpace : maxLen
  return slice.slice(0, cut).trim() + '...'
}

/** Format AI citation excerpt into a clean reference line (e.g. "**Project update** – planning, medium priority (no dates)"). */
export function formatCitationDisplay(citation: {
  excerpt?: string
  name?: string
  title?: string
  status?: string
  priority?: string
  start_date?: string | null
  end_date?: string | null
}): string {
  const raw = citation.excerpt ?? ''

  // Use structured fields if the API provides them (name or title for lab notes, etc.)
  const displayName = citation.name ?? citation.title ?? ''
  if (displayName !== '') {
    const status = citation.status ?? ''
    const priority = citation.priority ?? ''
    const parts = [status, priority].filter(Boolean)
    const meta = parts.length ? parts.join(', ') : ''
    const startDate = citation.start_date
    const endDate = citation.end_date
    const noDates =
      startDate == null ||
      endDate == null ||
      String(startDate).toLowerCase() === 'none' ||
      String(endDate).toLowerCase() === 'none'
    const dateNote = noDates ? ' (no dates)' : ` (${startDate} – ${endDate})`
    const suffix = meta ? ` – ${meta}${dateNote}` : dateNote
    return `**${displayName}**${suffix}`
  }

  // Parse sql-style excerpt: "sql: id=..., name=Project update, description=..., status=planning, priority=medium, start_date=None, end_date=None"
  const nameMatch = raw.match(/name=([^,]+)/)
  const statusMatch = raw.match(/status=([^,]+)/)
  const priorityMatch = raw.match(/priority=([^,]+)/)
  const startDateMatch = raw.match(/start_date=(\S+)/)
  const endDateMatch = raw.match(/end_date=(\S+)/)

  if (nameMatch) {
    const name = nameMatch[1].trim()
    const status = statusMatch?.[1]?.trim() ?? ''
    const priority = priorityMatch?.[1]?.trim() ?? ''
    const parts = [status, priority].filter(Boolean)
    const meta = parts.length ? parts.join(', ') : ''
    const startVal = startDateMatch?.[1]?.trim() ?? ''
    const endVal = endDateMatch?.[1]?.trim() ?? ''
    const noDates =
      !startVal ||
      !endVal ||
      startVal.toLowerCase() === 'none' ||
      endVal.toLowerCase() === 'none'
    const dateNote = noDates ? ' (no dates)' : ` (${startVal} – ${endVal})`
    const suffix = meta ? ` – ${meta}${dateNote}` : dateNote
    return `**${name}**${suffix}`
  }

  // Fallback: strip HTML and truncate excerpt (e.g. lab note content)
  const plain = stripHtmlAndNormalize(raw)
  return plain ? truncateExcerpt(plain, MAX_EXCERPT_LENGTH) : 'Lab note'
}
