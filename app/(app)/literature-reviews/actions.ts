'use server'

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { tryImportPdfForPaper } from "@/lib/literature-pdf-import"
import { SearchPaper } from "@/types/paper-search"
import { getLiteratureStorageBucket, normalizeDoi } from "@/lib/literature-pdf-storage"

export async function removeStagingLiterature(literatureId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false as const, error: "Not authenticated" }
    }

    const { data: row, error: fetchError } = await supabase
      .from("literature_reviews")
      .select("id, catalog_placement, created_by, pdf_storage_path")
      .eq("id", literatureId)
      .single()

    if (fetchError || !row) {
      return { success: false as const, error: "Record not found" }
    }
    if (row.created_by !== user.id || row.catalog_placement !== "staging") {
      return { success: false as const, error: "Not allowed to remove this staged item" }
    }

    if (row.pdf_storage_path) {
      await supabase.storage.from(getLiteratureStorageBucket()).remove([row.pdf_storage_path])
    }

    await supabase.from("literature_pdf_annotations").delete().eq("literature_review_id", literatureId)
    const { error: deleteError } = await supabase.from("literature_reviews").delete().eq("id", literatureId)

    if (deleteError) {
      return { success: false as const, error: deleteError.message }
    }

    revalidatePath("/literature-reviews")
    return { success: true as const }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove staged paper"
    return { success: false as const, error: message }
  }
}

export async function stagePaper(paper: SearchPaper) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false as const, error: "Not authenticated" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()

    const organizationId = profile?.organization_id ?? null
    const normalizedDoi = normalizeDoi(paper.doi)

    let existing = null as { id: string; catalog_placement: string } | null

    if (normalizedDoi) {
      let q = supabase.from("literature_reviews").select("id, catalog_placement").limit(1)
      if (organizationId) q = q.eq("organization_id", organizationId)
      const { data } = await q.eq("doi", normalizedDoi).maybeSingle()
      existing = data
    } else if (paper.pmid) {
      let q = supabase.from("literature_reviews").select("id, catalog_placement").limit(1)
      if (organizationId) q = q.eq("organization_id", organizationId)
      const { data } = await q.eq("pmid", paper.pmid).maybeSingle()
      existing = data
    } else {
      let q = supabase.from("literature_reviews").select("id, catalog_placement").limit(1)
      if (organizationId) q = q.eq("organization_id", organizationId)
      const { data } = await q.eq("title", paper.title).eq("publication_year", paper.year).maybeSingle()
      existing = data
    }

    if (existing?.catalog_placement === "repository") {
      return { success: false as const, error: "Paper already exists in repository" }
    }

    if (existing?.catalog_placement === "staging") {
      const { data: row } = await supabase
        .from("literature_reviews")
        .select("*")
        .eq("id", existing.id)
        .single()
      revalidatePath("/literature-reviews")
      return { success: true as const, data: row, alreadyStaged: true as const }
    }

    const { data: created, error: insertError } = await supabase
      .from("literature_reviews")
      .insert({
        title: paper.title,
        authors: paper.authors.join(", "),
        journal: paper.journal,
        publication_year: paper.year,
        doi: normalizedDoi || null,
        pmid: paper.pmid || null,
        abstract: paper.abstract,
        status: "saved",
        created_by: user.id,
        organization_id: organizationId,
        catalog_placement: "staging",
        pdf_import_status: "pending",
      })
      .select()
      .single()

    if (insertError || !created) {
      return { success: false as const, error: insertError?.message ?? "Failed to stage paper" }
    }

    const importResult = await tryImportPdfForPaper({
      supabase,
      userId: user.id,
      literatureId: created.id,
      paper,
      matchSource: "staging_pubmed_import",
    })

    revalidatePath("/literature-reviews")

    let warning: string | null = null
    if (!importResult.ok && importResult.reason === "fetch_failed" && "message" in importResult) {
      warning = importResult.message ?? "PDF could not be imported"
    } else if (!importResult.ok && importResult.reason === "no_open_access_pdf") {
      warning = "No PMC id for this PMID — automatic import only covers PubMed Central"
    } else if (!importResult.ok && importResult.reason === "not_pmc_open_access") {
      warning =
        "Not in the PubMed Central open-access subset — add the PDF yourself if you have access"
    } else if (!importResult.ok && importResult.reason === "oa_subset_check_failed") {
      warning = "Could not reach NLM to verify open-access status — try again or upload the PDF"
    }

    const { data: refreshed } = await supabase
      .from("literature_reviews")
      .select("*")
      .eq("id", created.id)
      .single()

    return { success: true as const, data: refreshed ?? created, warning, alreadyStaged: false as const }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to stage paper"
    return { success: false as const, error: message }
  }
}

