"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ClipboardList, Loader2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { buttonVariants } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface ProtocolSibling {
  id: string
  name: string
  version: string | null
  updated_at: string
  created_at: string
}

interface ProtocolSiblingsListProps {
  /** Current protocol id — highlighted in the list and used to filter `is.not`. */
  currentProtocolId: string
  /** Scope: list protocols from the same project (and optional experiment). */
  organizationId: string | null
  projectId: string | null
  experimentId: string | null
}

/**
 * Compact list of other protocols in the same project/experiment. Mirrors the
 * `notes` list in the lab-notes editor so the protocol page has the same
 * left-sidebar UX as lab notes (instead of the previous AI-context "Files"
 * panel which has been removed).
 *
 * - Click a row to navigate to that protocol
 * - Per-row dropdown for Rename + Delete (deletion requires confirm)
 * - "+" button creates a new protocol in the same scope (no name yet — the
 *   user gets dropped into the editor with the default title)
 */
export function ProtocolSiblingsList({
  currentProtocolId,
  organizationId,
  projectId,
  experimentId,
}: ProtocolSiblingsListProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<ProtocolSibling[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<ProtocolSibling | null>(null)
  const [busy, setBusy] = useState(false)
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")

  const load = async () => {
    setLoading(true)
    let query = supabase
      .from("protocols")
      .select("id, name, version, updated_at, created_at")
      .order("updated_at", { ascending: false })
    if (organizationId) query = query.eq("organization_id", organizationId)
    if (projectId) query = query.eq("project_id", projectId)
    if (experimentId) query = query.eq("experiment_id", experimentId)
    const { data, error } = await query
    if (error) {
      toast({
        title: "Couldn't load protocols",
        description: error.message,
        variant: "destructive",
      })
      setRows([])
    } else {
      setRows((data ?? []) as ProtocolSibling[])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, projectId, experimentId])

  const handleCreate = () => {
    const params = new URLSearchParams()
    if (projectId) params.set("project", projectId)
    router.push(`/protocols/new?${params.toString()}`)
  }

  const startRename = (row: ProtocolSibling) => {
    setRenameTargetId(row.id)
    setRenameDraft(row.name)
  }

  const commitRename = async () => {
    if (!renameTargetId) return
    const trimmed = renameDraft.trim()
    if (!trimmed) {
      setRenameTargetId(null)
      return
    }
    const { error } = await supabase
      .from("protocols")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", renameTargetId)
    if (error) {
      toast({
        title: "Couldn't rename",
        description: error.message,
        variant: "destructive",
      })
    } else {
      setRows((prev) => prev.map((r) => (r.id === renameTargetId ? { ...r, name: trimmed } : r)))
    }
    setRenameTargetId(null)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      const { error } = await supabase.from("protocols").delete().eq("id", deleteTarget.id)
      if (error) throw error
      toast({ title: "Protocol deleted" })
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id))
      // Navigate away if the user deleted the protocol they're viewing
      if (deleteTarget.id === currentProtocolId) {
        router.push("/protocols")
      }
      setDeleteTarget(null)
    } catch (e: any) {
      toast({
        title: "Couldn't delete",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex h-full min-h-0 w-52 min-w-[13rem] flex-col gap-0 p-2">
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 px-1">
          <span className="truncate text-xs font-medium text-muted-foreground">Protocols</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleCreate}
            disabled={busy}
            aria-label="New protocol"
            title="New protocol in this project"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto mt-1">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No other protocols in this scope.
            </p>
          ) : (
            <ul className="flex w-full min-w-0 flex-col gap-0.5">
              {rows.map((row) => {
                const isActive = row.id === currentProtocolId
                const editing = renameTargetId === row.id
                return (
                  <li key={row.id} className="group/list-item relative">
                    <div
                      className={cn(
                        "grid w-full min-h-8 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted/80",
                        isActive && "bg-muted font-medium",
                      )}
                    >
                      <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {editing ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              ;(e.target as HTMLInputElement).blur()
                            }
                            if (e.key === "Escape") {
                              setRenameTargetId(null)
                            }
                          }}
                          className="min-w-0 truncate border-b border-primary bg-transparent text-sm text-foreground outline-none"
                          aria-label="Rename protocol"
                        />
                      ) : (
                        <Link
                          href={`/protocols/${row.id}`}
                          className="min-w-0 truncate"
                          title={row.name}
                        >
                          {row.name || "Untitled protocol"}
                        </Link>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-7 shrink-0 opacity-70 hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Protocol options"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => startRename(row)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete protocol
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete protocol?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  This will permanently delete <strong>"{deleteTarget.name}"</strong>. This action cannot be undone.
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={busy}
              className={buttonVariants({ variant: "destructive" })}
            >
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
