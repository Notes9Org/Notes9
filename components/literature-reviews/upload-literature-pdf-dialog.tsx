"use client"

import React, { useMemo, useState, useEffect } from "react"
import { Loader2, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

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
import { FileDropzone } from "@/components/ui/file-dropzone"
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

  // Auto-analyze when file is selected
  useEffect(() => {
    if (file && !analysis && !loading) {
      analyzeFile()
    }
  }, [file, analysis, loading])

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
      const targetId = selectedExistingId ?? currentLiterature?.id
      if (targetId) {
        formData.set("currentLiteratureId", targetId)
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

    // Validation for new records
    if (action === "create_record_and_attach") {
      if (!createDraft.project_id || !createDraft.experiment_id) {
        toast({
          title: "Missing association",
          description: "Please link this paper to a Project and an Experiment before saving.",
          variant: "destructive",
        })
        return
      }
    }

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
                project_id: createDraft.project_id,
                experiment_id: createDraft.experiment_id,
              }
            : undefined,
        tempUploadPath: analysis.tempUploadPath,
        fileName: file.name,
        fileSize: analysis.fileSize ?? file.size,
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
    } finally {
      setLoading(false)
    }
  }

  const renderAnalysisState = () => {
    if (!analysis) return null

    const extracted = analysis.extractedMetadata

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border bg-muted/20 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold bg-primary/10 text-primary border-primary/20">
                {analysis.status}
              </Badge>
              {analysis.matchSource && (
                <Badge variant="outline" className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  {analysis.matchSource}
                </Badge>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
            <div className="col-span-2 pb-0.5 border-b border-border/40">
              <p className="font-bold text-muted-foreground uppercase text-[9px] mb-0.5">Detected Title</p>
              <p className="font-semibold line-clamp-1 leading-tight text-xs">{extracted.title ?? "Unknown Title"}</p>
            </div>
            <div className="col-span-2 pb-0.5 border-b border-border/40">
              <p className="font-bold text-muted-foreground uppercase text-[9px] mb-0.5">Authors & Source</p>
              <p className="font-medium text-foreground truncate">{extracted.authors || "Unknown Authors"}</p>
              <p className="text-muted-foreground italic truncate mt-0.5">{extracted.journal || "—"}</p>
            </div>
            <div>
              <p className="font-bold text-muted-foreground uppercase text-[9px] mb-0.5">DOI/PMID</p>
              <p className="font-mono text-primary/80 truncate">{extracted.doi ?? extracted.pmid ?? "—"}</p>
            </div>
            <div>
              <p className="font-bold text-muted-foreground uppercase text-[9px] mb-0.5">Publication</p>
              <p className="font-medium text-foreground">{extracted.publicationYear ?? "—"}{extracted.pageCount ? ` • ${extracted.pageCount}p` : ""}</p>
            </div>
          </div>
        </div>

        {(analysis.status === "duplicate" || analysis.status === "matched") && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs">{analysis.status === "duplicate" ? "⚠️" : "✨"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-tight truncate">
                  {analysis.status === "duplicate" ? "Duplicate record" : "Matched existing"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate font-medium">
                  {(analysis.duplicateRecord ?? analysis.matchCandidates[0])?.title}
                </p>
              </div>
              {analysis.status === "duplicate" && analysis.duplicateRecord && (
                <Button variant="link" className="h-auto p-0 text-[10px] font-bold text-primary shrink-0" asChild>
                  <Link href={`/literature-reviews/${analysis.duplicateRecord.id}`}>View</Link>
                </Button>
              )}
            </div>
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
      <DialogContent className={cn(
        "overflow-hidden flex flex-col p-0 border-none shadow-2xl bg-background/95 backdrop-blur-xl transition-all duration-300 max-h-[85vh]",
        analysis ? "sm:max-w-xl" : "sm:max-w-md"
      )}>
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-lg font-bold tracking-tight">Add Paper PDF</DialogTitle>
          <DialogDescription className="text-muted-foreground/80 text-xs">
            Directly from file analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 pt-4">
          {!analysis ? (
            <FileDropzone 
              onFilesDrop={(files) => setFile(files[0] || null)}
              accept={["application/pdf"]}
              description="Drop PDF to begin"
              className="w-full"
            >
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-2xl -z-10" />
                {!file ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-muted-foreground/20 rounded-2xl hover:border-primary/40 transition-colors cursor-pointer" onClick={() => document.getElementById('literature-pdf-file')?.click()}>
                    <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="size-6 text-primary" />
                    </div>
                    <p className="text-sm font-semibold">Click or drag PDF</p>
                    <p className="text-xs text-muted-foreground mt-1">Files up to 32MB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-primary/20 bg-primary/5 rounded-2xl">
                    <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                      {loading ? <Loader2 className="size-6 text-primary animate-spin" /> : <Upload className="size-6 text-primary" />}
                    </div>
                    <p className="text-sm font-semibold truncate max-w-full px-4">{file.name}</p>
                    <button onClick={() => setFile(null)} className="text-xs text-muted-foreground hover:text-destructive mt-2 transition-colors">Change file</button>
                  </div>
                )}
                <input
                  id="literature-pdf-file"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
              {currentLiterature && !file && (
                <div className="mt-4 p-3 rounded-xl bg-muted/30 text-xs text-muted-foreground border border-border/50">
                  Target: <span className="font-semibold text-foreground">{currentLiterature.title}</span>
                </div>
              )}
            </FileDropzone>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {renderAnalysisState()}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 pt-2">
          {analysis && (
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 rounded-xl font-semibold shadow-lg shadow-primary/20"
              onClick={() => finalize(finalizeAction)}
              disabled={
                loading ||
                (finalizeAction !== "create_record_and_attach" && !selectedExistingId) ||
                (finalizeAction === "create_record_and_attach" && !(saveMode === "naming_convention" ? displayTitle : createDraft.title))
              }
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {analysis.status === "duplicate" ? "Replace PDF" : "Save and Attach"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
