"use client"

import { useMemo, useState } from "react"
import { Loader2, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { LiteratureRecordCreateForm, type NewLiteratureRecordDraft } from "@/components/literature-reviews/literature-record-create-form"
import { LiteratureRecordPicker } from "@/components/literature-reviews/literature-record-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import type { AnalyzePdfResponse, LiteraturePdfExtractedMetadata, LiteratureRecordSummary, SaveMode } from "@/types/literature-pdf"

interface UploadLiteraturePdfDialogProps {
  literatureReviews: LiteratureRecordSummary[]
  projects?: { id: string; name: string }[]
  experiments?: { id: string; name: string; project_id: string }[]
  currentLiterature?: LiteratureRecordSummary | null
  triggerLabel?: string
}

function draftFromMetadata(metadata: LiteraturePdfExtractedMetadata): NewLiteratureRecordDraft {
  return {
    title: metadata.title ?? "",
    authors: metadata.authors ?? "",
    journal: metadata.journal ?? "",
    publication_year: metadata.publicationYear ? String(metadata.publicationYear) : "",
    doi: metadata.doi ?? "",
    pmid: metadata.pmid ?? "",
    abstract: metadata.abstract ?? "",
    personal_notes: "",
    url: metadata.url ?? "",
    project_id: "",
    experiment_id: "",
  }
}

export function UploadLiteraturePdfDialog({
  literatureReviews,
  projects = [],
  experiments = [],
  currentLiterature = null,
  triggerLabel = "Upload PDF",
}: UploadLiteraturePdfDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [analysis, setAnalysis] = useState<AnalyzePdfResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [saveMode, setSaveMode] = useState<SaveMode>("naming_convention")
  const [destinationMode, setDestinationMode] = useState<"existing" | "new">("existing")
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(currentLiterature?.id ?? null)
  const [displayTitle, setDisplayTitle] = useState("")
  const [createDraft, setCreateDraft] = useState<NewLiteratureRecordDraft>(draftFromMetadata({
    title: "",
    authors: "",
    journal: "",
    publicationYear: null,
    doi: "",
    pmid: "",
    abstract: "",
    keywords: [],
    url: "",
    pageCount: null,
    previewText: "",
  }))

  const availableRecords = useMemo(
    () => analysis?.availableRecords ?? literatureReviews,
    [analysis, literatureReviews]
  )

  const resetState = () => {
    setFile(null)
    setAnalysis(null)
    setLoading(false)
    setSaveMode("naming_convention")
    setDestinationMode(currentLiterature ? "existing" : "existing")
    setSelectedExistingId(currentLiterature?.id ?? null)
    setDisplayTitle("")
    setCreateDraft(
      draftFromMetadata({
        title: "",
        authors: "",
        journal: "",
        publicationYear: null,
        doi: "",
        pmid: "",
        abstract: "",
        keywords: [],
        url: "",
        pageCount: null,
        previewText: "",
      })
    )
  }

  const analyzeFile = async () => {
    if (!file) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.set("file", file)
      if (currentLiterature?.id) {
        formData.set("currentLiteratureId", currentLiterature.id)
      }

      const response = await fetch("/api/literature/pdf/analyze", {
        method: "POST",
        body: formData,
      })
      const data = (await response.json()) as AnalyzePdfResponse & { error?: string }
      if (!response.ok) throw new Error(data.error ?? "Failed to analyze PDF")

      setAnalysis(data)
      setDisplayTitle(data.extractedMetadata.title ?? file.name.replace(/\.pdf$/i, ""))
      setCreateDraft(draftFromMetadata(data.extractedMetadata))
      if (data.status === "matched" && data.matchCandidates[0]) {
        setSelectedExistingId(data.matchCandidates[0].id)
      }
      if (data.status === "duplicate" && data.duplicateRecord) {
        setSelectedExistingId(data.duplicateRecord.id)
      }
      if (data.status === "unmatched") {
        setDestinationMode("new")
      }
    } catch (error: any) {
      toast({
        title: "PDF analysis failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const finalize = async (action: "attach_existing" | "replace_existing_pdf" | "create_record_and_attach") => {
    if (!analysis || !file) return
    setLoading(true)
    try {
      const payload = {
        action,
        saveMode,
        literatureId: action === "create_record_and_attach" ? undefined : selectedExistingId,
        newRecordData:
          action === "create_record_and_attach"
            ? {
                ...createDraft,
                title: saveMode === "naming_convention" ? displayTitle || createDraft.title : createDraft.title,
                publication_year: createDraft.publication_year
                  ? Number.parseInt(createDraft.publication_year, 10)
                  : null,
                project_id: createDraft.project_id || null,
                experiment_id: createDraft.experiment_id || null,
              }
            : undefined,
        tempUploadPath: analysis.tempUploadPath,
        fileName: file.name,
        checksum: analysis.checksum,
        extractedMetadata: {
          ...analysis.extractedMetadata,
          displayTitle: saveMode === "naming_convention" ? displayTitle : analysis.extractedMetadata.title,
        },
        confirmedClearAnnotations: action !== "replace_existing_pdf" ? false : true,
      }

      const response = await fetch("/api/literature/pdf/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Failed to save PDF")

      toast({
        title: "PDF saved",
        description: "The literature PDF has been attached successfully.",
      })
      setOpen(false)
      resetState()
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Failed to save PDF",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const renderAnalysisState = () => {
    if (!analysis) return null

    const extracted = analysis.extractedMetadata

    return (
      <div className="space-y-5">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {analysis.status}
            </Badge>
            {analysis.matchSource && <Badge variant="secondary">{analysis.matchSource}</Badge>}
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div><span className="font-medium">Detected title:</span> {extracted.title ?? "—"}</div>
            <div><span className="font-medium">DOI:</span> {extracted.doi ?? "—"}</div>
            <div><span className="font-medium">PMID:</span> {extracted.pmid ?? "—"}</div>
            <div><span className="font-medium">Pages:</span> {extracted.pageCount ?? "—"}</div>
          </div>
        </div>

        {(analysis.status === "duplicate" || analysis.status === "matched") && (
          <div className="rounded-lg border p-4">
            <div className="font-medium">
              {analysis.status === "duplicate" ? "Matching paper already has a PDF" : "Matched to an existing paper"}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {(analysis.duplicateRecord ?? analysis.matchCandidates[0])?.title}
            </div>
            {analysis.status === "duplicate" && analysis.duplicateRecord && (
              <Button variant="link" className="mt-2 h-auto px-0" asChild>
                <Link href={`/literature-reviews/${analysis.duplicateRecord.id}`}>Open existing record</Link>
              </Button>
            )}
          </div>
        )}

        {(analysis.status === "ambiguous" || analysis.status === "unmatched") && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-2">
              <Label>Save destination</Label>
              <RadioGroup value={destinationMode} onValueChange={(value) => setDestinationMode(value as "existing" | "new")}>
                <label className="flex items-center gap-3 rounded-md border p-3">
                  <RadioGroupItem value="existing" />
                  <span>Select existing record</span>
                </label>
                <label className="flex items-center gap-3 rounded-md border p-3">
                  <RadioGroupItem value="new" />
                  <span>Create new record</span>
                </label>
              </RadioGroup>
            </div>

            {destinationMode === "existing" ? (
              <LiteratureRecordPicker records={availableRecords} value={selectedExistingId} onChange={setSelectedExistingId} />
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Save mode</Label>
                  <RadioGroup value={saveMode} onValueChange={(value) => setSaveMode(value as SaveMode)}>
                    <label className="flex items-center gap-3 rounded-md border p-3">
                      <RadioGroupItem value="naming_convention" />
                      <span>Use my naming convention</span>
                    </label>
                    <label className="flex items-center gap-3 rounded-md border p-3">
                      <RadioGroupItem value="extract_pdf_metadata" />
                      <span>Extract details from PDF</span>
                    </label>
                  </RadioGroup>
                </div>

                {saveMode === "naming_convention" && (
                  <div className="space-y-2">
                    <Label htmlFor="display-title">Preferred display title</Label>
                    <Input id="display-title" value={displayTitle} onChange={(event) => setDisplayTitle(event.target.value)} />
                    <Label htmlFor="naming-notes">Notes</Label>
                    <Textarea
                      id="naming-notes"
                      rows={3}
                      value={createDraft.personal_notes}
                      onChange={(event) => setCreateDraft({ ...createDraft, personal_notes: event.target.value })}
                    />
                  </div>
                )}

                <LiteratureRecordCreateForm
                  value={createDraft}
                  onChange={setCreateDraft}
                  extractedMetadata={analysis.extractedMetadata}
                  projects={projects}
                  experiments={experiments}
                />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const selectedExistingRecord = availableRecords.find((record) => record.id === selectedExistingId)
  const finalizeAction =
    analysis?.status === "duplicate" || (!!selectedExistingRecord?.pdf_storage_path && destinationMode === "existing")
      ? "replace_existing_pdf"
      : destinationMode === "new"
      ? "create_record_and_attach"
      : "attach_existing"

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) resetState()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload literature PDF</DialogTitle>
          <DialogDescription>
            Upload, analyze, match, and attach a paper PDF to the right literature record.
          </DialogDescription>
        </DialogHeader>

        {!analysis ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="literature-pdf-file">PDF file</Label>
              <Input
                id="literature-pdf-file"
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            {currentLiterature && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                This upload will target <span className="font-medium text-foreground">{currentLiterature.title}</span> unless a duplicate conflict is found.
              </div>
            )}
          </div>
        ) : (
          renderAnalysisState()
        )}

        <DialogFooter>
          {!analysis ? (
            <Button onClick={analyzeFile} disabled={!file || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Analyze and match
            </Button>
          ) : (
            <Button
              onClick={() => finalize(finalizeAction)}
              disabled={
                loading ||
                (finalizeAction !== "create_record_and_attach" && !selectedExistingId) ||
                (finalizeAction === "create_record_and_attach" && !(saveMode === "naming_convention" ? displayTitle : createDraft.title))
              }
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {analysis.status === "duplicate" ? "Replace PDF" : "Save PDF"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
