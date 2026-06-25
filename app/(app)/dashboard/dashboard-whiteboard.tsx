"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react"
import { createPortal } from "react-dom"
import { Shapes, Type, Trash2, X, Sparkles, Maximize, Minimize } from "lucide-react"
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
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  createWhiteboardNote,
  deleteWhiteboardNote,
  updateWhiteboardNoteBody,
  updateWhiteboardNoteKind,
  updateWhiteboardNotePosition,
  updateWhiteboardNoteTag,
  clearWhiteboardNotes,
  type WhiteboardNote,
  type NoteKind,
} from "@/lib/whiteboard-notes"

type Row = {
  id: string
  user_id: string
  project_id: string | null
  kind: NoteKind
  tag: string | null
  body: string
  foot: string | null
  x: number
  y: number
  is_ai: boolean
  created_at: string
  updated_at: string
}

// Notes9 brand keeps to warm tones — lilac is intentionally absent from the
// pickable palette. The `lilac` kind survives in the DB enum for back-compat
// with any pre-brand rows but isn't selectable here.
const PALETTE: { kind: Exclude<NoteKind, "ai" | "lilac">; swatch: string }[] = [
  { kind: "lemon", swatch: "#f4e3a0" },
  { kind: "mint", swatch: "#cee5cc" },
  { kind: "cloud", swatch: "#dde2ef" },
  { kind: "coral", swatch: "#edcec0" },
  { kind: "paper", swatch: "var(--card)" },
]

const NOTE_BG: Record<NoteKind, string> = {
  lemon: "#f4e3a0",
  mint: "#cee5cc",
  cloud: "#dde2ef",
  lilac: "#dccff0",
  coral: "#edcec0",
  paper: "var(--card)",
  ai: "color-mix(in srgb, var(--n9-accent-light) 80%, var(--card))",
}

