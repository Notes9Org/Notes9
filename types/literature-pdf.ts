export const LITERATURE_TEXT_LIMITS = {
  title: 1024,
  authors: 4000,
  journal: 512,
  doi: 256,
  pmid: 64,
  url: 2048,
  abstract: 20000,
  personalNotes: 50000,
  pdfFileName: 512,
  pdfFileType: 128,
  pdfStoragePath: 1024,
  pdfChecksum: 128,
  pdfMatchSource: 64,
  quoteText: 5000,
  commentText: 10000,
} as const

export const LITERATURE_ALLOWED_PDF_MIME_TYPES = ["application/pdf"] as const
export const LITERATURE_MAX_PDF_SIZE = 25 * 1024 * 1024
export const LITERATURE_MAX_PDF_SIZE_MB = 25

export const LITERATURE_FINAL_PREFIX = "literature-review"
export const LITERATURE_TEMP_PREFIX = "temp-literature-review"
export const LITERATURE_STORAGE_BUCKET = "experiment-files"

export type SaveMode = "naming_convention" | "extract_pdf_metadata"
export type AnnotationType = "highlight" | "note" | "comment"

export type PdfMatchSource =
  | "manual_record_upload"
  | "auto_match_doi"
  | "auto_match_pmid"
  | "auto_match_title_year"
  | "manual_existing_record_selection"
  | "manual_new_record_creation"
  | "replacement"

export type AnalyzeStatus = "matched" | "duplicate" | "ambiguous" | "unmatched"

export interface LiteraturePdfExtractedMetadata {
  title: string | null
  authors: string | null
  journal: string | null
  publicationYear: number | null
  doi: string | null
  pmid: string | null
  abstract: string | null
  keywords: string[]
  url: string | null
  pageCount: number | null
  previewText: string | null
}

export interface LiteratureRecordSummary {
  id: string
  title: string
  authors: string | null
  journal: string | null
  publication_year: number | null
  doi: string | null
  pmid: string | null
  pdf_storage_path: string | null
  pdf_file_name: string | null
}

export interface AnalyzePdfResponse {
  status: AnalyzeStatus
  tempUploadPath: string
  extractedMetadata: LiteraturePdfExtractedMetadata
  checksum: string
  matchCandidates: LiteratureRecordSummary[]
  availableRecords: LiteratureRecordSummary[]
  duplicateRecord: LiteratureRecordSummary | null
  recommendedAction: "attach_existing" | "replace_existing_pdf" | "create_record_and_attach"
  matchSource: PdfMatchSource | null
}

export interface AnnotationRect {
  top: number
  left: number
  width: number
  height: number
}

export interface LiteraturePdfAnnotation {
  id: string
  literature_review_id: string
  organization_id: string | null
  created_by: string | null
  type: AnnotationType
  page_number: number
  quote_text: string | null
  comment_text: string | null
  color: string | null
  rects: AnnotationRect[] | null
  anchor: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface LiteraturePdfRecordFields {
  pdf_file_url: string | null
  pdf_file_name: string | null
  pdf_file_size: number | null
  pdf_file_type: string | null
  pdf_storage_path: string | null
  pdf_uploaded_at: string | null
  pdf_checksum: string | null
  pdf_match_source: PdfMatchSource | null
  pdf_metadata: Record<string, unknown> | null
}
