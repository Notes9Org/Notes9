import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket"
import {
  downloadFirstPdf,
  fetchPdfFromOaPackageTgz,
  oaPdfCacheKey,
  readOaPdfCache,
  writeOaPdfCache,
} from "@/lib/literature-pdf-import"
import { resolveOaSources } from "@/lib/literature-oa-resolve"
import type { SearchPaper } from "@/types/paper-search"

type OaResolveResult = { pdfUrls: string[]; oaPackageTgzUrl: string | null; abstract: string | null }

// Lightweight, ephemeral "read this not-saved paper in Catalyst" path.
//
// A literature search result has no record id and only an abstract (no full
// text) until it is staged into the heavy `literature_reviews` lifecycle. To let
// users chat about a paper WITHOUT that save, we fetch its open-access PDF once,
// store it in the SAME storage layout used by chat file uploads (7-day signed
// URL), and hand it to Catalyst as a normal file attachment.
//
// This route does NOT insert the chat_attachments row itself: Ask Catalyst runs
// before any chat session exists, and the live table requires a real, owned
// session_id (NOT NULL + chat_attachments_insert_own RLS). Registration is
// deferred to the sidebar's send-time back-fill (/api/files/register), which
// was built for exactly this pre-session gap — it upserts the row with the
// just-created session_id, giving the file its 7-day TTL and read_document
// re-reads. We return chatAttachmentId: null so that back-fill picks it up.
// No Redis, no literature_reviews row.

const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10 MB, matches the chat upload cap
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days, == chat-attachment TTL

