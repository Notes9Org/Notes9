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
}

export const CATALYST_OPEN_EVENT = "notes9:open-catalyst"

/** Open Catalyst in-place (side panel) or on `/catalyst` when already on that route. */
export function openCatalystPanel(detail: CatalystLaunchDetail = {}) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<CatalystLaunchDetail>(CATALYST_OPEN_EVENT, { detail }),
  )
}
