/** Recently opened projects (client-only), newest first. */
export const RECENT_PROJECTS_STORAGE_KEY = "n9_recent_projects"

const MAX_RECENT = 8

export type RecentProjectEntry = {
  id: string
  openedAt: number
}

export function recordRecentProject(projectId: string) {
  if (typeof window === "undefined" || !projectId) return
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY)
    const list: RecentProjectEntry[] = raw ? JSON.parse(raw) : []
    const filtered = list.filter((e) => e.id !== projectId)
    filtered.unshift({ id: projectId, openedAt: Date.now() })
    localStorage.setItem(
      RECENT_PROJECTS_STORAGE_KEY,
      JSON.stringify(filtered.slice(0, MAX_RECENT)),
    )
    // Keep legacy single-id key in sync for scope fallbacks
    localStorage.setItem("n9_last_project_id", projectId)
  } catch {
    /* ignore quota / private mode */
  }
}

export function getRecentProjectEntries(): RecentProjectEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY)
    const list: RecentProjectEntry[] = raw ? JSON.parse(raw) : []
    if (Array.isArray(list) && list.length > 0) return list
    const legacy = localStorage.getItem("n9_last_project_id")
    if (legacy) return [{ id: legacy, openedAt: Date.now() }]
    return []
  } catch {
    return []
  }
}

export function getRecentProjectIds(): string[] {
  return getRecentProjectEntries().map((e) => e.id)
}

/** Recently opened projects first (newest open first), then the rest in `items` order. */
export function sortByRecentProjectOrder<T extends { id: string }>(items: T[]): T[] {
  if (items.length <= 1) return items

  const recentIds = getRecentProjectEntries().map((e) => e.id)
  const rank = new Map(recentIds.map((id, index) => [id, index]))
  const recent: T[] = []
  const seen = new Set<string>()

  for (const id of recentIds) {
    const item = items.find((p) => p.id === id)
    if (item) {
      recent.push(item)
      seen.add(id)
    }
  }

  const rest = items.filter((p) => !seen.has(p.id))
  return [...recent, ...rest]
}
