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
  Eye
} from "lucide-react"
import { UploadFileDialog } from "./upload-file-dialog"

interface ExperimentFile {
  id: string
  data_type: string
  file_name: string
  file_url: string
  file_size: number
  file_type: string
  created_at: string
  uploaded_by_user?: {
    first_name: string
    last_name: string
  }
}

export function DataFilesTab({ experimentId }: { experimentId: string }) {
  const { toast } = useToast()
  const [files, setFiles] = useState<ExperimentFile[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchFiles()
  }, [experimentId])

  const fetchFiles = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("experiment_data")
        .select(`
          *,
          uploaded_by_user:profiles!experiment_data_uploaded_by_fkey(
            first_name,
            last_name
          )
        `)
        .eq("experiment_id", experimentId)
        .order("created_at", { ascending: false })

      if (error) throw error
      setFiles(data || [])
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

      // Extract storage path from metadata or construct it
      const storagePath = file.file_url.split('/experiment-files/').pop()
      if (!storagePath) throw new Error("Invalid file path")

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('experiment-files')
        .remove([storagePath])

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

  const handleDownload = (file: ExperimentFile) => {
    const link = document.createElement('a')
    link.href = file.file_url
    link.download = file.file_name
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <FileImage className="h-4 w-4" />
    if (fileType.includes('pdf')) return <FileText className="h-4 w-4" />
    if (fileType.includes('spreadsheet') || fileType.includes('csv')) {
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
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-foreground">Data Files</CardTitle>
            <CardDescription>
              Uploaded experimental data and results
            </CardDescription>
          </div>
          <div className="w-full sm:w-auto">
            <UploadFileDialog 
              experimentId={experimentId} 
              onUploadComplete={fetchFiles}
            />
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
                      {getFileIcon(file.file_type)}
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
                          onClick={() => window.open(file.file_url, '_blank')}
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
            <UploadFileDialog 
              experimentId={experimentId} 
              onUploadComplete={fetchFiles}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

