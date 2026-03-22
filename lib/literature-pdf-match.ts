import { createHash } from "crypto"

import { createClient } from "@/lib/supabase/server"
import {
  clampText,
  normalizeAuthor,
  normalizeDoi,
  normalizeTitle,
  normalizeWhitespace,
} from "@/lib/literature-pdf-storage"
import type {
  AnalyzePdfResponse,
  LiteraturePdfExtractedMetadata,
  LiteratureRecordSummary,
  PdfMatchSource,
} from "@/types/literature-pdf"

const DOI_REGEX = /\b(?:doi:\s*)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i
const PMID_REGEX = /\bPMID:\s*(\d{4,10})\b/i
const YEAR_REGEX = /\b(19|20)\d{2}\b/

function isMissingColumnError(error: { message?: string } | null) {
  return Boolean(error?.message && /column .* does not exist/i.test(error.message))
}

function splitAuthorString(raw: string | null) {
  if (!raw) return []
  return raw
    .split(/,|;|\band\b/gi)
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean)
}

function inferTitleFromText(text: string, fallbackName: string) {
  const lines = text
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 12)

  const firstLine = lines.find((line) => !line.toLowerCase().startsWith("doi"))
  if (firstLine) return firstLine.slice(0, 400)
  return fallbackName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").slice(0, 400)
}

async function extractPdfTextAndMetadata(buffer: ArrayBuffer, fileName: string): Promise<LiteraturePdfExtractedMetadata> {
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs")
  if (typeof window === "undefined" && !(globalThis as any).pdfjsWorker?.WorkerMessageHandler) {
    const workerModule: any = await import("pdfjs-dist/build/pdf.worker.min.mjs")
    ;(globalThis as any).pdfjsWorker = {
      WorkerMessageHandler: workerModule.WorkerMessageHandler,
    }
  }
  const pdfBytes = new Uint8Array(buffer.slice(0))
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  })
  const pdf = await loadingTask.promise
  const metadata = await pdf.getMetadata().catch(() => null)

  let text = ""
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
    text += `\n${pageText}`
  }

  const normalizedText = normalizeWhitespace(text)
  const doiMatch = normalizedText.match(DOI_REGEX)
  const pmidMatch = normalizedText.match(PMID_REGEX)
  const yearMatch = normalizedText.match(YEAR_REGEX)

  const info = metadata?.info ?? {}
  const rawAuthors = typeof info.Author === "string" ? info.Author : null
  const keywords =
    typeof info.Keywords === "string"
      ? info.Keywords.split(/,|;/).map((keyword: string) => normalizeWhitespace(keyword)).filter(Boolean)
      : []

  return {
    title: clampText(
      typeof info.Title === "string" && info.Title.trim()
        ? normalizeWhitespace(info.Title)
        : inferTitleFromText(normalizedText, fileName),
      "title"
    ),
    authors: clampText(rawAuthors ? normalizeWhitespace(rawAuthors) : null, "authors"),
    journal: clampText(typeof info.Subject === "string" ? normalizeWhitespace(info.Subject) : null, "journal"),
    publicationYear: yearMatch ? Number.parseInt(yearMatch[0], 10) : null,
    doi: clampText(normalizeDoi(doiMatch?.[1] ?? null), "doi"),
    pmid: clampText(pmidMatch?.[1] ?? null, "pmid"),
    abstract: clampText(normalizedText.slice(0, 4000) || null, "abstract"),
    keywords: keywords.slice(0, 20),
    url: null,
    pageCount: pdf.numPages ?? null,
    previewText: normalizedText.slice(0, 2000) || null,
  }
}

