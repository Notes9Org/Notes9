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
  /** Stable durable storage path (for re-signing on reload). */
  storagePath?: string
  /** Row id in `chat_attachments` (cross-turn re-read). */
  chatAttachmentId?: string
  /** Stable paper identity (id / DOI / title) for deduping "Ask Catalyst" tags;
   *  the signed `url` rotates per fetch, so dedupe must key on this instead. */
  paperKey?: string
}

export type CatalystLaunchLiteratureSource = {
  title: string
  abstract?: string
  doi?: string
  pmid?: string
  journal?: string
  year?: number
  url?: string
  authors?: string[]
}

export type CatalystLaunchDetail = {
  query?: string
  scope?: CatalystSectionScope
  projectId?: string
  attachments?: CatalystLaunchAttachment[]
  /** Transient papers (title + abstract + ids) to ground + inline-cite without a
   *  file attachment — e.g. a CLOSED-access paper's abstract on "Ask Catalyst".
   *  The sidebar forwards these as agent `literature_sources` on the next send. */
  literatureSources?: CatalystLaunchLiteratureSource[]
  webSearch?: boolean
  /** When true, the sidebar submits the query immediately instead of only
   *  pre-filling its composer — i.e. the user already clicked Send. */
  autoSend?: boolean
  /** Continue an existing conversation — used when minimizing the full Catalyst
   *  page back into the docked sidebar so the session carries over. */
  sessionId?: string
  /** Signals that a paper attachment is being fetched and will arrive shortly via
   *  a follow-up {@link CATALYST_ATTACH_EVENT}. The sidebar uses this to gate Send
   *  so the user can't fire the first message before the paper lands. */
  expectAttachment?: boolean
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

export type CatalystAttachDetail = {
  attachments: CatalystLaunchAttachment[]
  /** Durable citable sources to fold into the next (and later) sends alongside the
   *  attachment — e.g. the attached paper's own metadata + abstract, so follow-ups
   *  keep grounding on it after the transient file chip is cleared. */
  literatureSources?: CatalystLaunchLiteratureSource[]
}

export const CATALYST_ATTACH_EVENT = "notes9:catalyst-attach"

/**
 * Append attachments to the already-open Catalyst composer. Dispatched
 * immediately after the paper is fetched (the fly flourish is purely cosmetic),
 * so the attachment lands in composer state right away rather than waiting for
 * the ~1.4s animation — which would let the user Send before the paper attaches.
 * Optionally carries durable `literatureSources` so the paper stays citable on
 * follow-up turns after the file chip is cleared.
 */
export function attachToCatalyst(
  attachments: CatalystLaunchAttachment[],
  literatureSources?: CatalystLaunchLiteratureSource[],
) {
  if (typeof window === "undefined" || attachments.length === 0) return
  window.dispatchEvent(
    new CustomEvent<CatalystAttachDetail>(CATALYST_ATTACH_EVENT, {
      detail: { attachments, literatureSources },
    }),
  )
}

export type CatalystNoticeDetail = {
  /** Rendered as a system/assistant-styled bubble in the Catalyst chat. */
  message: string
  tone?: "info" | "warning"
}

export const CATALYST_NOTICE_EVENT = "notes9:catalyst-notice"

/**
 * Post a system notice into the open Catalyst chat — used to tell the user, in
 * the conversation itself, that a paper isn't open-access or its PDF couldn't be
 * read and they should upload the document. Pairs with a toast for visibility.
 */
export function notifyCatalyst(message: string, tone: CatalystNoticeDetail["tone"] = "info") {
  if (typeof window === "undefined" || !message.trim()) return
  window.dispatchEvent(
    new CustomEvent<CatalystNoticeDetail>(CATALYST_NOTICE_EVENT, { detail: { message, tone } }),
  )
}
