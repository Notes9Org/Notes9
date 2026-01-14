'use server'

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { SearchPaper } from "@/types/paper-search"

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

    // Insert into literature_reviews table
    const { data, error: insertError } = await supabase
      .from("literature_reviews")
      .insert({
        title: paper.title,
        authors: paper.authors.join(', '),
        journal: paper.journal,
        publication_year: paper.year,
        doi: paper.doi || null,
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

    // Revalidate the literature reviews page
    revalidatePath('/literature-reviews')

    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to save paper" }
  }
}

