"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  project_id: string
  experiment_id: string
}

interface LiteratureRecordCreateFormProps {
  value: NewLiteratureRecordDraft
  onChange: (next: NewLiteratureRecordDraft) => void
  extractedMetadata: LiteraturePdfExtractedMetadata
  projects: { id: string; name: string }[]
  experiments: { id: string; name: string; project_id: string }[]
}

export function LiteratureRecordCreateForm({
  value,
  onChange,
  extractedMetadata,
  projects,
  experiments,
}: LiteratureRecordCreateFormProps) {
  const update = (key: keyof NewLiteratureRecordDraft, nextValue: string) => {
    if (key === "project_id") {
      const nextProjectId = nextValue
      const experimentStillValid = experiments.some(
        (experiment) =>
          experiment.id === value.experiment_id && experiment.project_id === nextProjectId
      )
      onChange({
        ...value,
        project_id: nextProjectId,
        experiment_id: experimentStillValid ? value.experiment_id : "",
      })
      return
    }

    onChange({ ...value, [key]: nextValue })
  }

  const filteredExperiments = value.project_id
    ? experiments.filter((experiment) => experiment.project_id === value.project_id)
    : []

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
      <div className="rounded-lg border p-4">
        <div className="mb-3">
          <Label className="text-sm font-medium">Link to research</Label>
          <p className="text-xs text-muted-foreground">
            Optionally connect this paper to a project and one of its experiments.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="new-project-id">Project</Label>
            <Select
              value={value.project_id || "none"}
              onValueChange={(next) => update("project_id", next === "none" ? "" : next)}
            >
              <SelectTrigger id="new-project-id">
                <SelectValue placeholder="Select project (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-experiment-id">Experiment</Label>
            <Select
              value={value.experiment_id || "none"}
              onValueChange={(next) => update("experiment_id", next === "none" ? "" : next)}
              disabled={!value.project_id}
            >
              <SelectTrigger id="new-experiment-id">
                <SelectValue
                  placeholder={
                    value.project_id
                      ? "Select experiment (optional)"
                      : "Select project first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No experiment</SelectItem>
                {filteredExperiments.map((experiment) => (
                  <SelectItem key={experiment.id} value={experiment.id}>
                    {experiment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
