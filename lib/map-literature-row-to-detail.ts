/** Map a `literature_reviews` row (e.g. from Supabase) into LiteratureDetailView input shape. */
export function mapLiteratureRowToDetailViewData(row: Record<string, unknown>) {
  const p = row.created_by_profile as
    | { first_name: string; last_name: string; email: string }
    | null
    | undefined

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    authors: (row.authors as string | null) ?? null,
    journal: (row.journal as string | null) ?? null,
    publication_year: (row.publication_year as number | null) ?? null,
    doi: (row.doi as string | null) ?? null,
    pmid: (row.pmid as string | null) ?? null,
    status: String(row.status ?? "saved"),
    relevance_rating: (row.relevance_rating as number | null) ?? null,
    abstract: (row.abstract as string | null) ?? null,
    keywords: (row.keywords as string[] | null) ?? null,
    personal_notes: (row.personal_notes as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    volume: (row.volume as string | null) ?? null,
    issue: (row.issue as string | null) ?? null,
    pages: (row.pages as string | null) ?? null,
    pdf_file_url: (row.pdf_file_url as string | null) ?? null,
    pdf_file_name: (row.pdf_file_name as string | null) ?? null,
    pdf_file_size: (row.pdf_file_size as number | null) ?? null,
    pdf_file_type: (row.pdf_file_type as string | null) ?? null,
    pdf_storage_path: (row.pdf_storage_path as string | null) ?? null,
    pdf_uploaded_at: (row.pdf_uploaded_at as string | null) ?? null,
    pdf_checksum: (row.pdf_checksum as string | null) ?? null,
    pdf_match_source: (row.pdf_match_source as string | null) ?? null,
    pdf_metadata: (row.pdf_metadata as Record<string, unknown> | null) ?? null,
    pdf_import_status: (row.pdf_import_status as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    project: (row.project as { id: string; name: string } | null) ?? null,
    experiment: (row.experiment as { id: string; name: string } | null) ?? null,
    created_by_profile: p
      ? { first_name: p.first_name, last_name: p.last_name, email: p.email }
      : { first_name: "", last_name: "", email: "" },
  }
}
