import {
  LITERATURE_ALLOWED_PDF_MIME_TYPES,
  LITERATURE_MAX_PDF_SIZE,
  LITERATURE_STORAGE_BUCKET,
  LITERATURE_TEXT_LIMITS,
  type LiteratureStorageDomain,
} from "@/types/literature-pdf"

const TEXT_LIMIT_MAP: Record<string, number> = {
  title: LITERATURE_TEXT_LIMITS.title,
  authors: LITERATURE_TEXT_LIMITS.authors,
  journal: LITERATURE_TEXT_LIMITS.journal,
  doi: LITERATURE_TEXT_LIMITS.doi,
  pmid: LITERATURE_TEXT_LIMITS.pmid,
  url: LITERATURE_TEXT_LIMITS.url,
  abstract: LITERATURE_TEXT_LIMITS.abstract,
  personal_notes: LITERATURE_TEXT_LIMITS.personalNotes,
  pdf_file_name: LITERATURE_TEXT_LIMITS.pdfFileName,
  pdf_file_type: LITERATURE_TEXT_LIMITS.pdfFileType,
  pdf_storage_path: LITERATURE_TEXT_LIMITS.pdfStoragePath,
  pdf_checksum: LITERATURE_TEXT_LIMITS.pdfChecksum,
  pdf_match_source: LITERATURE_TEXT_LIMITS.pdfMatchSource,
  quote_text: LITERATURE_TEXT_LIMITS.quoteText,
  comment_text: LITERATURE_TEXT_LIMITS.commentText,
}

export function sanitizeStorageFileName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, LITERATURE_TEXT_LIMITS.pdfFileName)
}

/**
 * Used only when no `literature_reviews.id` exists yet (e.g. upload wizard creating a new record).
 * Staging → repository only updates `catalog_placement`; PDF stays at the same key.
 */
export function createTempLiteraturePdfPath(userId: string, fileName: string) {
  return `${userId}/temp/${Date.now()}-${sanitizeStorageFileName(fileName)}`
}

/** True if `path` is the final user-scoped key for this literature record (not `/temp/`). */
export function isFinalLiteraturePdfPath(userId: string, literatureId: string, path: string) {
  const prefix = `${userId}/literature/${literatureId}/`
  return path.startsWith(prefix) && !path.includes("/temp/")
}

/** Final PDF object key: `{userId}/{domain}/{recordId}/{timestamp}-{fileName}`. */
export function createUserScopedStoragePath(
  userId: string,
  domain: LiteratureStorageDomain,
  recordId: string,
  fileName: string
) {
  return `${userId}/${domain}/${recordId}/${Date.now()}-${sanitizeStorageFileName(fileName)}`
}

/** @deprecated Use createUserScopedStoragePath — kept for call sites migrating to user-scoped keys. */
export function createLiteraturePdfPath(
  userId: string,
  literatureId: string,
  fileName: string
) {
  return createUserScopedStoragePath(userId, "literature", literatureId, fileName)
}

export function getLiteratureStorageBucket() {
  return LITERATURE_STORAGE_BUCKET
}

export function validateLiteraturePdfDisplayName(fileName: string): string | null {
  const name = fileName.trim()
  if (!name) {
    return "PDF file name is required."
  }
  if (name.length > LITERATURE_TEXT_LIMITS.pdfFileName) {
    return `PDF file name must be ${LITERATURE_TEXT_LIMITS.pdfFileName} characters or fewer.`
  }
  if (!name.toLowerCase().endsWith(".pdf")) {
    return "File must use the .pdf extension."
  }
  return null
}

/**
 * Ensures `storagePath` is under the signed-in user and matches either a temp upload or
 * a final key for `currentLiteratureId` (direct browser upload flow).
 */
export function isValidOwnedLiteratureUploadPath(
  userId: string,
  storagePath: string,
  currentLiteratureId: string | null
): boolean {
  if (!storagePath || storagePath.includes("..") || storagePath.startsWith("/")) {
    return false
  }
  if (!storagePath.startsWith(`${userId}/`)) {
    return false
  }
  if (currentLiteratureId) {
    const prefix = `${userId}/literature/${currentLiteratureId}/`
    if (!storagePath.startsWith(prefix)) return false
    if (storagePath.includes("/temp/")) return false
    return true
  }
  return storagePath.startsWith(`${userId}/temp/`)
}

export function validatePdfFile(file: File) {
  const nameErr = validateLiteraturePdfDisplayName(file.name)
  if (nameErr) {
    return nameErr
  }

  if (file.size > LITERATURE_MAX_PDF_SIZE) {
    return `PDF must be ${Math.round(LITERATURE_MAX_PDF_SIZE / (1024 * 1024))}MB or smaller.`
  }

  if (!LITERATURE_ALLOWED_PDF_MIME_TYPES.includes(file.type as "application/pdf")) {
    return "Only PDF uploads are supported."
  }

  return null
}

export function validatePdfBuffer(byteLength: number, headerSlice: Uint8Array) {
  if (byteLength > LITERATURE_MAX_PDF_SIZE) {
    return `PDF must be ${Math.round(LITERATURE_MAX_PDF_SIZE / (1024 * 1024))}MB or smaller.`
  }
  if (headerSlice.length < 4 || byteLength < 4) {
    return "Response was not a PDF file."
  }
  const header = String.fromCharCode(...headerSlice.subarray(0, 4))
  if (!header.startsWith("%PDF")) {
    return "Response was not a PDF file."
  }
  return null
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

export function normalizeTitle(value: string | null | undefined) {
  if (!value) return ""
  return normalizeWhitespace(value.toLowerCase().replace(/[^a-z0-9\s]/g, ""))
}

export function normalizeAuthor(value: string | null | undefined) {
  if (!value) return ""
  const first = value.split(",")[0] ?? value
  return normalizeWhitespace(first.toLowerCase().replace(/[^a-z0-9\s]/g, ""))
}

export function normalizeDoi(value: string | null | undefined) {
  if (!value) return null
  return normalizeWhitespace(value.toLowerCase())
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/[.)\],;]+$/, "")
}

export function clampText(value: string | null | undefined, key: keyof typeof TEXT_LIMIT_MAP) {
  if (!value) return null
  return value.slice(0, TEXT_LIMIT_MAP[key])
}

export function validateTextLimits(input: Record<string, string | null | undefined>) {
  const errors: string[] = []

  for (const [key, value] of Object.entries(input)) {
    const limit = TEXT_LIMIT_MAP[key]
    if (!limit || value == null) continue
    if (value.length > limit) {
      errors.push(`${key} exceeds ${limit} characters`)
    }
  }

  return errors
}
