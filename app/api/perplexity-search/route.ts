import { NextResponse } from 'next/server'

/**
 * @deprecated As of plan `snuggly-meandering-pinwheel` (2026-05-28).
 *
 * The paid Perplexity Sonar Pro literature search has been replaced by the
 * catalyst-hosted single-agent pipeline at:
 *
 *     POST {CATALYST_URL}/literature/search
 *
 * Browser-facing entry point: `GET /api/search-papers?query=…`. Same
 * `SearchPaper[]` response contract, ~10× cheaper, results cached for 24 h.
 *
 * This handler returns HTTP 410 Gone for any incoming request. The file is
 * retained for one release so anything still pointing at this URL surfaces a
 * loud failure rather than silent 404s. It will be deleted after a release
 * cycle of confirmed zero traffic.
 */
const REPLACEMENT_DOC = "Use GET /api/search-papers instead." as const

function gone() {
  return NextResponse.json(
    {
      error: "Endpoint removed",
      detail: REPLACEMENT_DOC,
      replaced_by: "/api/search-papers",
    },
    { status: 410 }
  )
}

export async function GET() {
  return gone()
}

export async function POST() {
  return gone()
}