function fromRow(r: Row): WhiteboardNote {
  return {
    id: r.id,
    userId: r.user_id,
    projectId: r.project_id,
    kind: r.kind,
    tag: r.tag,
    body: r.body,
    foot: r.foot,
    x: r.x,
    y: r.y,
    isAi: r.is_ai,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function DashboardWhiteboard({
  initialNotes,
  projectId = null,
}: {
  initialNotes: Row[]
  projectId?: string | null
}) {
  const [notes, setNotes] = useState<WhiteboardNote[]>(() =>
    initialNotes.map(fromRow)
  )
  const [drag, setDrag] = useState<{ id: string; ox: number; oy: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Note id whose tag chip is currently being renamed in place. */
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState<string>("")
  /** Multi-select: ids of notes currently selected. Drives the toolbar mode
      switch (Add → Repaint), keyboard ops, and the selected-ring style. */
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  /** In-progress marquee rectangle (canvas-local coords). Null when not drawing. */
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  )
  /** AlertDialog for "Clear all" so the destructive action isn't a single click. */
  const [confirmClear, setConfirmClear] = useState(false)
  const [bounds, setBounds] = useState({ w: Infinity, h: Infinity })
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // Resizing state & persistence
  const [sizes, setSizes] = useState<Record<string, { w: number, h: number }>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('whiteboard_sizes') || '{}') } catch (err) { console.warn('whiteboard_sizes_parse_failed', err); return {} }
  })
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!canvasRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setBounds({ w: entry.contentRect.width, h: entry.contentRect.height })
      }
    })
    ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [isFullscreen])

  // The drag effect re-runs only when `drag` changes — so the `up` handler's
  // closure can't reach the latest `notes`. Mirror notes into a ref each
  // render so mouseup persists the drop position, not the pickup position.
  const notesRef = useRef<WhiteboardNote[]>(notes)
  notesRef.current = notes
  /** Selection mirror for the keyboard effect — it lives outside React's
      render deps to avoid re-attaching the window listener on every selection
      change. */
  const selectedRef = useRef<Set<string>>(selected)
  selectedRef.current = selected

  // Persist position on drop (not on every move).
  const persistPosition = useCallback((id: string, x: number, y: number) => {
    startTransition(() => {
      updateWhiteboardNotePosition({ id, x, y }).catch((err) => {
        // The visible state already shows the user's drag; log so the failure is observable.
        console.error('whiteboard_mutation_failed', { op: 'persistPosition', err })
        toast.error("Couldn't save — your changes may not persist. Please retry.")
      })
    })
  }, [])

  /** Toggle a note's selection. Shift-click adds/removes; plain click replaces
      the selection with just this note (or clears if it was the only one). */
  const toggleSelect = useCallback((id: string, shift: boolean) => {
    setSelected((curr) => {
      const next = new Set(curr)
      if (shift) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      } else {
        if (next.has(id) && next.size === 1) {
          next.clear()
        } else {
          next.clear()
          next.add(id)
        }
      }
      return next
    })
  }, [])

  /** Repaint every selected note to the given kind — optimistic update, then
      issue one server action per note (small numbers, no batching needed). */
  const repaintSelected = useCallback(
    (kind: Exclude<NoteKind, "ai" | "lilac">) => {
      const ids = Array.from(selectedRef.current)
      if (ids.length === 0) return
      setNotes((curr) => curr.map((n) => (ids.includes(n.id) ? { ...n, kind } : n)))
      startTransition(() => {
        for (const id of ids) {
          if (id.startsWith("temp-")) continue
          updateWhiteboardNoteKind({ id, kind }).catch((err) => {
            console.error('whiteboard_mutation_failed', { op: 'updateNoteKind', err });
            toast.error("Couldn't save — your changes may not persist. Please retry.");
          })
        }
      })
    },
    [],
  )

  /** Delete every selected note — optimistic; failure tolerance is "if the
      server still has it, the next refetch restores it" since we don't have
      realtime here yet. */
  const deleteSelected = useCallback(() => {
    const ids = Array.from(selectedRef.current)
    if (ids.length === 0) return
    setNotes((curr) => curr.filter((n) => !ids.includes(n.id)))
    setSelected(new Set())
    startTransition(() => {
      for (const id of ids) {
        if (id.startsWith("temp-")) continue
        deleteWhiteboardNote(id).catch((err) => {
          console.error('whiteboard_mutation_failed', { op: 'deleteSelected', err });
          toast.error("Couldn't save — your changes may not persist. Please retry.");
        })
      }
    })
  }, [])

  /** Duplicate selected notes at +16/+16 offset. New ids start `temp-` until
      the server returns, matching the addSticky pattern below. */
  const duplicateSelected = useCallback(() => {
    const ids = Array.from(selectedRef.current)
    if (ids.length === 0) return
    const sources = notesRef.current.filter((n) => ids.includes(n.id))
    const newTempIds: string[] = []
    const optimistic: WhiteboardNote[] = sources.map((src) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      newTempIds.push(tempId)
      return { ...src, id: tempId, x: src.x + 16, y: src.y + 16 }
    })
    setNotes((curr) => [...curr, ...optimistic])
    setSelected(new Set(newTempIds))
    startTransition(() => {
      sources.forEach((src, i) => {
        const tempId = newTempIds[i]
        if (!tempId) return
        createWhiteboardNote({
          kind: src.kind,
          tag: src.tag ?? undefined,
          body: src.body,
          x: src.x + 16,
          y: src.y + 16,
          projectId: src.projectId ?? undefined,
        })
          .then((real) => {
            setNotes((curr) => curr.map((n) => (n.id === tempId ? real : n)))
            setSelected((curr) => {
              if (!curr.has(tempId)) return curr
              const next = new Set(curr)
              next.delete(tempId)
              next.add(real.id)
              return next
            })
          })
          .catch((err) => {
            console.error('whiteboard_mutation_failed', { op: 'duplicateNote', err })
            setNotes((curr) => curr.filter((n) => n.id !== tempId))
          })
      })
    })
  }, [])

  /** Shift the selection's x/y by delta pixels and persist on settle. */
  const nudgeSelected = useCallback((dx: number, dy: number) => {
    const ids = selectedRef.current
    if (ids.size === 0) return
    const rect = canvasRef.current?.getBoundingClientRect()
    setNotes((curr) =>
      curr.map((n) => {
        if (!ids.has(n.id)) return n
        const maxX = rect ? rect.width - 180 : Infinity
        const maxY = rect ? rect.height - 110 : Infinity
        const nx = Math.max(0, Math.min(maxX, n.x + dx))
        const ny = Math.max(0, Math.min(maxY, n.y + dy))
        return { ...n, x: nx, y: ny }
      }),
    )
    // Persist each nudged note. Cheap: one call per selected note, fired in a
    // transition so the UI doesn't block on the network.
    startTransition(() => {
      const fresh = notesRef.current
      for (const id of ids) {
        if (id.startsWith("temp-")) continue
        const n = fresh.find((x) => x.id === id)
        if (!n) continue
        updateWhiteboardNotePosition({ id, x: n.x, y: n.y }).catch((err) => {
          console.error('whiteboard_mutation_failed', { op: 'nudgePosition', err });
          toast.error("Couldn't save — your changes may not persist. Please retry.");
        })
      }
    })
  }, [])

  // Keyboard shortcuts — Delete/Backspace, ⌘A, ⌘D, Esc, arrow nudges. Bound to
  // the window so they fire from anywhere on the dashboard; we just guard
  // against fires while typing in an input/textarea anywhere on the page.
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) return true
      return false
    }
    function onKey(e: KeyboardEvent) {
      // Don't hijack typing anywhere on the page — the dashboard has the
      // tasks composer, the catalyst hero, etc.
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape" && editingId === null && editingTagId === null) {
          // Esc with no inline editor active and focus inside an input is
          // not ours to consume.
        }
        return
      }
      const isMod = e.metaKey || e.ctrlKey
      if (e.key === "Escape") {
        if (selectedRef.current.size > 0) {
          setSelected(new Set())
        }
        return
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedRef.current.size > 0) {
          e.preventDefault()
          deleteSelected()
        }
        return
      }
      if (isMod && e.key.toLowerCase() === "a") {
        e.preventDefault()
        setSelected(new Set(notesRef.current.map((n) => n.id)))
        return
      }
      if (isMod && e.key.toLowerCase() === "d") {
        if (selectedRef.current.size > 0) {
          e.preventDefault()
          duplicateSelected()
        }
        return
      }
      if (e.key.startsWith("Arrow") && selectedRef.current.size > 0) {
        const step = e.shiftKey ? 32 : 8
        e.preventDefault()
        if (e.key === "ArrowUp") nudgeSelected(0, -step)
        if (e.key === "ArrowDown") nudgeSelected(0, step)
        if (e.key === "ArrowLeft") nudgeSelected(-step, 0)
        if (e.key === "ArrowRight") nudgeSelected(step, 0)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [deleteSelected, duplicateSelected, nudgeSelected, editingId, editingTagId])

  // Marquee drag-rectangle: only starts when the user clicks empty canvas.
  function startMarquee(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement) !== canvasRef.current) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setMarquee({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 })
  }
  useEffect(() => {
    if (!marquee) return
    const startX = marquee.x
    const startY = marquee.y
    function move(ev: globalThis.MouseEvent) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const cx = ev.clientX - rect.left
      const cy = ev.clientY - rect.top
      setMarquee({
        x: Math.min(startX, cx),
        y: Math.min(startY, cy),
        w: Math.abs(cx - startX),
        h: Math.abs(cy - startY),
      })
    }
    function up() {
      setMarquee((m) => {
        if (!m) return null
        // Hit-test every note's bounding box against the marquee.
        const hits = new Set<string>()
        for (const n of notesRef.current) {
          const nRight = n.x + 180
          const nBottom = n.y + 110
          const mRight = m.x + m.w
          const mBottom = m.y + m.h
          if (n.x < mRight && nRight > m.x && n.y < mBottom && nBottom > m.y) {
            hits.add(n.id)
          }
        }
        // A click-without-drag (w/h <= 2px) clears the selection instead of
        // matching every note that happens to overlap the cursor.
        if (m.w > 2 || m.h > 2) {
          setSelected(hits)
        } else {
          setSelected(new Set())
        }
        return null
      })
    }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
  }, [marquee])

  /** Persist a renamed tag chip. Empty trims to null so the chip falls back to
      "Note". */
  function commitTag(id: string) {
    const trimmed = tagDraft.trim()
    const tag = trimmed.length === 0 ? null : trimmed.slice(0, 64)
    setNotes((curr) => curr.map((n) => (n.id === id ? { ...n, tag } : n)))
    setEditingTagId(null)
    setTagDraft("")
    if (id.startsWith("temp-")) return
    startTransition(() => {
      updateWhiteboardNoteTag({ id, tag }).catch((err) => {
      console.error('whiteboard_mutation_failed', { op: 'updateNoteTag', err });
      toast.error("Couldn't save — your changes may not persist. Please retry.");
    })
    })
  }

  const repaintMode = selected.size > 0
  const selectedCountLabel = useMemo(
    () => (selected.size === 1 ? "1 selected" : `${selected.size} selected`),
    [selected.size],
  )

  function startDrag(e: MouseEvent<HTMLDivElement>, note: WhiteboardNote) {
    if ((e.target as HTMLElement).closest("button, textarea, a, input")) {
      return
    }
    
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setDrag({
      id: note.id,
      ox: e.clientX - rect.left - note.x,
      oy: e.clientY - rect.top - note.y,
    })
  }

  const sizesRef = useRef(sizes)
  useEffect(() => {
    sizesRef.current = sizes
  }, [sizes])

  useEffect(() => {
    if (!drag) return
    const activeDrag = drag
    function move(e: globalThis.MouseEvent) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const noteW = sizesRef.current[activeDrag.id]?.w || 180
      const noteH = sizesRef.current[activeDrag.id]?.h || 110
      const x = Math.max(0, Math.min(rect.width - noteW, e.clientX - rect.left - activeDrag.ox))
      const y = Math.max(0, Math.min(rect.height - noteH, e.clientY - rect.top - activeDrag.oy))
      setNotes((curr) => curr.map((n) => (n.id === activeDrag.id ? { ...n, x, y } : n)))
    }
    function up() {
      const current = notesRef.current.find((n) => n.id === activeDrag.id)
      if (current) persistPosition(activeDrag.id, current.x, current.y)
      setDrag(null)
    }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
  }, [drag])

  useEffect(() => {
    if (!resizing) return
    const activeResize = resizing
    function move(e: globalThis.MouseEvent) {
      const w = Math.max(120, activeResize.startW + (e.clientX - activeResize.startX))
      const h = Math.max(80, activeResize.startH + (e.clientY - activeResize.startY))
      setSizes((curr) => {
        const next = { ...curr, [activeResize.id]: { w, h } }
        try {
          localStorage.setItem('whiteboard_sizes', JSON.stringify(next))
        } catch (err) {
          console.warn('whiteboard_sizes_persist_failed', err)
        }
        return next
      })
    }
    function up() { setResizing(null) }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
  }, [resizing])

  function addSticky(kind: Exclude<NoteKind, "ai" | "lilac">) {
    const x = 24 + Math.random() * 160
    const y = 24 + Math.random() * 80
    // Optimistic id; server will return the real one.
    const tempId = `temp-${Date.now()}`
    const optimistic: WhiteboardNote = {
      id: tempId,
      userId: "",
      projectId,
      kind,
      tag: "New",
      body: "",
      foot: null,
      x: Math.round(x),
      y: Math.round(y),
      isAi: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setNotes((curr) => [...curr, optimistic])
    setEditingId(tempId)
    startTransition(() => {
      createWhiteboardNote({
        kind,
        tag: "New",
        body: "",
        x: optimistic.x,
        y: optimistic.y,
        projectId: projectId ?? undefined,
      })
        .then((real) => {
          setNotes((curr) => curr.map((n) => (n.id === tempId ? real : n)))
          setEditingId((curr) => (curr === tempId ? real.id : curr))
        })
        .catch(() => {
          setNotes((curr) => curr.filter((n) => n.id !== tempId))
        })
    })
  }

  function updateBody(id: string, body: string) {
    setNotes((curr) => curr.map((n) => (n.id === id ? { ...n, body } : n)))
  }

  function commitBody(id: string) {
    const note = notes.find((n) => n.id === id)
    if (!note || id.startsWith("temp-")) return
    startTransition(() => {
      updateWhiteboardNoteBody({ id, body: note.body }).catch((err) => {
        console.error('whiteboard_mutation_failed', { op: 'commitBody', err });
        toast.error("Couldn't save — your changes may not persist. Please retry.");
      })
    })
  }

  function remove(id: string) {
    setNotes((curr) => curr.filter((n) => n.id !== id))
    if (id.startsWith("temp-")) return
    startTransition(() => {
      deleteWhiteboardNote(id).catch((err) => {
        console.error('whiteboard_mutation_failed', { op: 'removeSingle', err });
        toast.error("Couldn't save — your changes may not persist. Please retry.");
      })
    })
  }

  function clearAll() {
    if (notes.length === 0) return
    const prev = notes
    setNotes([])
    startTransition(() => {
      clearWhiteboardNotes({ projectId }).catch(() => setNotes(prev))
    })
  }

  const content = (
    <article
      data-tour="dash-whiteboard"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-card transition-all",
        isFullscreen ? "w-full h-full shadow-2xl rounded-2xl border-2 border-border" : "rounded-[calc(var(--radius)+4px)] border border-border h-full"
      )}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-foreground">
          <Shapes size={14} aria-hidden className="text-muted-foreground" />
          <h2 className="font-display text-[14px] font-semibold">Whiteboard</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono tabular-nums uppercase tracking-wider text-muted-foreground">
            {notes.length} note{notes.length === 1 ? "" : "s"}
          </span>
          <button 
            type="button" 
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>
      </header>

      {/* Toolbar — mode switches between "Add" (default) and "Repaint" when
          any notes are selected. Same swatches; click semantics differ. */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span
          className={cn(
            "text-[10px] font-mono uppercase tracking-wider mr-0.5",
            repaintMode ? "text-[var(--n9-accent)]" : "text-muted-foreground",
          )}
        >
          {repaintMode ? `Repaint · ${selectedCountLabel}` : "Add"}
        </span>
        {PALETTE.map((p) => (
          <button
            key={p.kind}
            type="button"
            onClick={() =>
              repaintMode ? repaintSelected(p.kind) : addSticky(p.kind)
            }
            aria-label={
              repaintMode
                ? `Repaint selection to ${p.kind}`
                : `Add ${p.kind} note`
            }
            className="size-[22px] rounded-[5px] border border-foreground/10 hover:scale-110 active:scale-95 transition-transform"
            style={{ background: p.swatch }}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button
          type="button"
          aria-label={repaintMode ? "Repaint selection to paper" : "Add text note"}
          onClick={() =>
            repaintMode ? repaintSelected("paper") : addSticky("paper")
          }
          className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Type size={14} aria-hidden />
        </button>
        <div className="flex-1" />
        {repaintMode && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Clear selection
          </button>
        )}
        <button
          type="button"
          aria-label="Clear all notes"
          onClick={() => setConfirmClear(true)}
          disabled={notes.length === 0}
          className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
        >
          <Trash2 size={14} aria-hidden />
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onMouseDown={startMarquee}
        className="relative flex-1 overflow-hidden m-3 rounded-md border border-border"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, var(--foreground) 9%, transparent) 1px, transparent 1px) 0 0 / 22px 22px, var(--muted)`,
        }}
      >
        {notes.length === 0 ? (
          <EmptyWhiteboard onAdd={() => addSticky("lemon")} />
        ) : null}

        {notes.map((n) => {
          return (
            <div
              key={n.id}
              role="group"
              aria-label={`${n.tag ?? "Note"}: ${n.body ? n.body.slice(0, 60) : "empty"}`}
              onMouseDown={(e) => startDrag(e, n)}
              onDragStart={(e) => e.preventDefault()}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("textarea, button, input")) return
                toggleSelect(n.id, e.shiftKey)
              }}
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest("button, textarea, input")) return
                setEditingId(n.id)
              }}
              className={cn(
                "group absolute select-none flex flex-col overflow-hidden",
                drag?.id === n.id ? "cursor-grabbing" : "cursor-grab",
              )}
              style={{
                left: Math.max(0, Math.min(n.x, bounds.w === Infinity ? n.x : bounds.w - (sizes[n.id]?.w || 180))),
                top: Math.max(0, Math.min(n.y, bounds.h === Infinity ? n.y : bounds.h - (sizes[n.id]?.h || 110))),
                width: sizes[n.id]?.w || 180,
                height: sizes[n.id]?.h || 110,
                zIndex: selected.has(n.id) || drag?.id === n.id ? 10 : 1,
                borderRadius: 6,
                background: NOTE_BG[n.kind],
                boxShadow:
                  drag?.id === n.id
                    ? "0 10px 26px color-mix(in srgb, var(--foreground) 22%, transparent), 0 1px 0 rgba(0,0,0,0.05)"
                    : selected.has(n.id)
                      ? `0 0 0 2px var(--ring), 0 6px 14px color-mix(in srgb, var(--foreground) 14%, transparent), 0 1px 0 rgba(0,0,0,0.05)`
                      : "0 6px 14px color-mix(in srgb, var(--foreground) 12%, transparent), 0 1px 0 rgba(0,0,0,0.05)",
                padding: "10px 12px 12px",
                transform: selected.has(n.id) ? "scale(1.02)" : undefined,
                transition: "transform 100ms ease, box-shadow 120ms ease",
              }}
            >
              <div className="flex items-center justify-between gap-1 text-[9px] font-mono uppercase tracking-[0.08em] text-foreground/55">
                <span className="inline-flex items-center gap-1 min-w-0 flex-1">
                  {n.isAi && (
                    <Sparkles size={9} aria-hidden style={{ color: "var(--n9-accent)" }} />
                  )}
                  {editingTagId === n.id ? (
                    <input
                      autoFocus
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onBlur={() => commitTag(n.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          commitTag(n.id)
                        }
                        if (e.key === "Escape") {
                          setEditingTagId(null)
                          setTagDraft("")
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      maxLength={64}
                      className="min-w-0 max-w-[100px] bg-transparent text-[9px] font-mono uppercase tracking-[0.08em] outline-none text-foreground/80 border-b border-foreground/30"
                    />
                  ) : (
                    <button
                      type="button"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setEditingTagId(n.id)
                        setTagDraft(n.tag ?? "")
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Double-click to rename"
                      className="truncate text-left cursor-text"
                    >
                      {n.tag ?? "Note"}
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(n.id)
                  }}
                  aria-label="Remove note"
                  className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                >
                  <X size={11} aria-hidden />
                </button>
              </div>
              {editingId === n.id ? (
                <textarea
                  autoFocus
                  value={n.body}
                  onChange={(e) => updateBody(n.id, e.target.value)}
                  onBlur={() => {
                    commitBody(n.id)
                    setEditingId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      commitBody(n.id)
                      setEditingId(null)
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="mt-1 flex-1 w-full resize-none bg-transparent text-[12.5px] leading-[17px] outline-none text-foreground break-words"
                  rows={3}
                />
              ) : (
                <div className="mt-1 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[12.5px] leading-[17px] text-foreground scrollbar-thin scrollbar-thumb-foreground/10">
                  {n.body || (
                    <span className="text-foreground/40">Double-click to edit</span>
                  )}
                </div>
              )}
              
              {/* Custom Resize Handle */}
              <div 
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100 flex items-end justify-end p-1 transition-opacity"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setResizing({ id: n.id, startX: e.clientX, startY: e.clientY, startW: sizes[n.id]?.w || 180, startH: sizes[n.id]?.h || 110 })
                }}
              >
                <div className="w-1.5 h-1.5 border-b border-r border-foreground/30" />
              </div>
            </div>
          )
        })}

        {/* Marquee — drawn while user is dragging on empty canvas. */}
        {marquee && (marquee.w > 1 || marquee.h > 1) && (
          <div
            aria-hidden
            className="absolute pointer-events-none border-2 border-dashed border-ring/60 bg-ring/10 rounded-sm"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}

        <div className="pointer-events-none absolute bottom-2 right-3 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
          drag · ⇧-click selects · ⌫ deletes · ⌘D dupes
        </div>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the whiteboard?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This removes all ${notes.length} note${notes.length === 1 ? "" : "s"} from this board. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                clearAll()
                setConfirmClear(false)
              }}
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )

  if (isFullscreen && typeof document !== 'undefined') {
    return (
      <>
        <div className="h-full rounded-[calc(var(--radius)+4px)] border border-border border-dashed bg-muted/20 flex flex-col items-center justify-center text-muted-foreground/50 transition-all">
          <Shapes size={24} className="mb-2 opacity-50" />
          <span className="text-sm">Fullscreen mode active</span>
        </div>
        {createPortal(
          <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm p-4 sm:p-8 flex flex-col">
            {content}
          </div>,
          document.body
        )}
      </>
    )
  }

  return content
}

function EmptyWhiteboard({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
      <Shapes size={22} aria-hidden className="text-muted-foreground/70" />
      <p className="text-[13px] text-foreground">Pin a thought. Sketch a calc. Drop a sticky.</p>
      <button
        type="button"
        onClick={onAdd}
        className="text-[12px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
      >
        Add your first note
      </button>
    </div>
  )
}
