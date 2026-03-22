"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { LiteraturePdfExtractedMetadata } from "@/types/literature-pdf"

export interface NewLiteratureRecordDraft {
  title: string
  authors: string
  journal: string
  publication_year: string
  doi: string
  pmid: string
  abstract: string
  personal_notes: string
  url: string
}

interface LiteratureRecordCreateFormProps {
  value: NewLiteratureRecordDraft
  onChange: (next: NewLiteratureRecordDraft) => void
  extractedMetadata: LiteraturePdfExtractedMetadata
}

export function LiteratureRecordCreateForm({
  value,
  onChange,
  extractedMetadata,
}: LiteratureRecordCreateFormProps) {
  const update = (key: keyof NewLiteratureRecordDraft, nextValue: string) => {
    onChange({ ...value, [key]: nextValue })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-title">Title</Label>
        <Input id="new-title" value={value.title} onChange={(event) => update("title", event.target.value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-authors">Authors</Label>
          <Input id="new-authors" value={value.authors} onChange={(event) => update("authors", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-journal">Journal</Label>
          <Input id="new-journal" value={value.journal} onChange={(event) => update("journal", event.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="new-year">Year</Label>
          <Input id="new-year" value={value.publication_year} onChange={(event) => update("publication_year", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-doi">DOI</Label>
          <Input id="new-doi" value={value.doi} onChange={(event) => update("doi", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-pmid">PMID</Label>
          <Input id="new-pmid" value={value.pmid} onChange={(event) => update("pmid", event.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-url">URL</Label>
        <Input id="new-url" value={value.url} onChange={(event) => update("url", event.target.value)} placeholder={extractedMetadata.url ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-abstract">Abstract</Label>
        <Textarea id="new-abstract" value={value.abstract} onChange={(event) => update("abstract", event.target.value)} rows={5} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-notes">Personal Notes</Label>
        <Textarea id="new-notes" value={value.personal_notes} onChange={(event) => update("personal_notes", event.target.value)} rows={4} />
      </div>
    </div>
  )
}
