"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  Download,
  Trash2,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Eye,
  Plus,
  Loader2,
} from "lucide-react"
import { UploadFileDialog } from "./upload-file-dialog"
import {
  ExperimentDataTabularDialog,
  isTabularExperimentFile,
} from "@/components/experiments/experiment-data-tabular-dialog"
import { createEmptyWorkbookSnapshot } from "@/components/spreadsheet/spreadsheet-univer-shared"
import { fetchOrganizationIdForExperiment } from "@/lib/experiment-storage"
import {
  USER_STORAGE_BUCKET,
  createExperimentDataStoragePath,
  resolveExperimentDataStoragePath,
} from "@/lib/user-storage-bucket"

interface ExperimentFile {
  id: string
  data_type: string
  file_name: string
  file_url: string
  file_size: number
  file_type: string
  created_at: string
  tabular_format?: string | null
  uploaded_by_user?: {
    first_name: string
    last_name: string
  }
}

export function DataFilesTab({ experimentId }: { experimentId: string }) {
  const { toast } = useToast()
  const [files, setFiles] = useState<ExperimentFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tabularOpen, setTabularOpen] = useState(false)
  const [tabularFile, setTabularFile] = useState<ExperimentFile | null>(null)
  const [creatingEmpty, setCreatingEmpty] = useState(false)

  useEffect(() => {
    fetchFiles()
  }, [experimentId])

  const fetchFiles = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("experiment_data")
        .select(
          `
          id,
          experiment_id,
          data_type,
          file_name,
          file_url,
          file_size,
          file_type,
          metadata,
          tabular_format,
          snapshot_updated_at,
          project_id,
          uploaded_by,
          created_at,
          uploaded_by_user:profiles!experiment_data_uploaded_by_fkey(
            first_name,
            last_name
          )
        `
        )
        .eq("experiment_id", experimentId)
        .order("created_at", { ascending: false })

      if (error) throw error
      const rows = (data || []).map((row: Record<string, unknown>) => {
        const u = row.uploaded_by_user
        const uploaded_by_user = Array.isArray(u) ? (u[0] as ExperimentFile["uploaded_by_user"]) : u
        return { ...row, uploaded_by_user } as ExperimentFile
      })
      setFiles(rows)
    } catch (error: any) {
      console.error("Error fetching files:", error)
      toast({
        title: "Error",
        description: "Failed to load files",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (file: ExperimentFile) => {
    try {
      const supabase = createClient()

      const storagePath = resolveExperimentDataStoragePath(file)
      if (!storagePath) throw new Error("Invalid file path")

      const { error: storageError } = await supabase.storage.from(USER_STORAGE_BUCKET).remove([storagePath])

      if (storageError) {
        console.warn("Storage deletion warning:", storageError)
        // Continue even if storage deletion fails (file might already be deleted)
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('experiment_data')
        .delete()
        .eq('id', file.id)

      if (dbError) throw dbError

      toast({
        title: "File deleted",
        description: `${file.file_name} has been deleted successfully.`,
      })

      fetchFiles() // Refresh list
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete file",
        variant: "destructive",
      })
    }
  }

  const openTabularViewer = (file: ExperimentFile) => {
    setTabularFile(file)
    setTabularOpen(true)
  }

  const handleNewEmptySpreadsheet = async () => {
    setCreatingEmpty(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const orgId = await fetchOrganizationIdForExperiment(supabase, experimentId)
      if (!orgId) throw new Error("Could not resolve organization for this experiment")

      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
      const fileName = `Spreadsheet-${stamp}.csv`
      const dataFileId = crypto.randomUUID()
      const storagePath = createExperimentDataStoragePath(orgId, experimentId, dataFileId, fileName)
      const snapshot = createEmptyWorkbookSnapshot(fileName)

      const blob = new Blob([""], { type: "text/csv;charset=utf-8" })
      const { error: uploadError } = await supabase.storage.from(USER_STORAGE_BUCKET).upload(storagePath, blob, {
        cacheControl: "3600",
        upsert: false,
      })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from(USER_STORAGE_BUCKET).getPublicUrl(storagePath)

      const { data: inserted, error: dbError } = await supabase
        .from("experiment_data")
        .insert({
          id: dataFileId,
          experiment_id: experimentId,
          data_type: "raw",
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_size: 0,
          file_type: "text/csv",
          uploaded_by: user.id,
          workbook_snapshot: snapshot,
          tabular_format: "csv",
          snapshot_updated_at: new Date().toISOString(),
          metadata: {
            original_name: fileName,
            storage_path: storagePath,
            created_empty: true,
          },
        })
        .select(
          `
          id,
          experiment_id,
          data_type,
          file_name,
          file_url,
          file_size,
          file_type,
          metadata,
          tabular_format,
          snapshot_updated_at,
          project_id,
          uploaded_by,
          created_at,
          uploaded_by_user:profiles!experiment_data_uploaded_by_fkey(
            first_name,
            last_name
          )
        `
        )
        .single()

      if (dbError) throw dbError

      toast({
        title: "New spreadsheet",
        description: `${fileName} is ready to edit.`,
      })

      await fetchFiles()

      if (inserted) {
        const u = (inserted as Record<string, unknown>).uploaded_by_user
        const uploaded_by_user = (
          Array.isArray(u) ? u[0] : u
        ) as ExperimentFile["uploaded_by_user"] | undefined
        openTabularViewer({ ...(inserted as unknown as ExperimentFile), uploaded_by_user })
      }
    } catch (error: unknown) {
      console.error(error)
      toast({
        title: "Could not create spreadsheet",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setCreatingEmpty(false)
    }
  }

  const handleDownload = (file: ExperimentFile) => {
    const link = document.createElement('a')
    link.href = file.file_url
    link.download = file.file_name
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getFileIcon = (file: ExperimentFile) => {
    const fileType = file.file_type || ""
    const lower = file.file_name.toLowerCase()
    if (fileType.startsWith("image/")) return <FileImage className="h-4 w-4" />
    if (fileType.includes("pdf")) return <FileText className="h-4 w-4" />
    if (
      fileType.includes("spreadsheet") ||
      fileType.includes("csv") ||
      fileType.includes("excel") ||
      lower.endsWith(".csv") ||
      lower.endsWith(".xlsx") ||
      lower.endsWith(".xls")
    ) {
      return <FileSpreadsheet className="h-4 w-4" />
    }
    return <File className="h-4 w-4" />
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + ' ' + 
           new Date(dateString).toLocaleTimeString()
  }

  return (
    <>
    {tabularFile && (
      <ExperimentDataTabularDialog
        open={tabularOpen}
        onOpenChange={(o) => {
          setTabularOpen(o)
          if (!o) setTabularFile(null)
        }}
        experimentId={experimentId}
        fileId={tabularFile.id}
        fileName={tabularFile.file_name}
      />
    )}
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-foreground">Data Files</CardTitle>
            <CardDescription>
              Uploaded experimental data and results
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              disabled={creatingEmpty}
              onClick={() => void handleNewEmptySpreadsheet()}
            >
              {creatingEmpty ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              New spreadsheet
            </Button>
            <UploadFileDialog experimentId={experimentId} onUploadComplete={fetchFiles} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading files...
          </div>
        ) : files.length > 0 ? (
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Type</TableHead>
                  <TableHead className="min-w-[200px]">File Name</TableHead>
                  <TableHead className="min-w-[120px]">Data Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right min-w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      {getFileIcon(file)}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[300px]">{file.file_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {file.data_type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatFileSize(file.file_size)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {file.uploaded_by_user 
                        ? `${file.uploaded_by_user.first_name} ${file.uploaded_by_user.last_name}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(file.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            isTabularExperimentFile(file)
                              ? openTabularViewer(file)
                              : window.open(file.file_url, "_blank")
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(file)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete file?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete <strong>{file.file_name}</strong>.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(file)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12">
            <File className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">No files uploaded yet</p>
            <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={creatingEmpty}
                onClick={() => void handleNewEmptySpreadsheet()}
              >
                {creatingEmpty ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                New spreadsheet
              </Button>
              <UploadFileDialog experimentId={experimentId} onUploadComplete={fetchFiles} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  )
}

