// Single source of truth for chat attachment types. Shared by the client
// composer (components/layout/right-sidebar.tsx), the upload route
// (app/api/files/upload/route.ts) and the request contract type
// (lib/notes9-agent-request.ts).
//
// MUST stay in lockstep with the Python agent contract:
//   AI/catalyst/agents/contracts/request.py  SUPPORTED_FILE_MIME_TYPES.
// A type accepted here but not there is uploaded then silently rejected by the
// agent — the exact class of "attachment sometimes not handled" bug this fixes.

export const ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_FILE_ATTACHMENTS_PER_REQUEST = 5;

/** Canonical supported MIME types. */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Extension → canonical MIME. Used to (a) build the file-picker `accept`
 * attribute and (b) recover the MIME when the browser reports a blank or
 * generic `file.type` for .docx/.xlsx — common on some OS/browser combos and
 * for files coming from zips or cloud drives.
 */
export const EXTENSION_TO_MIME: Record<string, AllowedMimeType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".json": "application/json",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * ZIP-container (OOXML) types. Their identifying entries can sit past the first
 * few KB, so the upload route must sniff the whole buffer (not a 4 KB slice) and
 * accept a bare `application/zip` detection for these.
 */
export const OOXML_MIME_TYPES: readonly AllowedMimeType[] = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/**
 * Types validated as UTF-8 text during the upload magic-byte check rather than
 * by binary signature (they have no reliable magic bytes).
 */
export const TEXT_SNIFF_MIME_TYPES: readonly AllowedMimeType[] = [
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "image/svg+xml",
];

const ACCEPT_EXTENSIONS = Object.keys(EXTENSION_TO_MIME);

/**
 * Value for an `<input accept>` / dropzone `accept` — MIME types AND extensions
 * so the OS file picker never greys out files the browser can't MIME-detect.
 */
export const ATTACHMENT_ACCEPT_LIST: string[] = [...ALLOWED_MIME_TYPES, ...ACCEPT_EXTENSIONS];
export const ATTACHMENT_ACCEPT = ATTACHMENT_ACCEPT_LIST.join(",");

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Normalize a declared MIME: lowercase, drop any `;charset=` suffix. */
export function normalizeDeclaredMime(type: string | undefined | null): string {
  return (type || "").toLowerCase().split(";")[0].trim();
}

/** Type guard: is a raw string one of the supported attachment MIME types? */
export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Canonical MIME for a File, preferring a valid declared type and falling back
 * to the filename extension when the browser reports blank/generic. Returns
 * null when neither resolves to a supported type.
 */
export function resolveAttachmentMime(file: { type?: string; name: string }): AllowedMimeType | null {
  const declared = normalizeDeclaredMime(file.type);
  if (isAllowedMimeType(declared)) {
    return declared;
  }
  return EXTENSION_TO_MIME[fileExtension(file.name)] ?? null;
}

/** True when the file is an accepted type by declared MIME or by extension. */
export function isAcceptedAttachment(file: { type?: string; name: string }): boolean {
  return resolveAttachmentMime(file) !== null;
}
