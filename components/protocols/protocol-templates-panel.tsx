"use client"

import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { Upload, Trash2, Eye, FileStack, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { appApiUrl } from "@/lib/app-api-url"
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client"
import type { ProtocolTemplateExtracted } from "@/lib/protocol-template-types"
import { PROTOCOL_TEMPLATE_ALLOWED_MIME, PROTOCOL_TEMPLATE_MAX_FILE_BYTES } from "@/lib/protocol-template-types"
import { cn } from "@/lib/utils"

type TemplateRow = {
  id: string
  name: string
  source_filename: string
  mime_type: string
  extracted: ProtocolTemplateExtracted | null
  created_at: string
  updated_at: string
}

/** Many browsers omit `file.type` for DOCX or send octet-stream. */
function effectiveTemplateMime(file: File): string {
  const t = file.type?.trim()
  if (t && PROTOCOL_TEMPLATE_ALLOWED_MIME.has(t)) return t
  const n = file.name.toLowerCase()
  if (n.endsWith(".pdf")) return "application/pdf"
  if (n.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
  return t || ""
}

function isNetworkOrOpaqueFailure(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("network request failed")
  )
}

function storagePolicyHint(message: string): string {
  const m = message.toLowerCase()
  if (m.includes("row-level") || m.includes("policy") || m.includes("denied") || m.includes("403")) {
    return `${message} — If this persists, apply scripts/041_protocol_templates_user_bucket.sql in Supabase (org-scoped paths in the user bucket).`
  }
  return message
}

export function ProtocolTemplatesPanel() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<TemplateRow | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(appApiUrl("/api/protocol-templates"), {
        credentials: "same-origin",
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to load templates")
      }
      setTemplates((data.templates ?? []) as TemplateRow[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load templates"
      toast({ title: "Could not load templates", description: msg, variant: "destructive" })
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const onFile = async (file: File | null) => {
    if (!file) return
    const mime = effectiveTemplateMime(file)
    if (!PROTOCOL_TEMPLATE_ALLOWED_MIME.has(mime)) {
      toast({
        title: "Unsupported file type",
        description: "Upload a .docx or .pdf file.",
        variant: "destructive",
      })
      return
    }
    if (file.size > PROTOCOL_TEMPLATE_MAX_FILE_BYTES) {
      toast({
        title: "File too large",
        description: `Maximum size is ${Math.round(PROTOCOL_TEMPLATE_MAX_FILE_BYTES / (1024 * 1024))} MB.`,
        variant: "destructive",
      })
      return
    }

    setUploading(true)
    const supabase = createSupabaseBrowserClient()

    const parseJsonSafe = async (res: Response) => {
      const raw = await res.text()
      try {
        return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      } catch {
        throw new Error(raw?.slice(0, 200) || `HTTP ${res.status}`)
      }
    }

    /** Single POST with multipart body — avoids extra hops; needs proxyClientMaxBodySize in next.config. */
    const tryServerMultipart = async (): Promise<boolean> => {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(appApiUrl("/api/protocol-templates/upload"), {
        method: "POST",
        body: fd,
        credentials: "same-origin",
        cache: "no-store",
      })
      const data = (await parseJsonSafe(res)) as { error?: string; template?: { name?: string } }
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`)
      }
      const uploadedName = data.template?.name
      toast({
        title: "Template uploaded",
        description: uploadedName
          ? `"${uploadedName}" is ready to use when drafting protocols.`
          : "Template processed.",
      })
      await load()
      return true
    }

    /** Literature-style: small JSON to app, file bytes go straight to Supabase Storage (not through Next). */
    const trySupabaseDirect = async (): Promise<boolean> => {
      let uploadedPath: string | null = null
      let uploadBucket = ""
      try {
        const reserveRes = await fetch(appApiUrl("/api/protocol-templates/reserve-upload"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ fileName: file.name }),
        })
        const reserveJson = (await parseJsonSafe(reserveRes)) as {
          error?: string
          templateId?: string
          path?: string
          bucket?: string
        }
        if (!reserveRes.ok) {
          throw new Error(reserveJson.error ?? "Could not reserve upload path")
        }
        const path = reserveJson.path
        const bucket = reserveJson.bucket
        if (!path || !bucket || !reserveJson.templateId) {
          throw new Error("Invalid reserve response")
        }
        uploadBucket = bucket
        uploadedPath = path

        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: mime || file.type || "application/octet-stream",
        })
        if (uploadError) {
          throw new Error(storagePolicyHint(uploadError.message))
        }

        const finRes = await fetch(appApiUrl("/api/protocol-templates/finalize"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            templateId: reserveJson.templateId,
            storagePath: path,
            fileName: file.name,
          }),
        })
        const finData = (await parseJsonSafe(finRes)) as { error?: string; template?: { name?: string } }
        if (!finRes.ok) {
          throw new Error(finData.error || `Finalize failed (${finRes.status})`)
        }
        const uploadedName = finData.template?.name
        toast({
          title: "Template uploaded",
          description: uploadedName
            ? `"${uploadedName}" is ready to use when drafting protocols.`
            : "Template processed.",
        })
        await load()
        return true
      } catch (e) {
        if (uploadedPath && uploadBucket) {
          try {
            await supabase.storage.from(uploadBucket).remove([uploadedPath])
          } catch {
            /* best-effort cleanup when upload/finalize failed after storage put */
          }
        }
        throw e
      }
    }

    try {
      try {
        await tryServerMultipart()
        return
      } catch (first: unknown) {
        const firstMsg = first instanceof Error ? first.message : String(first)
        if (!isNetworkOrOpaqueFailure(first) && !firstMsg.toLowerCase().includes("413")) {
          toast({
            title: "Upload failed",
            description: storagePolicyHint(firstMsg),
            variant: "destructive",
          })
          return
        }
        toast({
          title: "Retrying upload…",
          description:
            "First attempt did not complete. Trying direct upload to storage (same as literature PDFs).",
        })
      }

      await trySupabaseDirect()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed"
      toast({
        title: "Upload failed",
        description: storagePolicyHint(msg),
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(appApiUrl(`/api/protocol-templates/${deleteId}`), {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Delete failed")
      toast({ title: "Template removed" })
      setDeleteId(null)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Delete failed"
      toast({ title: "Could not delete", description: msg, variant: "destructive" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "relative flex min-h-[140px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors",
          uploading ? "border-muted bg-muted/20" : "border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30"
        )}
      >
        <input
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            e.target.value = ""
            void onFile(f)
          }}
        />
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
        )}
        <p className="text-sm font-medium text-foreground">Drop a DOCX or PDF here</p>
        <p className="text-xs text-muted-foreground mt-1 text-center max-w-md">
          We extract section headings and logos (DOCX). PDF logos may not be extracted — see notes after upload.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <FileStack className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No document templates yet.</p>
          <p className="mt-1">Upload an institutional letterhead or SOP shell to reuse its structure in Design Mode.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Source</TableHead>
              <TableHead className="text-right">Sections</TableHead>
              <TableHead className="text-right">Logos</TableHead>
              <TableHead className="hidden md:table-cell">Updated</TableHead>
              <TableHead className="text-right w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => {
              const ex = t.extracted
              const sections = ex?.sectionHeadings?.length ?? 0
              const logos = ex?.logos?.length ?? 0
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-xs truncate max-w-[200px]">
                    {t.source_filename}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{sections}</TableCell>
                  <TableCell className="text-right tabular-nums">{logos}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs whitespace-nowrap">
                    {format(new Date(t.updated_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Preview sections"
                        onClick={() => setPreview(t)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label="Delete template"
                        onClick={() => setDeleteId(t.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{preview?.name ?? "Template preview"}</DialogTitle>
          </DialogHeader>
          {preview?.extracted?.warnings?.length ? (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5">
              {preview.extracted.warnings.join(" ")}
            </p>
          ) : null}
          <ul className="text-sm space-y-1.5 max-h-[50vh] overflow-y-auto">
            {(preview?.extracted?.sectionHeadings ?? []).length === 0 ? (
              <li className="text-muted-foreground">No sections detected — a default Procedure block will be used.</li>
            ) : (
              preview?.extracted?.sectionHeadings
                ?.slice()
                .sort((a, b) => a.order - b.order)
                .map((h) => (
                  <li key={`${h.slug}-${h.order}`} className="flex gap-2">
                    <span className="text-muted-foreground font-mono text-xs shrink-0">{h.slug}</span>
                    <span>{h.title}</span>
                  </li>
                ))
            )}
          </ul>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the file and extracted metadata. Protocols that already used it keep their content; only the template library entry is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
