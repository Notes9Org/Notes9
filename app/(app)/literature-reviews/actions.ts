'use server'

import { createHash } from "crypto"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { SearchPaper } from "@/types/paper-search"
import {
  clampText,
  createLiteraturePdfPath,
  getLiteratureStorageBucket,
  normalizeDoi,
} from "@/lib/literature-pdf-storage"

async function attachOpenAccessPdf(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  literatureId: string
  pdfUrl: string
}) {
  const response = await fetch(params.pdfUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF (${response.status})`)
  }

  const contentType = response.headers.get("content-type") || "application/pdf"
  if (!contentType.toLowerCase().includes("pdf")) {
    throw new Error("Source did not return a PDF")
  }

  const buffer = await response.arrayBuffer()
  const checksum = createHash("sha256").update(Buffer.from(buffer)).digest("hex")
  const fileName = `${params.literatureId}.pdf`
  const storagePath = createLiteraturePdfPath(params.literatureId, fileName)
  const storage = params.supabase.storage.from(getLiteratureStorageBucket())

  const { error: uploadError } = await storage.upload(storagePath, buffer, {
    cacheControl: "3600",
    upsert: false,
    contentType: "application/pdf",
  })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data: urlData } = storage.getPublicUrl(storagePath)
  const { error: updateError } = await params.supabase
    .from("literature_reviews")
    .update({
      pdf_file_url: urlData.publicUrl,
      pdf_file_name: clampText(fileName, "pdf_file_name"),
      pdf_file_size: buffer.byteLength,
      pdf_file_type: clampText("application/pdf", "pdf_file_type"),
      pdf_storage_path: clampText(storagePath, "pdf_storage_path"),
      pdf_uploaded_at: new Date().toISOString(),
      pdf_checksum: clampText(checksum, "pdf_checksum"),
      pdf_match_source: clampText("manual_new_record_creation", "pdf_match_source"),
      pdf_metadata: {
        imported_from_search: true,
        source_url: params.pdfUrl,
      },
    })
    .eq("id", params.literatureId)

  if (updateError) {
    await storage.remove([storagePath])
    throw new Error(updateError.message)
  }
}

export async function savePaperToRepository(paper: SearchPaper) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()

    const normalizedDoi = normalizeDoi(paper.doi)
    let duplicateQuery = supabase
      .from("literature_reviews")
      .select("id")
      .limit(1)

    if (normalizedDoi) {
      duplicateQuery = duplicateQuery.eq("doi", normalizedDoi)
    } else if (paper.pmid) {
      duplicateQuery = duplicateQuery.eq("pmid", paper.pmid)
    } else {
      duplicateQuery = duplicateQuery.eq("title", paper.title).eq("publication_year", paper.year)
    }

    const { data: existing } = await duplicateQuery.maybeSingle()
    if (existing) {
      return { success: false, error: "Paper already exists in repository" }
    }

    // Insert into literature_reviews table
    const { data, error: insertError } = await supabase
      .from("literature_reviews")
      .insert({
        title: paper.title,
        authors: paper.authors.join(', '),
        journal: paper.journal,
        publication_year: paper.year,
        doi: normalizedDoi || null,
        pmid: paper.pmid || null,
        abstract: paper.abstract,
        status: "saved",
        created_by: user.id,
        organization_id: profile?.organization_id,
      })
      .select()
      .single()

    if (insertError) {
      return { success: false, error: insertError.message }
    }

    let warning: string | null = null
    if (paper.isOpenAccess && paper.pdfUrl) {
      try {
        await attachOpenAccessPdf({
          supabase,
          literatureId: data.id,
          pdfUrl: paper.pdfUrl,
        })
      } catch (pdfError: any) {
        warning = pdfError.message || "Paper saved but PDF import failed"
      }
    }

    // Revalidate the literature reviews page
    revalidatePath('/literature-reviews')

    return { success: true, data, warning }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to save paper" }
  }
}
