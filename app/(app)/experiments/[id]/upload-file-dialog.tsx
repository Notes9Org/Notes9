"use client"

import { useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { Upload, File, X, CheckCircle2, AlertCircle, Files } from "lucide-react"
import { Card } from "@/components/ui/card"

// File size limit: 10 MB for MVP
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB in bytes
const MAX_FILE_SIZE_MB = 10
const MAX_FILES_AT_ONCE = 10 // Maximum files per upload session

// Blocked file types for security
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.sh', '.app', '.dmg', '.com', '.dll', '.sys', '.scr']

// Allowed MIME types (restrictive for security)
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/x-markdown',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  'image/tiff',
  // Spreadsheets
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Data formats
  'application/json',
  'application/xml',
  'text/xml',
  // Scientific formats
  'text/x-fasta',
  'application/x-fasta',
  // Archives (small only)
  'application/zip',
  'application/x-zip-compressed',
]

// File extensions that are allowed (in addition to MIME types)
const ALLOWED_EXTENSIONS = [
  '.pdf', '.txt', '.csv', '.md', '.markdown',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.tiff',
  '.xls', '.xlsx',
  '.json', '.xml',
  '.fasta', '.fa', '.fna', '.ffn', '.faa', '.frn',
  '.zip'
]

interface UploadFileDialogProps {
  experimentId: string
  onUploadComplete: () => void
}

