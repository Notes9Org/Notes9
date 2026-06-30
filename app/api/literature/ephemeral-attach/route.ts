import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket"
import { collectLiteraturePdfFetchUrls } from "@/lib/literature-pdf-import"
import type { SearchPaper } from "@/types/paper-search"

// Lightweight, ephemeral "read this not-saved paper in Catalyst" path.
//
// A literature search result has no record id and only an abstract (no full
// text) until it is staged into the heavy `literature_reviews` lifecycle. To let
// users chat about a paper WITHOUT that save, we fetch its open-access PDF once,
// store it via the SAME lightweight `chat_attachments` record used by chat file
// uploads (UUID + 7-day signed URL + auto-purge cron), and hand it to Catalyst as
// a normal file attachment. The agent reads it inline this turn and — once the
// returned chatAttachmentId is forwarded — can re-read it by UUID on later turns.
// No Redis, no literature_reviews row.

const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10 MB, matches the chat upload cap
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days, == chat-attachment TTL

// Browser-like headers: many publisher/OA hosts 403 a default fetch UA.
const BROWSER_FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/pdf,text/html;q=0.9,*/*;q=0.8",
}

function isPdfBytes(bytes: Uint8Array): boolean {
  // "%PDF" magic.
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

async function tryFetchPdf(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_FETCH_HEADERS, redirect: "follow" })
    if (!res.ok) return null
    const ct = (res.headers.get("content-type") || "").toLowerCase()
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_PDF_BYTES) return null
    const head = new Uint8Array(buf.slice(0, 8))
    // Accept either a PDF content-type or PDF magic bytes (some hosts mislabel).
    if (ct.includes("application/pdf") || isPdfBytes(head)) return buf
    return null
  } catch {
    return null
  }
}

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

    // Build the candidate OA-PDF URL list: the result's own pdfUrl first, then
    // the shared resolver (Unpaywall / OA mirrors / PMC) used by the save flow.
    const candidates: string[] = []
    if (paper.pdfUrl) candidates.push(paper.pdfUrl)
    try {
      const resolved = await collectLiteraturePdfFetchUrls(paper as SearchPaper)
      for (const u of resolved) if (u && !candidates.includes(u)) candidates.push(u)
    } catch {
      // Resolver failure is non-fatal; we may still have paper.pdfUrl.
    }

    let pdfBuffer: ArrayBuffer | null = null
    for (const url of candidates) {
      pdfBuffer = await tryFetchPdf(url)
      if (pdfBuffer) break
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
        sourceUrl,
        name: paper.title ?? "paper",
        text: lines.join("\n"),
      })
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

    // Register the ephemeral byte store so read_document can re-fetch it by UUID
    // and the 7-day cleanup cron purges it. session_id is optional.
    let chatAttachmentId: string | null = null
    const { data: attRow, error: attErr } = await supabase
      .from("chat_attachments")
      .insert({
        user_id: user.id,
        session_id: body.sessionId ?? null,
        message_id: body.messageId ?? null,
        storage_bucket: USER_STORAGE_BUCKET,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: "application/pdf",
        size_bytes: pdfBuffer.byteLength,
      })
      .select("id")
      .single()
    if (attErr) {
      // Bytes are stored and signed; only the cross-turn re-read record failed.
      // Still usable same-turn, so return the URL without the id.
      console.error("ephemeral-attach chat_attachments insert failed:", attErr)
    } else {
      chatAttachmentId = attRow?.id ?? null
    }

    return NextResponse.json({
      url: signedUrl,
      storagePath,
      name: fileName,
      contentType: "application/pdf",
      size: pdfBuffer.byteLength,
      chatAttachmentId,
      sourceUrl,
    })
  } catch (err) {
    console.error("ephemeral-attach error:", err)
    return NextResponse.json({ error: "Failed to attach paper" }, { status: 500 })
  }
}
