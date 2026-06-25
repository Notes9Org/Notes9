export type CatalystSectionScope =
  | "lab"
  | "project"
  | "literature"
  | "experiments"
  | "lab-notes"
  | "protocols"
  | "samples"
  | "writing"
  | "reports"

export type CatalystLaunchAttachment = {
  url: string
  name: string
  contentType: string
  size?: number
}

export type CatalystLaunchDetail = {
  query?: string
  scope?: CatalystSectionScope
  projectId?: string
  attachments?: CatalystLaunchAttachment[]
  webSearch?: boolean
  /** When true, the sidebar submits the query immediately instead of only
   *  pre-filling its composer — i.e. the user already clicked Send. */
  autoSend?: boolean
  /** Continue an existing conversation — used when minimizing the full Catalyst
   *  page back into the docked sidebar so the session carries over. */
  sessionId?: string
  /** Force docking into the side panel even when currently on `/catalyst`
   *  (otherwise opening from `/catalyst` just re-seeds the full page). */
  dock?: boolean
}

const ORIGIN_KEY = "notes9:catalyst-origin"
let catalystOriginPath: string | null = null

/** Remember the page the user maximized Catalyst from, so minimizing returns
 *  there with the docked sidebar. */
export function setCatalystOrigin(path: string) {
  catalystOriginPath = path
  try {
    sessionStorage.setItem(ORIGIN_KEY, path)
  } catch {
    /* ignore */
  }
}

export function getCatalystOrigin(): string | null {
  if (catalystOriginPath) return catalystOriginPath
  try {
    return sessionStorage.getItem(ORIGIN_KEY)
  } catch {
    return null
  }
}

export const CATALYST_OPEN_EVENT = "notes9:open-catalyst"

/** Open Catalyst in-place (side panel) or on `/catalyst` when already on that route. */
export function openCatalystPanel(detail: CatalystLaunchDetail = {}) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<CatalystLaunchDetail>(CATALYST_OPEN_EVENT, { detail }),
  )
}

export type CatalystAttachDetail = { attachments: CatalystLaunchAttachment[] }

export const CATALYST_ATTACH_EVENT = "notes9:catalyst-attach"

/**
 * Append attachments to the already-open Catalyst composer. Used to drop a
 * paper into the chat bar *after* a launch flourish lands, so the attachment
 * appears as the animation completes rather than the instant the panel opens.
 */
export function attachToCatalyst(attachments: CatalystLaunchAttachment[]) {
  if (typeof window === "undefined" || attachments.length === 0) return
  window.dispatchEvent(
    new CustomEvent<CatalystAttachDetail>(CATALYST_ATTACH_EVENT, { detail: { attachments } }),
  )
}