export async function savePaperToRepository(
  paper: SearchPaper,
  options?: {
    projectId?: string | null
    experimentId?: string | null
    literatureId?: string | null
  }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()

    const organizationId = profile?.organization_id ?? null
    const normalizedDoi = normalizeDoi(paper.doi)

    if (options?.literatureId) {
      const { data: stagingRow, error: stagingErr } = await supabase
        .from("literature_reviews")
        .select("id, catalog_placement, created_by, organization_id")
        .eq("id", options.literatureId)
        .single()

      if (stagingErr || !stagingRow) {
        return { success: false, error: "Literature record not found" }
      }
      if (stagingRow.created_by !== user.id) {
        return { success: false, error: "Not allowed to modify this record" }
      }
      if (stagingRow.organization_id !== organizationId) {
        return { success: false, error: "Not allowed to modify this record" }
      }
      if (stagingRow.catalog_placement !== "staging") {
        return { success: false, error: "Paper is not in staging" }
      }

      const { data: promoted, error: updateError } = await supabase
        .from("literature_reviews")
        .update({
          catalog_placement: "repository",
          project_id: options?.projectId || null,
          experiment_id: options?.experimentId || null,
        })
        .eq("id", stagingRow.id)
        .select()
        .single()

      if (updateError || !promoted) {
        return { success: false, error: updateError?.message ?? "Failed to save paper" }
      }

      let warning: string | null = null
      const { data: withPdf } = await supabase
        .from("literature_reviews")
        .select("pdf_storage_path, pdf_import_status")
        .eq("id", stagingRow.id)
        .single()

      if (!withPdf?.pdf_storage_path && withPdf?.pdf_import_status !== "success") {
        const importResult = await tryImportPdfForPaper({
          supabase,
          userId: user.id,
          literatureId: stagingRow.id,
          paper,
          matchSource: "repository_pubmed_import",
        })
        if (!importResult.ok && importResult.reason === "fetch_failed" && "message" in importResult) {
          warning = importResult.message ?? "PDF import failed"
        } else if (!importResult.ok && importResult.reason === "no_open_access_pdf") {
          warning = "No PMC id for this PMID — automatic import only covers PubMed Central"
        } else if (!importResult.ok && importResult.reason === "not_pmc_open_access") {
          warning =
            "Not in the PubMed Central open-access subset — add the PDF yourself if you have access"
        } else if (!importResult.ok && importResult.reason === "oa_subset_check_failed") {
          warning =
            "Could not reach NLM to verify open-access status — try again or upload the PDF"
        }
      }

      revalidatePath("/literature-reviews")

      const { data: finalRow } = await supabase.from("literature_reviews").select("*").eq("id", stagingRow.id).single()

      return { success: true, data: finalRow ?? promoted, warning }
    }

    let duplicateQuery = supabase.from("literature_reviews").select("id, catalog_placement").limit(1)
    if (organizationId) duplicateQuery = duplicateQuery.eq("organization_id", organizationId)
    if (normalizedDoi) {
      duplicateQuery = duplicateQuery.eq("doi", normalizedDoi)
    } else if (paper.pmid) {
      duplicateQuery = duplicateQuery.eq("pmid", paper.pmid)
    } else {
      duplicateQuery = duplicateQuery.eq("title", paper.title).eq("publication_year", paper.year)
    }

    const { data: existingDup } = await duplicateQuery.maybeSingle()
    if (existingDup) {
      if (existingDup.catalog_placement === "staging") {
        return {
          success: false,
          error: "Paper is still in staging — open it from the Staging tab and save to repository",
        }
      }
      return { success: false, error: "Paper already exists in repository" }
    }

    const { data, error: insertError } = await supabase
      .from("literature_reviews")
      .insert({
        title: paper.title,
        authors: paper.authors.join(", "),
        journal: paper.journal,
        publication_year: paper.year,
        doi: normalizedDoi || null,
        pmid: paper.pmid || null,
        abstract: paper.abstract,
        project_id: options?.projectId || null,
        experiment_id: options?.experimentId || null,
        status: "saved",
        created_by: user.id,
        organization_id: organizationId,
        catalog_placement: "repository",
        pdf_import_status: "pending",
      })
      .select()
      .single()

    if (insertError) {
      return { success: false, error: insertError.message }
    }

    let warning: string | null = null
    const importResult = await tryImportPdfForPaper({
      supabase,
      userId: user.id,
      literatureId: data.id,
      paper,
      matchSource: "repository_pubmed_import",
    })
    if (!importResult.ok && importResult.reason === "fetch_failed" && "message" in importResult) {
      warning = importResult.message ?? "Paper saved but PDF import failed"
    } else if (!importResult.ok && importResult.reason === "no_open_access_pdf") {
      warning = "Paper saved; no PMC id for this PMID (automatic import is PubMed Central only)"
    } else if (!importResult.ok && importResult.reason === "not_pmc_open_access") {
      warning =
        "Paper saved; not in PMC open-access subset — add the PDF yourself if you have access"
    } else if (!importResult.ok && importResult.reason === "oa_subset_check_failed") {
      warning =
        "Paper saved; could not verify open-access with NLM — try import again or upload the PDF"
    }

    revalidatePath("/literature-reviews")

    const { data: refreshed } = await supabase.from("literature_reviews").select("*").eq("id", data.id).single()

    return { success: true, data: refreshed ?? data, warning }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save paper"
    return { success: false, error: message }
  }
}
