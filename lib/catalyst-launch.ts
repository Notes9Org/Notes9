import type { SearchPaper } from "@/types/paper-search"
import { paperIdentityKey } from "@/lib/paper-search"
import { toast } from "sonner"

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
  /** Display name for the attachment announced by {@link expectAttachment}. When
   *  set, the sidebar shows an optimistic spinner chip (like an in-flight upload)
   *  until the real attachment arrives, fails, or times out — it never blocks
   *  Send and is never included in a message payload. */
  expectedAttachmentName?: string
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

export type AttachPaperOptions = {
  scope?: CatalystSectionScope
  /** Display URL for the abstract-only literature_source (source page / DOI link). */
  sourceUrl?: string | null
  /** Already-imported PDF for a saved/staged `literature_reviews` row — skips the
   *  ephemeral OA fetch and attaches the durable viewer-pdf route directly. */
  savedPdf?: { id: string; storagePath: string } | null
}

function litSourceFor(paper: SearchPaper, sourceUrl?: string | null): CatalystLaunchLiteratureSource[] | undefined {
  if (!paper.title) return undefined
  return [
    {
      title: paper.title,
      abstract: paper.abstract || undefined,
      doi: paper.doi || undefined,
      pmid: paper.pmid || undefined,
      journal: paper.journal || undefined,
      year: paper.year || undefined,
      url: sourceUrl || undefined,
      authors: paper.authors,
    },
  ]
}

/**
 * One shared "Ask Catalyst about this paper" flow for every entry point (search
 * result card, staged/saved paper reader). Always attaches the abstract as a
 * citable `literature_source` up front, then resolves the best-available PDF:
 * an already-imported one (`savedPdf`) if present, else an ephemeral open-access
 * fetch — falling back to web search + the abstract on failure. Web search
 * defaults off and only flips on when no full text is attachable, and Send is
 * gated (`expectAttachment`) until the attachment lands or fails.
 */
export async function attachPaperToCatalyst(
  paper: SearchPaper | null | undefined,
  opts: AttachPaperOptions = {},
) {
  const scope = opts.scope ?? "literature"
  if (!paper) {
    openCatalystPanel({ scope, webSearch: true, autoSend: false })
    return
  }
  const title = paper.title?.trim() || "paper"
  const litSource = litSourceFor(paper, opts.sourceUrl)
  const expectedName = `${title.slice(0, 80).replace(/[^a-zA-Z0-9._ -]/g, "_").trim() || "paper"}.pdf`

  openCatalystPanel({
    scope,
    webSearch: false,
    autoSend: false,
    literatureSources: litSource,
    expectAttachment: true,
    expectedAttachmentName: expectedName,
  })

  const key = paperIdentityKey(paper, { savedId: opts.savedPdf?.id })

  console.log(
    `[lit] ask-catalyst attach paperKey=${key} branch=${opts.savedPdf ? "stored-pdf" : "ephemeral-download"} savedId=${opts.savedPdf?.id ?? "-"} title="${title.slice(0, 60)}"`,
  )

  if (opts.savedPdf) {
    attachToCatalyst(
      [
        {
          url: `/api/literature/${opts.savedPdf.id}/viewer-pdf`,
          // Same name the optimistic spinner chip used (expectedName), so the
          // real attachment REPLACES it instead of stacking a second chip.
          name: expectedName,
          contentType: "application/pdf",
          paperKey: key,
        },
      ],
      litSource,
    )
    return
  }

  try {
    const res = await fetch("/api/literature/ephemeral-attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper }),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.url && !data?.fallback) {
      attachToCatalyst(
        [
          {
            url: data.url as string,
            // Must equal expectedName (the spinner-chip name) so the real
            // attachment replaces the optimistic chip rather than duplicating it.
            // ponytail: name-match keys on the 80-char title prefix; two papers
            // sharing that prefix would collide — switch to paperKey if it bites.
            name: expectedName,
            contentType: "application/pdf",
            paperKey: key,
            storagePath: (data.storagePath as string) || undefined,
            chatAttachmentId: (data.chatAttachmentId as string) || undefined,
          },
        ],
        litSource,
      )
      if (!data.chatAttachmentId) {
        toast.info(
          "Paper attached for this message; follow-ups will use its abstract. Re-attach or upload the PDF if you need full text again.",
        )
      }
      return
    }
    const abstract = paper.abstract || (typeof data?.text === "string" ? data.text : "")
    openCatalystPanel({
      scope,
      webSearch: true,
      autoSend: false,
      literatureSources: abstract ? litSourceFor({ ...paper, abstract }, opts.sourceUrl) : undefined,
      expectedAttachmentName: expectedName,
    })
    const fetchFailed = data?.reason === "fetch_failed"
    const reasonLead = fetchFailed
      ? "The open-access link couldn’t be downloaded"
      : "This paper isn’t open access"
    toast.info(
      abstract
        ? `${reasonLead} — Catalyst will read and cite the abstract. Upload the PDF for full-text analysis.`
        : `${reasonLead}. Catalyst will use web search; upload the PDF for full-text analysis.`,
    )
  } catch {
    openCatalystPanel({ scope, webSearch: true, autoSend: false })
    toast.error("Couldn’t load the paper into Catalyst. Falling back to web search.")
  }
}
