import { NextResponse } from "next/server"

import { fetchOpenAccessPdfBufferByIds } from "@/lib/literature-pdf-import"
import { createClient } from "@/lib/supabase/server"

/** Official NLM documentation for this flow (discovery + download layout). */
const NLM_PMC_DOCS = {
  oaWebService: "https://pmc.ncbi.nlm.nih.gov/tools/oa-service/",
  ftp: "https://pmc.ncbi.nlm.nih.gov/tools/ftp/",
  idConverter: "https://pmc.ncbi.nlm.nih.gov/tools/id-converter-api/",
} as const

/**
 * **CORS bridge:** NCBI/PMC APIs are not usable from the browser alone (no CORS). This Route Handler
 * runs on the server, performs the same steps as {@link fetchOpenAccessPdfBufferByIds}, and streams PDF bytes.
 *
 * Flow (see {@link NLM_PMC_DOCS}):
 * 1. **Discovery** — PMC OA Web Service XML (`oa.fcgi`); prefer `<link format="pdf" href="…">` (FTP URLs → HTTPS).
 * 2. **PMID** — optional `pmid` is converted to PMCID server-side (E-utilities `elink`; ID Converter API is the documented alternative).
 * 3. **Subset** — only PMC **Open Access Subset** articles yield URLs; otherwise import logic returns no PDF.
 *
 * - `GET /api/literature/oa-pdf?pmid=…` and/or `pmc=…` (numeric or `PMC` prefix).
 * - Success: `application/pdf`. Failure: JSON `{ error, hint?, docs }`.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const pmid = searchParams.get("pmid")
  const pmc = searchParams.get("pmc")

  if (!pmid && !pmc) {
    return NextResponse.json(
      { error: "Query required: pmid and/or pmc (numeric or PMC prefix)." },
      { status: 400 }
    )
  }

  try {
    const { buffer } = await fetchOpenAccessPdfBufferByIds({ pmid, pmc })
    const safeName = pmid
      ? `${pmid.replace(/[^\d]/g, "") || "article"}.pdf`
      : `${(pmc ?? "article").replace(/^PMC/i, "").replace(/[^\d]/g, "") || "article"}.pdf`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch open-access PDF"
    return NextResponse.json(
      {
        error: message,
        hint: usedUrlHint(),
        docs: NLM_PMC_DOCS,
      },
      { status: 502 }
    )
  }
}

function usedUrlHint(): string {
  return "Confirm PMCID is in the Open Access Subset (oa.fcgi). PMID must map to PMC. FTP links from oa.fcgi are downloaded via HTTPS. If still failing, upload the PDF in the literature tab."
}