function chooseMatches(
  records: LiteratureRecordSummary[],
  metadata: LiteraturePdfExtractedMetadata
): { candidates: LiteratureRecordSummary[]; matchSource: PdfMatchSource | null } {
  const normalizedDoi = normalizeDoi(metadata.doi)
  if (normalizedDoi) {
    const candidates = records.filter((record) => normalizeDoi(record.doi) === normalizedDoi)
    if (candidates.length > 0) return { candidates, matchSource: "auto_match_doi" }
  }

  if (metadata.pmid) {
    const candidates = records.filter((record) => record.pmid === metadata.pmid)
    if (candidates.length > 0) return { candidates, matchSource: "auto_match_pmid" }
  }

  const normalizedMetadataTitle = normalizeTitle(metadata.title)
  if (normalizedMetadataTitle) {
    const metadataAuthor = normalizeAuthor(metadata.authors)
    const candidates = records.filter((record) => {
      if (normalizeTitle(record.title) !== normalizedMetadataTitle) return false
      if (metadata.publicationYear && record.publication_year === metadata.publicationYear) return true
      if (metadataAuthor && normalizeAuthor(record.authors) === metadataAuthor) return true
      return false
    })
    if (candidates.length > 0) return { candidates, matchSource: "auto_match_title_year" }
  }

  return { candidates: [], matchSource: null }
}

export async function analyzeLiteraturePdfUpload(params: {
  fileBuffer: ArrayBuffer
  fileName: string
  currentLiteratureId?: string | null
}): Promise<AnalyzePdfResponse> {
  const supabase = await createClient()
  const checksum = createHash("sha256")
    .update(Buffer.from(params.fileBuffer.slice(0)))
    .digest("hex")
  const metadata = await extractPdfTextAndMetadata(params.fileBuffer, params.fileName)

  const fullQuery = await supabase
    .from("literature_reviews")
    .select("id, title, authors, journal, publication_year, doi, pmid, pdf_storage_path, pdf_file_name")
    .order("created_at", { ascending: false })

  let records = fullQuery.data
  let error = fullQuery.error

  if (isMissingColumnError(error)) {
    const fallbackQuery = await supabase
      .from("literature_reviews")
      .select("id, title, authors, journal, publication_year, doi, pmid")
      .order("created_at", { ascending: false })

    if (fallbackQuery.error) {
      throw new Error(fallbackQuery.error.message)
    }

    records = (fallbackQuery.data ?? []).map((record) => ({
      ...record,
      pdf_storage_path: null,
      pdf_file_name: null,
    }))
    error = null
  }

  if (error) {
    throw new Error(error.message)
  }

  const availableRecords = (records ?? []) as LiteratureRecordSummary[]
  const { candidates, matchSource } = chooseMatches(availableRecords, metadata)

  let status: AnalyzePdfResponse["status"] = "unmatched"
  let duplicateRecord: LiteratureRecordSummary | null = null
  let recommendedAction: AnalyzePdfResponse["recommendedAction"] = "create_record_and_attach"
  let matchCandidates = candidates

  if (params.currentLiteratureId) {
    const explicitRecord = availableRecords.find((record) => record.id === params.currentLiteratureId)
    if (explicitRecord) {
      const duplicateElsewhere = candidates.find(
        (record) => record.id !== explicitRecord.id && record.pdf_storage_path
      )
      matchCandidates = duplicateElsewhere ? candidates : [explicitRecord]
      if (duplicateElsewhere) {
        status = "duplicate"
        duplicateRecord = duplicateElsewhere
        recommendedAction = "replace_existing_pdf"
      } else if (explicitRecord.pdf_storage_path) {
        status = "duplicate"
        duplicateRecord = explicitRecord
        recommendedAction = "replace_existing_pdf"
      } else {
        status = "matched"
        recommendedAction = "attach_existing"
      }
    }
  } else if (candidates.length === 1) {
    const matched = candidates[0]
    if (matched.pdf_storage_path) {
      status = "duplicate"
      duplicateRecord = matched
      recommendedAction = "replace_existing_pdf"
    } else {
      status = "matched"
      recommendedAction = "attach_existing"
    }
  } else if (candidates.length > 1) {
    status = "ambiguous"
    recommendedAction = "attach_existing"
  }

  return {
    status,
    tempUploadPath: "",
    extractedMetadata: metadata,
    checksum,
    matchCandidates,
    availableRecords,
    duplicateRecord,
    recommendedAction,
    matchSource,
  }
}
