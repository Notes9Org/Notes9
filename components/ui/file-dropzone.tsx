"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Upload, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface FileDropzoneProps {
  children: React.ReactNode
  onFilesDrop: (files: File[]) => void
  className?: string
  activeClassName?: string
  disabled?: boolean
  accept?: string[]
  description?: string
}

export function FileDropzone({
  children,
  onFilesDrop,
  className,
  activeClassName,
  disabled = false,
  accept,
  description = "Drop files here to upload",
}: FileDropzoneProps) {
  const { toast } = useToast()
  const [isDragActive, setIsDragActive] = React.useState(false)
  const dragCounter = React.useRef(0)

  const handleDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    
    dragCounter.current += 1
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true)
    }
  }, [disabled])

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return

    dragCounter.current -= 1
    if (dragCounter.current === 0) {
      setIsDragActive(false)
    }
  }, [disabled])

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return

    setIsDragActive(false)
    dragCounter.current = 0

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      // Filter by accept if provided
      const filteredFiles = accept 
        ? files.filter(file => {
            return accept.some(type => {
              if (type.startsWith(".")) {
                return file.name.toLowerCase().endsWith(type.toLowerCase())
              }
              if (type.endsWith("/*")) {
                return file.type.startsWith(type.replace("/*", ""))
              }
              return file.type === type
            })
          })
        : files

      if (filteredFiles.length > 0) {
        onFilesDrop(filteredFiles)
      }

      const rejectedFiles = files.filter(f => !filteredFiles.includes(f))
      if (rejectedFiles.length > 0 && accept) {
        toast({
          title: "Invalid file format",
          description: `Rejected: ${rejectedFiles.map(f => f.name).join(", ")}. Expected: ${accept.join(", ")}`,
          variant: "destructive",
        })
      }
    }
  }, [disabled, onFilesDrop, accept, toast])

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "relative transition-all duration-200",
        isDragActive && !disabled && (activeClassName || "ring-2 ring-primary ring-offset-2 rounded-xl"),
        className
      )}
    >
      {children}
      {isDragActive && !disabled && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-[2px] rounded-xl border-2 border-dashed border-primary animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-10 w-10 animate-bounce" />
            <p className="text-sm font-semibold">{description}</p>
          </div>
        </div>
      )}
    </div>
  )
}
