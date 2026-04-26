"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import {
  createSampleFileStoragePath,
  USER_STORAGE_BUCKET,
} from "@/lib/user-storage-bucket"
import {
  inferSampleFileKind,
  isAllowedSampleMolecularFile,
  parseSequenceText,
  shouldParseSequenceTextOnUpload,
  type SampleFileKind,
} from "@/lib/sample-molecular"
import { SamplePlasmidEditor } from "./sample-plasmid-editor"
import { SampleProteinViewer } from "./sample-protein-viewer"
import { Dna, Eye, FileCode2, Upload } from "lucide-react"

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
      return "PDB / structure"
    case "sequence":
      return "Sequence"
    default:
      return "Other"
  }
}

export function SampleMolecularFilesTab({ sampleId, initialFiles }: SampleMolecularFilesTabProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState(initialFiles)
  const [selectedId, setSelectedId] = useState(initialFiles[0]?.id ?? "")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedId) ?? files[0] ?? null,
    [files, selectedId]
  )

  const getFileUrl = useCallback((file: SampleMolecularFile) => {
    const supabase = createClient()
    return supabase.storage.from(USER_STORAGE_BUCKET).getPublicUrl(file.storage_path).data.publicUrl
  }, [])

  const refreshFiles = useCallback(async () => {
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from("sample_files")
      .select("*")
      .eq("sample_id", sampleId)
      .order("created_at", { ascending: false })

    if (fetchError) throw fetchError
    setFiles((data ?? []) as SampleMolecularFile[])
    setSelectedId((current) => current || data?.[0]?.id || "")
  }, [sampleId])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (!isAllowedSampleMolecularFile(file.name, file.type)) {
      setError("Unsupported file type. Use plasmid, sequence, PDB, CIF/mmCIF, JSON, or text files.")
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
      const storagePath = createSampleFileStoragePath(profile.organization_id, sampleId, sampleFileId, file.name)
      const { error: uploadError } = await supabase.storage.from(USER_STORAGE_BUCKET).upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      })
      if (uploadError) throw uploadError

      const parsedMetadata: Record<string, any> = {
        original_name: file.name,
        upload_date: new Date().toISOString(),
      }

      const kind = inferSampleFileKind(file.name, file.type)
      if (kind === "plasmid" || kind === "sequence") {
        if (shouldParseSequenceTextOnUpload(file.name)) {
          const text = await file.text()
          parsedMetadata.sequenceData = parseSequenceText(file.name, text)
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
      toast({ title: "Sequence saved", description: "The editable plasmid data was updated." })
    },
    [toast]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Molecular files</h2>
          <p className="text-sm text-muted-foreground">
            Upload plasmids, sequences, and PDB/CIF structures for this sample.
          </p>
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".gb,.gbk,.genbank,.fasta,.fa,.fna,.dna,.json,.pdb,.cif,.mmcif,.txt"
            onChange={handleUpload}
          />
          <Button type="button" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading..." : "Upload file"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {files.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2 min-w-0">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => setSelectedId(file.id)}
                className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50 ${
                  selectedFile?.id === file.id ? "border-primary bg-primary/5" : "bg-card"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    {file.file_kind === "protein_structure" ? (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    ) : file.file_kind === "plasmid" ? (
                      <Dna className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FileCode2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{file.file_name}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{fileKindLabel(file.file_kind)}</Badge>
                      <Badge variant="outline">{formatFileSize(file.file_size)}</Badge>
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Viewer</CardTitle>
              <CardDescription className="truncate">
                {selectedFile?.file_name ?? "Select a molecular file"}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {selectedFile?.file_kind === "protein_structure" ? (
                <SampleProteinViewer fileName={selectedFile.file_name} fileUrl={getFileUrl(selectedFile)} />
              ) : selectedFile?.file_kind === "plasmid" || selectedFile?.file_kind === "sequence" ? (
                <SamplePlasmidEditor
                  fileName={selectedFile.file_name}
                  fileUrl={getFileUrl(selectedFile)}
                  parsedMetadata={selectedFile.parsed_metadata ?? {}}
                  viewerState={selectedFile.viewer_state ?? {}}
                  onSave={(payload) => saveViewerState(selectedFile.id, payload)}
                />
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Preview is not available for this file type.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <Dna className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
            <p className="text-sm font-medium">No molecular files yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a plasmid map, sequence file, or PDB structure to view it here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
