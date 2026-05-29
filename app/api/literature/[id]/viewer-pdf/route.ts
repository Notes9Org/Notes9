import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { createServiceRoleClient } from "@/lib/supabase-service-role"
import { getLiteratureStorageBucket } from "@/lib/literature-pdf-storage"

/**
 * Same-origin PDF stream for the in-app reader (pdf.js).
 * The browser cannot reliably fetch Supabase `getPublicUrl` objects when the bucket is private
 * or RLS requires an authenticated session — pdf.js runs client-side without Supabase JWT.
 *
 * Authorization model: the row read below runs through the *user* client, so
 * RLS on `literature_reviews` is the access gate — the caller only obtains the
 * storage path if they're allowed to see the record (now org-scoped, see
 * 053_supabase_rls_migration.sql). Once authorized, the bytes are streamed via
 * the *service role* client. This is required because the `storage.objects`
 * policy for the `user` bucket keys reads on the uploader's folder prefix
 * (`{uploaderId}/literature/...`), so an org colleague who can legitimately see
 * the literature row would otherwise get a 502 on the storage download. The
 * share-note route uses the same authorize-then-service-role-download pattern.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // RLS-enforced read = the authorization check. If the user can't see the
    // row (wrong org), maybeSingle() returns null and we 404 — never leak bytes.
    const { data: row, error: selErr } = await supabase
      .from("literature_reviews")
      .select("pdf_storage_path")
      .eq("id", id)
      .maybeSingle()

    if (selErr) {
      console.error("viewer-pdf row read failed", { id, error: selErr.message })
      return NextResponse.json({ error: "PDF not found" }, { status: 404 })
    }
    if (!row?.pdf_storage_path) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 })
    }

    // Bytes streamed with the service role: the caller is already authorized
    // (row was visible under RLS), and the storage object is owner-prefixed so
    // the user JWT can't read a colleague's upload directly.
    const admin = createServiceRoleClient()
    const { data: blob, error: dlErr } = await admin.storage
      .from(getLiteratureStorageBucket())
      .download(row.pdf_storage_path)

    if (dlErr || !blob) {
      // Surface the real cause (missing object, wrong bucket, etc.) instead of
      // an opaque 502 — pdf.js only reports the status code to the user.
      console.error("viewer-pdf storage download failed", {
        id,
        bucket: getLiteratureStorageBucket(),
        path: row.pdf_storage_path,
        error: dlErr?.message ?? "no blob returned",
      })
      return NextResponse.json(
        { error: dlErr?.message ?? "Could not load PDF from storage" },
        { status: 502 }
      )
    }

    const buf = await blob.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
      },
    })
  } catch (e) {
    console.error("viewer-pdf", e)
    return NextResponse.json({ error: "Failed to stream PDF" }, { status: 500 })
  }
}