// This route sits behind the "Ask Catalyst" button: the composer's Send is
// gated on it, so latency here IS perceived UI lag. The shared downloadFirstPdf
// races candidates in parallel with a hard per-fetch + total deadline; past it
// we fall back to the abstract instead of keeping the user waiting.
const RESOLVER_BUDGET_MS = 8_000 // resolveOaSources (Unpaywall/OpenAlex/EuropePMC/NCBI)
const PER_FETCH_TIMEOUT_MS = 10_000 // one candidate download, connect → last byte
const PDF_RACE_BUDGET_MS = 15_000 // all candidates together

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: { paper?: Partial<SearchPaper>; sessionId?: string; messageId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const paper = body.paper
    if (!paper || (!paper.pdfUrl && !paper.doi && !paper.pmid && !paper.title)) {
      return NextResponse.json({ error: "A paper with at least a pdfUrl, doi, pmid, or title is required" }, { status: 400 })
    }

    const safeTitle = (paper.title || "paper").slice(0, 80)
    const fileName = `${safeTitle.replace(/[^a-zA-Z0-9._ -]/g, "_").trim() || "paper"}.pdf`
    const sourceUrl = paper.articlePageUrl || paper.sourceUrl || paper.pdfUrl || null

    // Candidate OA-PDF URLs. Use the SAME broad resolver as the "Read paper" /
    // stage flow (resolveOaSources): Unpaywall + OpenAlex + Europe PMC + PMC OA
    // subset + preprint mirrors + the card's own pdfUrl — resolves by DOI, so
    // non-PMC open-access papers (Elsevier/MDPI/Frontiers/...) work here too.
    // The paper's own pdfUrl still downloads IMMEDIATELY while the resolver runs
    // concurrently and feeds the rest into the same race as they arrive; the
    // resolver keeps its own deadline so a hung upstream degrades to "direct URL
    // only" rather than holding the composer hostage.
    // Shared OA-PDF cache: if the same paper was already downloaded (by a prior
    // tag, or by the read/stage flow), reuse those bytes and skip the entire
    // resolve + download race below — this is what makes a tag-then-read (or a
    // re-tag) instant instead of re-fetching over the network.
    const cacheKey = oaPdfCacheKey(paper as SearchPaper)
    let pdfBuffer: ArrayBuffer | null = cacheKey ? await readOaPdfCache(cacheKey) : null

    console.log(
      `[lit] ask-catalyst ephemeral-attach doi=${paper.doi ?? "-"} pmid=${paper.pmid ?? "-"} cache=${pdfBuffer ? "hit" : "miss"}`,
    )

    if (!pdfBuffer) {
      const directUrls = paper.pdfUrl ? [paper.pdfUrl] : []
      const oaSources = Promise.race([
        resolveOaSources(paper as SearchPaper, { contactEmail: user.email ?? undefined }),
        new Promise<OaResolveResult>((resolve) =>
          setTimeout(() => resolve({ pdfUrls: [], oaPackageTgzUrl: null, abstract: null }), RESOLVER_BUDGET_MS),
        ),
      ]).catch(() => ({ pdfUrls: [], oaPackageTgzUrl: null, abstract: null }) as OaResolveResult)
      const resolverUrls = oaSources.then((r) => r.pdfUrls)

      // Tight interactive budgets (this gates the composer's Send). directUrls
      // download immediately; resolver URLs join the same race as they resolve.
      const downloaded = await downloadFirstPdf(directUrls, {
        lateUrls: resolverUrls,
        maxBytes: MAX_PDF_BYTES,
        perFetchTimeoutMs: PER_FETCH_TIMEOUT_MS,
        totalBudgetMs: PDF_RACE_BUDGET_MS,
      })
      pdfBuffer = downloaded?.buffer ?? null

      // Last resort: the PMC Open Access `.tgz` package (same one the stage flow
      // extracts). Only reached when every direct/mirror PDF URL failed.
      if (!pdfBuffer) {
        const tgzUrl = (await oaSources).oaPackageTgzUrl
        if (tgzUrl) {
          const fromTgz = await fetchPdfFromOaPackageTgz(tgzUrl).catch(() => null)
          if (fromTgz) pdfBuffer = fromTgz.buffer
        }
      }

      // Fallback: no OA PDF reachable (paywall / bot wall). Return a metadata-text
      // blob so Catalyst still has the paper's abstract + a link to answer from,
      // satisfying "by any method, load the paper."
      if (!pdfBuffer) {
        const lines = [
          `Title: ${paper.title ?? "(untitled)"}`,
          paper.authors?.length ? `Authors: ${paper.authors.join(", ")}` : null,
          paper.year ? `Year: ${paper.year}` : null,
          paper.journal ? `Journal: ${paper.journal}` : null,
          paper.doi ? `DOI: ${paper.doi}` : null,
          sourceUrl ? `Link: ${sourceUrl}` : null,
          paper.abstract ? `\nAbstract:\n${paper.abstract}` : null,
        ].filter(Boolean)
        return NextResponse.json({
          fallback: true,
          // Deterministic reason so the UI can say WHY: no OA link at all
          // (paper isn't open access) vs links existed but every download
          // failed (bot wall / dead link).
          // oaSources has settled by now (its budget < the race budget), so
          // awaiting it here is instant. No candidate URLs at all → the paper has
          // no open-access link; URLs existed but every download failed → fetch.
          reason:
            directUrls.length === 0 &&
            (await resolverUrls).length === 0 &&
            !(await oaSources).oaPackageTgzUrl
              ? "no_open_access_link"
              : "fetch_failed",
          sourceUrl,
          name: paper.title ?? "paper",
          text: lines.join("\n"),
        })
      }

      // Fresh download succeeded — populate the shared cache for next time.
      if (cacheKey) void writeOaPdfCache(cacheKey, pdfBuffer)
    }

    const timestamp = Date.now()
    const storagePath = `${user.id}/chat-attachments/${timestamp}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`

    const { error: uploadError } = await supabase.storage
      .from(USER_STORAGE_BUCKET)
      .upload(storagePath, pdfBuffer, { cacheControl: "3600", upsert: false, contentType: "application/pdf" })
    if (uploadError) {
      console.error("ephemeral-attach upload error:", uploadError)
      return NextResponse.json({ error: "Failed to store paper PDF" }, { status: 500 })
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(USER_STORAGE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
    const signedUrl = signedUrlData?.signedUrl ?? ""
    if (signedUrlError || !signedUrl.startsWith("http")) {
      await supabase.storage.from(USER_STORAGE_BUCKET).remove([storagePath])
      return NextResponse.json({ error: "Failed to generate paper URL" }, { status: 500 })
    }

    // chatAttachmentId is deliberately null: no chat session exists yet, and the
    // live chat_attachments schema requires an owned session_id. The sidebar's
    // send-time back-fill (/api/files/register) registers this file — keyed on
    // storagePath + a null chatAttachmentId — as soon as the session is created,
    // which is what gives it the 7-day TTL and later read_document re-reads.
    return NextResponse.json({
      url: signedUrl,
      storagePath,
      name: fileName,
      contentType: "application/pdf",
      size: pdfBuffer.byteLength,
      chatAttachmentId: null,
      sourceUrl,
    })
  } catch (err) {
    console.error("ephemeral-attach error:", err)
    return NextResponse.json({ error: "Failed to attach paper" }, { status: 500 })
  }
}
