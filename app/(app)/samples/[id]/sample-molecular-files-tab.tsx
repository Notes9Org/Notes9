"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  createSampleFileSignedUrl,
  createSampleFileStoragePath,
  USER_STORAGE_BUCKET,
} from "@/lib/user-storage-bucket"
import {
  inferSampleFileKind,
  isAllowedSampleMolecularFile,
  looksLikeBinarySnapGeneBlob,
  molecularFileFormatLabel,
  parseSequenceText,
  shouldParseSequenceTextOnUpload,
  type SampleFileKind,
} from "@/lib/sample-molecular"
import { SamplePlasmidViewer, type PlasmidAlignmentSource } from "./sample-plasmid-viewer"
import { SampleProteinViewer, type ProteinSuperpositionSource } from "./sample-protein-viewer"
import {
  Atom,
  Copy,
  Dna,
  Eye,
  FileCode2,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react"

export type SampleMolecularFile = {
  id: string
  sample_id: string
  file_kind: SampleFileKind
  file_name: string
  file_type: string | null
  file_size: number | null
  storage_path: string
  parsed_metadata: Record<string, any>
  viewer_state: Record<string, any>
  created_at: string
}

type SampleMolecularFilesTabProps = {
  sampleId: string
  initialFiles: SampleMolecularFile[]
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // 50 MB

function formatFileSize(bytes: number | null) {
  if (!bytes) return "0 KB"
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileKindLabel(kind: SampleFileKind) {
  switch (kind) {
    case "plasmid":
      return "Plasmid"
    case "protein_structure":
      return "Structure"
    case "sequence":
      return "Sequence"
    default:
      return "Other"
  }
}

function FileKindIcon({ kind, className }: { kind: SampleFileKind; className?: string }) {
  if (kind === "protein_structure") return <Atom className={className} />
  if (kind === "plasmid") return <Dna className={className} />
  if (kind === "sequence") return <FileCode2 className={className} />
  return <FileCode2 className={className} />
}

export function SampleMolecularFilesTab({ sampleId, initialFiles }: SampleMolecularFilesTabProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState(initialFiles)
  const [selectedId, setSelectedId] = useState(initialFiles[0]?.id ?? "")
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [signedUrlLoading, setSignedUrlLoading] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<SampleMolecularFile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [listOpen, setListOpen] = useState(true)

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedId) ?? files[0] ?? null,
    [files, selectedId]
  )

  // Resolve a signed URL for the active file whenever selection changes.
  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (!selectedFile) {
        setSignedUrl(null)
        return
      }
      setSignedUrlLoading(true)
      setSignedUrl(null)
      const supabase = createClient()
      const url = await createSampleFileSignedUrl(supabase, selectedFile.storage_path, 3600)
      if (cancelled) return
      setSignedUrl(url)
      setSignedUrlLoading(false)
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [selectedFile?.id, selectedFile?.storage_path])

  const refreshFiles = useCallback(async () => {
    setRefreshing(true)
    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from("sample_files")
        .select("*")
        .eq("sample_id", sampleId)
        .order("created_at", { ascending: false })

      if (fetchError) throw fetchError
      const next = (data ?? []) as SampleMolecularFile[]
      setFiles(next)
      setSelectedId((current) => current || next[0]?.id || "")
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Could not refresh files.")
    } finally {
      setRefreshing(false)
    }
  }, [sampleId])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (!isAllowedSampleMolecularFile(file.name, file.type)) {
      setError("Unsupported file type. Use plasmid, sequence, PDB, CIF/mmCIF, JSON, or text files.")
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `File is too large (${formatFileSize(file.size)}). Maximum allowed is ${formatFileSize(MAX_UPLOAD_BYTES)}.`
      )
      return
    }

    setUploading(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single()
      if (!profile?.organization_id) throw new Error("Could not resolve your organization for storage.")

      const sampleFileId = crypto.randomUUID()
      const storagePath = createSampleFileStoragePath(
        profile.organization_id,
        sampleId,
        sampleFileId,
        file.name
      )
      const { error: uploadError } = await supabase.storage
        .from(USER_STORAGE_BUCKET)
        .upload(storagePath, file, { cacheControl: "3600", upsert: false })
      if (uploadError) throw uploadError

      const parsedMetadata: Record<string, any> = {
        original_name: file.name,
        upload_date: new Date().toISOString(),
      }

      const kind = inferSampleFileKind(file.name, file.type)
      if (kind === "plasmid" || kind === "sequence") {
        if (shouldParseSequenceTextOnUpload(file.name)) {
          try {
            const text = await file.text()
            parsedMetadata.sequenceData = parseSequenceText(file.name, text)
          } catch {
            parsedMetadata.parse_warning = "Could not parse text on upload."
          }
        } else {
          parsedMetadata.parse_deferred = "Binary SnapGene .dna file will be parsed in the plasmid viewer."
        }
      }

      const { error: dbError } = await supabase.from("sample_files").insert({
        id: sampleFileId,
        sample_id: sampleId,
        file_kind: kind,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        storage_path: storagePath,
        parsed_metadata: parsedMetadata,
        viewer_state: {},
        created_by: user.id,
      })
      if (dbError) throw dbError

      await refreshFiles()
      setSelectedId(sampleFileId)
      toast({ title: "File uploaded", description: `${file.name} is linked to this sample.` })
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Could not upload file.")
    } finally {
      setUploading(false)
    }
  }

  const saveViewerState = useCallback(
    async (
      fileId: string,
      payload: { parsedMetadata: Record<string, any>; viewerState: Record<string, any> }
    ) => {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from("sample_files")
        .update({
          parsed_metadata: payload.parsedMetadata,
          viewer_state: payload.viewerState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fileId)
      if (updateError) throw updateError
      setFiles((current) =>
        current.map((file) =>
          file.id === fileId
            ? { ...file, parsed_metadata: payload.parsedMetadata, viewer_state: payload.viewerState }
            : file
        )
      )
      toast({ title: "Sequence saved", description: "The construct viewer state was updated." })
    },
    [toast]
  )

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const supabase = createClient()
      const { error: storageError } = await supabase.storage
        .from(USER_STORAGE_BUCKET)
        .remove([pendingDelete.storage_path])
      if (storageError) {
        // Continue, since DB row removal still useful even if storage object missing.
        console.warn("Storage remove failed", storageError)
      }
      const { error: dbError } = await supabase
        .from("sample_files")
        .delete()
        .eq("id", pendingDelete.id)
      if (dbError) throw dbError
      setFiles((current) => current.filter((file) => file.id !== pendingDelete.id))
      setSelectedId((current) => (current === pendingDelete.id ? "" : current))
      toast({
        title: "File deleted",
        description: `${pendingDelete.file_name} was removed from this sample.`,
      })
      setPendingDelete(null)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Could not delete file.")
    } finally {
      setDeleting(false)
    }
  }, [pendingDelete, toast])

  const proteinSources: ProteinSuperpositionSource[] = useMemo(() => {
    if (!selectedFile) return []
    return files
      .filter((file) => file.id !== selectedFile.id && file.file_kind === "protein_structure")
      .map((file) => ({ id: file.id, fileName: file.file_name }))
  }, [files, selectedFile])

  const resolveProteinSourceUrl = useCallback(
    async (sourceId: string): Promise<{ url: string; fileName: string } | null> => {
      const file = files.find((f) => f.id === sourceId)
      if (!file) return null
      const supabase = createClient()
      const url = await createSampleFileSignedUrl(supabase, file.storage_path, 3600)
      if (!url) return null
      return { url, fileName: file.file_name }
    },
    [files]
  )

  const alignmentSources: PlasmidAlignmentSource[] = useMemo(() => {
    if (!selectedFile) return []
    return files
      .filter(
        (file) =>
          file.id !== selectedFile.id &&
          (file.file_kind === "plasmid" || file.file_kind === "sequence")
      )
      .map((file) => ({
        id: file.id,
        fileName: file.file_name,
        sequence: file.parsed_metadata?.sequenceData?.sequence,
      }))
  }, [files, selectedFile])

  const resolveSourceSequence = useCallback(
    async (sourceId: string): Promise<string> => {
      const file = files.find((f) => f.id === sourceId)
      if (!file) return ""
      const cached = file.parsed_metadata?.sequenceData?.sequence
      if (typeof cached === "string" && cached.length > 0) return cached
      const supabase = createClient()
      const url = await createSampleFileSignedUrl(supabase, file.storage_path, 600)
      if (!url) return ""
      const response = await fetch(url)
      if (!response.ok) return ""
      const ext = file.file_name.split(".").pop()?.toLowerCase() ?? ""
      try {
        if (ext === "dna") {
          const blob = await response.blob()
          const { anyToJson } = await import("@teselagen/bio-parsers")
          if (await looksLikeBinarySnapGeneBlob(blob)) {
            const fileObj = new File([blob], file.file_name, {
              type: blob.type || "application/octet-stream",
            })
            const parsed = await anyToJson(fileObj, {
              fileName: file.file_name,
              isProtein: false,
            } as any)
            const first = Array.isArray(parsed) ? parsed[0] : parsed
            return first?.parsedSequence?.sequence ?? ""
          }
          const text = await blob.text()
          try {
            const parsed = await anyToJson(text, {
              fileName: file.file_name.replace(/\.dna$/i, ".txt"),
            } as any)
            const first = Array.isArray(parsed) ? parsed[0] : parsed
            const seq = first?.parsedSequence?.sequence
            if (typeof seq === "string" && seq.length) return seq
          } catch {
            /* fall through */
          }
          const fallback = parseSequenceText(file.file_name, text)
          return (fallback?.sequence as string) ?? ""
        }
        const text = await response.text()
        if (shouldParseSequenceTextOnUpload(file.file_name)) {
          try {
            const { anyToJson } = await import("@teselagen/bio-parsers")
            const parsed = await anyToJson(text, { fileName: file.file_name } as any)
            const first = Array.isArray(parsed) ? parsed[0] : parsed
            const seq = first?.parsedSequence?.sequence
            if (typeof seq === "string" && seq.length) return seq
          } catch {
            const fallback = parseSequenceText(file.file_name, text)
            return (fallback?.sequence as string) ?? ""
          }
        }
        return text
      } catch {
        return ""
      }
    },
    [files]
  )

  const copyShareLink = useCallback(async () => {
    if (!signedUrl) return
    try {
      await navigator.clipboard.writeText(signedUrl)
      toast({ title: "Link copied", description: "Signed URL copied to clipboard (1h validity)." })
    } catch {
      setError("Could not copy link.")
    }
  }, [signedUrl, toast])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted/40">
            <Dna className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Molecular files</h2>
            <p className="text-sm text-muted-foreground">
              Upload plasmids, sequences, and PDB/CIF structures for this sample.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refreshFiles}
            disabled={refreshing || uploading}
            aria-label="Refresh files"
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".gb,.gbk,.genbank,.fasta,.fa,.fna,.dna,.json,.pdb,.cif,.mmcif,.ent,.txt"
            onChange={handleUpload}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {uploading ? "Uploading..." : "Upload file"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError(null)}
              className="shrink-0 rounded-sm p-0.5 hover:bg-destructive/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      {files.length > 0 ? (
        <div
          className={`grid gap-4 ${
            listOpen ? "lg:grid-cols-[300px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)]"
          }`}
        >
          {listOpen ? (
          <Card className="min-w-0 p-0">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">Files ({files.length})</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setListOpen(false)}
                aria-label="Hide file list"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="h-[640px] max-h-[640px]">
              <div className="space-y-1 p-2">
                {files.map((file) => {
                  const active = selectedFile?.id === file.id
                  return (
                    <div key={file.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => setSelectedId(file.id)}
                        className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50 ${
                          active ? "border-primary bg-primary/5" : "border-transparent bg-card"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                            <FileKindIcon kind={file.file_kind} className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {file.file_name}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-1.5">
                              <Badge variant="secondary">{fileKindLabel(file.file_kind)}</Badge>
                              <Badge variant="outline">{formatFileSize(file.file_size)}</Badge>
                            </span>
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${file.file_name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setPendingDelete(file)
                        }}
                        className="absolute right-2 top-2 hidden rounded-sm p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:inline-flex"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </Card>
          ) : null}

          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="border-b bg-muted/30 px-4 py-3.5 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
                  {!listOpen ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 gap-2.5 whitespace-nowrap rounded-md border-dashed px-3 text-xs font-semibold leading-none tracking-tight"
                      onClick={() => setListOpen(true)}
                      aria-label={`Show molecular files list (${files.length} files)`}
                      title="Open the files sidebar"
                    >
                      <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
                      <span className="inline-flex items-baseline gap-1">
                        <span>Files</span>
                        {files.length > 0 ? (
                          <span className="font-normal tabular-nums text-muted-foreground">
                            ({files.length})
                          </span>
                        ) : null}
                      </span>
                    </Button>
                  ) : null}
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <CardTitle
                      className={`min-w-0 flex-1 text-base font-semibold leading-tight tracking-tight line-clamp-2 break-words sm:line-clamp-none ${
                        selectedFile ? "text-foreground" : "text-muted-foreground"
                      }`}
                      title={selectedFile?.file_name}
                    >
                      {selectedFile?.file_name ?? "Select a molecular file"}
                    </CardTitle>
                    {selectedFile ? (
                      <Badge
                        variant="outline"
                        className="h-5 shrink-0 px-2 py-0 font-mono text-[10px] font-semibold uppercase leading-none tracking-wide"
                      >
                        {molecularFileFormatLabel(selectedFile.file_name)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                {signedUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-mr-1 h-9 shrink-0 self-start sm:self-center"
                    onClick={copyShareLink}
                    aria-label="Copy signed link"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy link
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="min-w-0 p-4">
              {!selectedFile ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Select a file to view it here.
                </div>
              ) : signedUrlLoading || !signedUrl ? (
                <div className="flex h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing secure viewer...
                </div>
              ) : selectedFile.file_kind === "protein_structure" ? (
                <SampleProteinViewer
                  fileName={selectedFile.file_name}
                  fileUrl={signedUrl}
                  superpositionSources={proteinSources}
                  onResolveSourceUrl={resolveProteinSourceUrl}
                />
              ) : selectedFile.file_kind === "plasmid" || selectedFile.file_kind === "sequence" ? (
                <SamplePlasmidViewer
                  fileName={selectedFile.file_name}
                  fileUrl={signedUrl}
                  parsedMetadata={selectedFile.parsed_metadata ?? {}}
                  viewerState={selectedFile.viewer_state ?? {}}
                  onSave={(payload) => saveViewerState(selectedFile.id, payload)}
                  alignmentSources={alignmentSources}
                  onResolveSourceSequence={resolveSourceSequence}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <Eye className="h-6 w-6" />
                  <p>Preview is not available for this file type.</p>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={signedUrl} download={selectedFile.file_name}>
                      Download file
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <Dna className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No molecular files yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a plasmid map, sequence file, or PDB structure to view it here.
            </p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete molecular file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium">{pendingDelete?.file_name}</span> and
              its viewer state. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
