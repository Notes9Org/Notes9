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
 * Rank `.pdf` paths inside NLM OA tarballs. Packages often list MOESM/supplementary PDFs
 * before the main article; taking “first PDF” imports the wrong file (e.g. Reporting Summary).
 */
function scoreOaPackagePdfMemberPath(memberPath: string): number {
  const norm = memberPath.replace(/\\/g, "/")
  const lower = norm.toLowerCase()
  const base = lower.split("/").pop() ?? lower
  let s = 0
  if (/_article_\d+\.pdf$/i.test(base)) s += 100
  else if (/(^|[/_-])article[_-]\d+\.pdf$/i.test(base)) s += 100
  else if (base === "main.pdf") s += 95
  else if (/\bvor\b|version[_-]of[_-]record/.test(base)) s += 45

  if (/reporting|transparency|editorial\s+policy|checklist|author[s_]?contribut|cover\s*letter|ethics\s*summary/.test(lower)) {
    s -= 130
  }
  if (
    /moesm|_esm\.pdf|supplementary|supplement|suppl_?info|appendix|figures?_?s?\d|extended[_-]data|\bsi\d+\b/.test(lower)
  ) {
    s -= 75
  }
  return s
}

/**
 * Best-scoring member ending in `.pdf` inside a **POSIX/ustar** tar (uncompressed bytes).
 * Skips directories and non-PDF files. Ties break toward larger files (often the full text).
 */
export function extractFirstPdfFromTar(tar: Buffer): Buffer | null {
  const candidates: { name: string; body: Buffer; score: number }[] = []
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
      if (!headerErr) {
        candidates.push({
          name,
          body: Buffer.from(body),
          score: scoreOaPackagePdfMemberPath(name),
        })
      }
    }

    offset += Math.ceil(size / 512) * 512
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => (b.score - a.score) || (b.body.length - a.body.length))
  return candidates[0].body
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
