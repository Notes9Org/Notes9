import { gunzipSync } from "node:zlib"

import { LITERATURE_MAX_PDF_SIZE } from "@/types/literature-pdf"
import { validatePdfBuffer } from "@/lib/literature-pdf-storage"

/** Max compressed OA package download (NLM tgz) before extract. */
const MAX_TGZ_BYTES = 80 * 1024 * 1024
/** Guardrail after gzip (tar payload). */
const MAX_TAR_BYTES = 220 * 1024 * 1024

function parseOctalField(field: Buffer): number {
  const s = field.toString("ascii").replace(/\0/g, "").trim()
  if (!s) return 0
  const n = parseInt(s, 8)
  return Number.isFinite(n) ? n : 0
}

/**
 * First member ending in `.pdf` inside a **POSIX/ustar** tar (uncompressed bytes).
 * Skips directories and non-PDF files.
 */
export function extractFirstPdfFromTar(tar: Buffer): Buffer | null {
  let offset = 0
  while (offset + 512 <= tar.length) {
    const hdr = tar.subarray(offset, offset + 512)
    if (hdr[0] === 0) break

    let name = hdr.subarray(0, 100).toString("utf8").split("\0")[0]
    const prefix = hdr.subarray(345, 500).toString("utf8").split("\0")[0]
    if (prefix) name = `${prefix}/${name}`

    const size = parseOctalField(hdr.subarray(124, 136))
    const type = hdr[156]
    offset += 512

    const isRegularFile =
      type === 0 || type === "0".charCodeAt(0) || type === "\0".charCodeAt(0)

    if (isRegularFile && name.toLowerCase().endsWith(".pdf") && size > 0 && size <= LITERATURE_MAX_PDF_SIZE) {
      const end = offset + size
      if (end > tar.length) return null
      const body = tar.subarray(offset, end)
      const headerErr = validatePdfBuffer(body.length, new Uint8Array(body.subarray(0, 8)))
      if (!headerErr) return Buffer.from(body)
    }

    offset += Math.ceil(size / 512) * 512
  }
  return null
}

/**
 * NLM OA packages are `.tar.gz` on FTP/HTTPS. This avoids PMC `/pdf/` browser-only gates
 * when `oa.fcgi` lists only `format="tgz"`.
 */
export function extractFirstPdfFromTarGz(compressed: Buffer): Buffer | null {
  if (compressed.length > MAX_TGZ_BYTES) return null
  let tar: Buffer
  try {
    tar = gunzipSync(compressed, { maxOutputLength: MAX_TAR_BYTES })
  } catch {
    return null
  }
  if (tar.length > MAX_TAR_BYTES) return null
  return extractFirstPdfFromTar(tar)
}