interface FileWithStatus {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

export function UploadFileDialog({ experimentId, onUploadComplete }: UploadFileDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [open, setOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<FileWithStatus[]>([])
  const [dataType, setDataType] = useState<string>("raw")
  const [isUploading, setIsUploading] = useState(false)

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`
    }

    // Check file extension for blocked types
    const fileName = file.name.toLowerCase()
    const hasBlockedExtension = BLOCKED_EXTENSIONS.some(ext => fileName.endsWith(ext))
    if (hasBlockedExtension) {
      return `File type not allowed for security reasons.`
    }

    // Check if file extension is in allowed list
    const fileExt = '.' + fileName.split('.').pop()
    const hasAllowedExtension = ALLOWED_EXTENSIONS.some(ext => fileExt === ext)
    
    // Check MIME type OR file extension (more permissive for scientific files)
    const hasAllowedMimeType = ALLOWED_MIME_TYPES.includes(file.type) || file.type.startsWith('image/') || file.type.startsWith('text/')
    
    if (!hasAllowedMimeType && !hasAllowedExtension) {
      return `File type "${file.type || fileExt}" is not supported. Allowed: PDF, images, CSV, text, MD, FASTA, JSON, XML.`
    }

    return null
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    addFiles(files)
  }

  const addFiles = (files: File[]) => {
    if (selectedFiles.length + files.length > MAX_FILES_AT_ONCE) {
      toast({
        title: "Too many files",
        description: `You can upload maximum ${MAX_FILES_AT_ONCE} files at once.`,
        variant: "destructive",
      })
      return
    }

    const newFiles: FileWithStatus[] = []
    
    for (const file of files) {
      const validationError = validateFile(file)
      if (validationError) {
        toast({
          title: `Invalid file: ${file.name}`,
          description: validationError,
          variant: "destructive",
        })
        continue
      }
      
      newFiles.push({
        file,
        status: 'pending',
        progress: 0
      })
    }

    setSelectedFiles(prev => [...prev, ...newFiles])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }

  const handleUploadAll = async () => {
    if (selectedFiles.length === 0) return

    setIsUploading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) throw new Error("Not authenticated")

      let successCount = 0
      let errorCount = 0

      // Upload files sequentially
      for (let i = 0; i < selectedFiles.length; i++) {
        const fileStatus = selectedFiles[i]
        
        // Update status to uploading
        setSelectedFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'uploading' as const, progress: 10 } : f
        ))

        try {
          const file = fileStatus.file
          const timestamp = Date.now()
          const fileName = `${experimentId}/${timestamp}-${file.name}`

          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('experiment-files')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false
            })

          if (uploadError) throw uploadError

          // Update progress
          setSelectedFiles(prev => prev.map((f, idx) => 
            idx === i ? { ...f, progress: 60 } : f
          ))

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('experiment-files')
            .getPublicUrl(fileName)

          // Update progress
          setSelectedFiles(prev => prev.map((f, idx) => 
            idx === i ? { ...f, progress: 80 } : f
          ))

          // Save metadata to database
          const { error: dbError } = await supabase
            .from('experiment_data')
            .insert({
              experiment_id: experimentId,
              data_type: dataType,
              file_name: file.name,
              file_url: urlData.publicUrl,
              file_size: file.size,
              file_type: file.type,
              uploaded_by: user.id,
              metadata: {
                original_name: file.name,
                upload_date: new Date().toISOString(),
                storage_path: fileName
              }
            })

          if (dbError) throw dbError

          // Mark as success
          setSelectedFiles(prev => prev.map((f, idx) => 
            idx === i ? { ...f, status: 'success' as const, progress: 100 } : f
          ))
          
          successCount++
        } catch (error: any) {
          console.error(`Upload error for ${fileStatus.file.name}:`, error)
          
          // Mark as error
          setSelectedFiles(prev => prev.map((f, idx) => 
            idx === i ? { 
              ...f, 
              status: 'error' as const, 
              progress: 0,
              error: error.message 
            } : f
          ))
          
          errorCount++
        }
      }

      // Show summary toast
      if (successCount > 0) {
        toast({
          title: "Upload complete",
          description: `${successCount} file(s) uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}.`,
        })
      }

      if (errorCount === selectedFiles.length) {
        toast({
          title: "Upload failed",
          description: "All files failed to upload. Please try again.",
          variant: "destructive",
        })
      }

      // Close dialog if all successful
      if (errorCount === 0) {
        setTimeout(() => {
          setSelectedFiles([])
          setDataType("raw")
          setOpen(false)
          onUploadComplete()
        }, 1500)
      } else {
        // Keep failed files for retry
        setSelectedFiles(prev => prev.filter(f => f.status === 'error'))
      }
      
    } catch (err: any) {
      console.error("Upload error:", err)
      toast({
        title: "Upload failed",
        description: err.message || "Failed to upload files",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleReset = () => {
    setSelectedFiles([])
    setDataType("raw")
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const getFileIcon = (file: FileWithStatus) => {
    if (file.status === 'success') return <CheckCircle2 className="h-5 w-5 text-success" />
    if (file.status === 'error') return <AlertCircle className="h-5 w-5 text-destructive" />
    if (file.status === 'uploading') return <Upload className="h-5 w-5 text-primary animate-pulse" />
    return <File className="h-5 w-5 text-muted-foreground" />
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="h-4 w-4 mr-2" />
          Upload Files
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Data Files</DialogTitle>
          <DialogDescription>
            Upload multiple files at once (max {MAX_FILES_AT_ONCE} files, {MAX_FILE_SIZE_MB} MB each)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Type Selector */}
          <div className="space-y-2">
            <Label htmlFor="data_type">Data Type (applies to all files)</Label>
            <Select value={dataType} onValueChange={setDataType} disabled={isUploading}>
              <SelectTrigger id="data_type">
                <SelectValue placeholder="Select data type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="raw">Raw Data</SelectItem>
                <SelectItem value="processed">Processed Data</SelectItem>
                <SelectItem value="analysis">Analysis Results</SelectItem>
                <SelectItem value="visualization">Visualization/Images</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Drag & Drop / File Select Area */}
          {selectedFiles.length === 0 && (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Files className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                Drag and drop files or click to select
              </p>
              <p className="text-xs text-muted-foreground">
                Multiple files supported • PDF, images, CSV, MD, FASTA, JSON, XML, text (max {MAX_FILE_SIZE_MB} MB each)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={isUploading}
                accept={`${ALLOWED_MIME_TYPES.join(',')},${ALLOWED_EXTENSIONS.join(',')}`}
              />
            </div>
          )}

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Selected Files ({selectedFiles.length})</Label>
                {!isUploading && (
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    Clear All
                  </Button>
                )}
              </div>
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {selectedFiles.map((fileStatus, index) => (
                  <Card key={index} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {getFileIcon(fileStatus)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{fileStatus.file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(fileStatus.file.size)}
                            {fileStatus.status === 'error' && fileStatus.error && (
                              <span className="text-destructive ml-2">• {fileStatus.error}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {!isUploading && fileStatus.status !== 'success' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFile(index)}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {fileStatus.status === 'uploading' && (
                      <div className="mt-2">
                        <Progress value={fileStatus.progress} className="h-1" />
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              {/* Add more files button */}
              {!isUploading && selectedFiles.length < MAX_FILES_AT_ONCE && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Add More Files ({selectedFiles.length}/{MAX_FILES_AT_ONCE})
                </Button>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={isUploading}
                accept={`${ALLOWED_MIME_TYPES.join(',')},${ALLOWED_EXTENSIONS.join(',')}`}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUploadAll}
            disabled={selectedFiles.length === 0 || isUploading}
          >
            {isUploading ? `Uploading... (${selectedFiles.filter(f => f.status === 'success').length}/${selectedFiles.length})` : `Upload ${selectedFiles.length} File(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
