import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// SEC-001: guards the slice's core invariant — every server-side outbound
// request in these files goes through `safeFetch`, never the platform
// `fetch` directly (which re-resolves DNS at connect time and has no
// private-IP/redirect-revalidation guard). `lib/net/safe-fetch.ts` itself is
// intentionally excluded: it's the primitive, and its file-level comment
// legitimately discusses the platform `fetch()` in prose.
const OWNED_FETCHER_FILES = [
  "lib/literature-pdf-import.ts",
  "lib/literature-pdf-urls.ts",
  "lib/literature-oa-resolve.ts",
  "app/api/import/embed-image/route.ts",
  "app/api/literature/ephemeral-attach/route.ts",
]

const REPO_ROOT = join(__dirname, "..", "..")

// Matches a bare `fetch(` call — i.e. NOT preceded by a letter, so
// `safeFetch(` (and any other `...Fetch(`) is correctly excluded.
const RAW_FETCH_CALL = /(?<![A-Za-z])fetch\(/

describe("SEC-001 egress guard — no raw fetch() survives in the owned fetchers", () => {
  for (const relPath of OWNED_FETCHER_FILES) {
    it(`${relPath} contains no raw fetch( call`, () => {
      const source = readFileSync(join(REPO_ROOT, relPath), "utf8")
      const offendingLines = source
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => RAW_FETCH_CALL.test(line))
      expect(offendingLines, JSON.stringify(offendingLines)).toEqual([])
    })
  }
})
