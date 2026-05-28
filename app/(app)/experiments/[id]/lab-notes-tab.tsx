"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AffineBlock } from "@/components/text-editor/affine-block"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import type { Editor } from "@tiptap/react"
import { NoteExportMenu, NotePrintButton } from "@/components/note-export-menu"
import { useToast } from "@/hooks/use-toast"
import { useAutoSave } from "@/hooks/use-auto-save"
import { useContentDiffs } from "@/hooks/use-content-diffs"
import {
  Plus,
  NotebookPen,
  Download,
  FileCode,
  Globe,
  Loader2,
  ChevronLeft,
  MoreVertical,
  Trash2,
  List,
  Pencil,
  X,
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { getUniqueNameErrorMessage } from "@/lib/unique-name-error"
import { useBreadcrumb } from "@/components/layout/breadcrumb-context"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
import { LabNoteChangeApprovalBar } from "@/components/lab-notes/lab-note-change-approval"
import {
  USER_STORAGE_BUCKET,
  createPublishedLabNoteStoragePath,
} from "@/lib/user-storage-bucket"
import { ScientificCalculatorSheet } from "@/components/lab-notes/scientific-calculator"
import { recordRumEvent } from "@/lib/rum"
import {
  DOCUMENT_HIGHLIGHT_EVENT,
  HIGHLIGHT_PARAM,
  decodeHighlightParam,
  normalizeAgentSourceType,
  type HighlightTarget,
} from "@/lib/document-highlight"

interface LabNote {
  id: string;
  title: string;
  content: string;
  note_type: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface LinkedProtocol {
  id: string;
  protocol_id: string;
  protocol: {
    id: string;
    name: string;
    version?: string | null;
  };
}

interface ProtocolItem {
  id: string
  name: string
  version?: string | null
};

export function LabNotesTab({
  experimentId,
  experimentName,
  projectName,
  projectId,
  experimentPageHref,
  experiment,
}: {
  experimentId: string
  experimentName?: string
  projectName?: string
  projectId?: string
  experimentPageHref?: string
  experiment: any
}) {
  const user = useAuthUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { setSegments } = useBreadcrumb();

  const [notes, setNotes] = useState<LabNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<LabNote | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingSwitchNote, setPendingSwitchNote] = useState<LabNote | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    note_type: "general",
  });

  /** Last persisted note body — drives the bottom diff bar (like protocol design mode). */
  const [savedContent, setSavedContent] = useState("");
  /** Baseline for content_diffs — advanced on each recorded history row (auto-save + accept). */
  const historyBaselineRef = useRef("");
  const { recordDiff } = useContentDiffs("lab_note", selectedNote?.id ?? null);

  // Linked protocols state
  const [linkedProtocols, setLinkedProtocols] = useState<LinkedProtocol[]>([]);
  const [availableProtocols, setAvailableProtocols] = useState<ProtocolItem[]>([]);

  // Notebook list panel opens by default so the user immediately sees other
  // notes in this experiment (matches the protocol design-mode sidebar pattern).
  // On mobile the layout collapses regardless via the isMobile branch below.
  const [notebookPanelOpen, setNotebookPanelOpen] = useState(true);

  const [scientificCalculatorOpen, setScientificCalculatorOpen] = useState(false);

  const isMobile = useMediaQuery("(max-width: 768px)");

  // Rename note dialog (used from sidebar note menu)
  const [renameNoteId, setRenameNoteId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  // Inline title editing in card header (no dialog)
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const noteEditorRef = useRef<Editor | null>(null);
  /**
   * Notes list column + editor column — Tiptap region fullscreen applies `position: fixed` to this shell so the
   * whole block tracks SidebarInset `main` (notes rail and editor move together, no inset math).
   */
  const labNotesFullscreenShellRef = useRef<HTMLDivElement>(null);
  const notesAsideRef = useRef<HTMLElement | null>(null);
  const [noteEditorFullscreen, setNoteEditorFullscreen] = useState(false);
  const [noteEditorReady, setNoteEditorReady] = useState(false);
  const [inlineHighlightTarget, setInlineHighlightTarget] =
    useState<HighlightTarget | null>(null);

  // Highlight from AI reference navigation — retries until content is loaded
  const highlightParam = searchParams.get(HIGHLIGHT_PARAM);
  const highlightFiredRef = useRef<string | null>(null);
  // Memo of share-status checks performed this session: maps note id → "published" |
  // "unpublished". Without this, switching notes back and forth re-queries
  // /api/share/note/<id> every time and floods the dev server with 404s.
  const publishStatusCacheRef = useRef<Map<string, "published" | "unpublished">>(new Map());
  const urlHighlightTarget = highlightParam ? decodeHighlightParam(highlightParam) : null;
  const activeHighlightTarget =
    inlineHighlightTarget &&
    normalizeAgentSourceType(inlineHighlightTarget.sourceType) === "lab_note" &&
    inlineHighlightTarget.sourceId === selectedNote?.id
      ? inlineHighlightTarget
      : urlHighlightTarget &&
          normalizeAgentSourceType(urlHighlightTarget.sourceType) === "lab_note" &&
          urlHighlightTarget.sourceId === selectedNote?.id
        ? urlHighlightTarget
        : null;

  useEffect(() => {
    const onHighlight = (event: Event) => {
      const target = (event as CustomEvent<HighlightTarget>).detail;
      if (normalizeAgentSourceType(target.sourceType) !== "lab_note") return;
      if (target.sourceId !== selectedNote?.id) return;
      event.preventDefault();
      setInlineHighlightTarget(target);
      highlightFiredRef.current = null;
    };
    window.addEventListener(DOCUMENT_HIGHLIGHT_EVENT, onHighlight as EventListener);
    return () => {
      window.removeEventListener(
        DOCUMENT_HIGHLIGHT_EVENT,
        onHighlight as EventListener,
      );
    };
  }, [selectedNote?.id]);

  useEffect(() => {
    if (!activeHighlightTarget || !noteEditorReady || !noteEditorRef.current) return;
    const highlightKey = JSON.stringify(activeHighlightTarget);
    if (highlightFiredRef.current === highlightKey) return;

    let cancelled = false;
    const retryDelays = [400, 800, 1500, 2500];
    let attempt = 0;

    const tryHighlight = () => {
      if (cancelled) return;
      const editor = noteEditorRef.current;
      if (!editor) return;
      editor.commands.setRagHighlight(activeHighlightTarget.excerpt);
      requestAnimationFrame(() => {
        if (cancelled) return;
        const el = editor.view.dom.querySelector('.rag-chunk-highlight');
        if (el) {
          // Found it — mark done, scroll to it, schedule fade
          highlightFiredRef.current = highlightKey;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            document.querySelectorAll('.rag-chunk-highlight').forEach((e) => e.classList.add('fading'));
            setTimeout(() => { try { editor.commands.clearRagHighlight(); } catch {} }, 1_200);
          }, 12_000);
        } else if (attempt < retryDelays.length - 1) {
          // No element yet — clear and retry after a longer delay
          try { editor.commands.clearRagHighlight(); } catch {}
          attempt++;
          setTimeout(tryHighlight, retryDelays[attempt]);
        }
      });
    };

    const initialTimer = setTimeout(tryHighlight, retryDelays[0]);
    return () => { cancelled = true; clearTimeout(initialTimer); };
  }, [activeHighlightTarget, selectedNote?.id, noteEditorReady]);

  const recordLabNoteHistory = useCallback(
    async (noteId: string, previousContent: string, newContent: string) => {
      if (previousContent === newContent) return
      const ok = await recordDiff({
        recordType: "lab_note",
        recordId: noteId,
        previousContent,
        newContent,
      })
      if (ok) historyBaselineRef.current = newContent
    },
    [recordDiff],
  )

  // Auto-save: persist to DB and append a content_diffs row for each saved revision.
  const handleAutoSave = async (content: string, title?: string, noteType?: string) => {
    // Use provided values or fall back to formData
    const titleToSave = title !== undefined ? title : formData.title;
    const noteTypeToSave = noteType !== undefined ? noteType : formData.note_type;

    // Don't auto-save if title is empty
    if (!titleToSave.trim()) return;

    try {
      const supabase = createClient();
      if (!user) throw new Error("Not authenticated");

      // If creating a new note, insert it first
      if (isCreating || !selectedNote) {
        const { data, error } = await supabase
          .from("lab_notes")
          .insert({
            experiment_id: experimentId,
            title: titleToSave,
            content,
            note_type: noteTypeToSave,
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;

        recordRumEvent('lab_note_created', { experimentId })

        // Switch to editing mode
        setIsCreating(false);
        setSelectedNote(data);
        setSavedContent(content);
        await recordLabNoteHistory(data.id, historyBaselineRef.current, content);

        // Refresh notes list
        await fetchNotes();
      } else {
        // Update existing note
        const { error } = await supabase
          .from("lab_notes")
          .update({
            content,
            title: titleToSave,
            note_type: noteTypeToSave,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedNote.id);

        if (error) throw error;

        await recordLabNoteHistory(selectedNote.id, historyBaselineRef.current, content);

        // Intentionally do NOT update `savedContent`: it is the baseline the
        // approval bar diffs the live draft against, and gets advanced only
        // by Accept & Save.

        // Update local state — use functional updater to avoid stale closure
        setNotes((prev) =>
          prev.map((note) =>
            note.id === selectedNote.id
              ? {
                ...note,
                content,
                title: titleToSave,
                note_type: noteTypeToSave,
                updated_at: new Date().toISOString(),
              }
              : note
          )
        );
      }
    } catch (error: any) {
      console.error("Auto-save error:", error);
      throw new Error(getUniqueNameErrorMessage(error, "lab_note"));
    }
  };

  const {
    debouncedSave,
    forceSave,
    cancelPendingSave,
    markSynced,
  } = useAutoSave({
    onSave: handleAutoSave,
    delay: 2000, // Save 2 seconds after user stops typing
    enabled: true, // Always enabled, even during creation
  });

  // Baseline for diff bar when switching notes — must mirror selectedNote.content
  // so the approval bar doesn't flash "Pending changes" with the prior note's
  // body as the comparison baseline on the first render after a switch.
  useEffect(() => {
    const baseline = selectedNote?.content ?? "";
    setSavedContent(baseline);
    historyBaselineRef.current = baseline;
  }, [selectedNote?.id]);

  // Fetch existing lab notes
  const noteIdFromQuery = searchParams.get("noteId");

  // Memoize the protocols projection — without this, every keystroke recreates
  // a new array reference and busts memoization inside <TiptapEditor>.
  const editorProtocols = useMemo(
    () => availableProtocols.map((p) => ({ id: p.id, name: p.name, version: p.version })),
    [availableProtocols],
  )

  const editorSamples = useMemo(
    () => (experiment.samples || []).map((s: any) => ({ id: s.id, name: s.name, sample_code: s.sample_code })),
    [experiment.samples]
  )

  // Stable editor callbacks — also recreated on every render previously, which
  // forced TiptapEditor's child memoization to invalidate per keystroke.
  const handleEditorContentChange = useCallback((nextContent: string) => {
    setFormData((prev) => ({ ...prev, content: nextContent }))
    debouncedSave(nextContent)
  // debouncedSave is hoisted below; eslint can't see the order yet
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEditorReady = useCallback((ed: import("@tiptap/react").Editor | null) => {
    noteEditorRef.current = ed
    setNoteEditorReady(!!ed)
  }, [])

  const openScientificCalculator = useCallback(() => setScientificCalculatorOpen(true), [])

  // Mirror selectedNote?.id and isCreating into refs so `fetchNotes` stays
  // referentially stable across selection changes. Previously `fetchNotes`
  // listed `selectedNote?.id` in its deps and got recreated on every note
  // switch — the effect at line ~462 then refired with the *stale*
  // `noteIdFromQuery` (because `router.replace` updates the URL asynchronously),
  // momentarily re-selecting the old note before the URL settled and the
  // next firing re-selected the new one. The TiptapEditor's `key` ping-pong
  // forced ProseMirror to remount three times per click.
  const selectedNoteIdRef = useRef<string | null>(selectedNote?.id ?? null);
  useEffect(() => {
    selectedNoteIdRef.current = selectedNote?.id ?? null;
  }, [selectedNote?.id]);
  const isCreatingRef = useRef(isCreating);
  useEffect(() => {
    isCreatingRef.current = isCreating;
  }, [isCreating]);

  const fetchNotes = useCallback(async (preferredNoteId?: string | null) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("lab_notes")
        .select("*")
        .eq("experiment_id", experimentId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotes(data || []);

      // Auto-select preferred note (from query) or first available when not creating
      if (data && data.length > 0 && !isCreatingRef.current) {
        const next =
          (preferredNoteId && data.find((n) => n.id === preferredNoteId)) ||
          data.find((n) => n.id === selectedNoteIdRef.current) ||
          data[0];

        // Skip the state writes when the resolved note is already the one
        // we're showing — without this, every refetch replaces selectedNote
        // with a new reference (same id, fresh row from the network), which
        // briefly remounts the editor via `key={selectedNote?.id}` and wipes
        // any in-flight diff/edit state for no user-visible benefit.
        if (next && next.id !== selectedNoteIdRef.current) {
          setSelectedNote(next);
          setFormData({
            title: next.title,
            content: next.content,
            note_type: next.note_type || "general",
          });
        }
      }
    } catch (error: any) {
      console.error("Error fetching notes:", error);
      toast({
        title: "Couldn't load lab notes",
        description: error?.message ?? "Please refresh the page.",
        variant: "destructive",
      });
    }
  }, [experimentId, toast]);

  // Fetch current user ID
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const supabase = createClient();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    // Guard against a previous experiment's `fetchNotes` resolving after the
    // user has navigated to a new experiment and overwriting the fresh
    // `notes` list. fetchNotes itself can't cancel (it's a useCallback), but
    // we can flip a flag to no-op late state writers indirectly — here we
    // just skip the call if it would land on an unmounted/stale instance.
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchNotes(noteIdFromQuery);
    })();
    return () => {
      cancelled = true;
    };
  }, [experimentId, noteIdFromQuery, fetchNotes]);

  // Sync header breadcrumb: project › experiment › current note name.
  // On unmount (e.g. user switches to Overview tab) we restore the 2-segment
  // base instead of clearing — clearing would leave the breadcrumb blank
  // because the parent page's <SetPageBreadcrumb> doesn't re-fire on tab
  // change (its segments prop is stable).
  useEffect(() => {
    if (!projectName || !experimentName) return;
    const baseSegments = [
      { label: projectName, href: projectId ? `/projects/${projectId}` : undefined },
      {
        label: experimentName,
        href: experimentPageHref,
      },
    ];
    const noteTitle = formData.title || selectedNote?.title || "Lab notes";
    setSegments([...baseSegments, { label: noteTitle }]);
    return () => {
      setSegments(baseSegments);
    };
  }, [
    projectName,
    experimentName,
    projectId,
    experimentPageHref,
    setSegments,
    formData.title,
    selectedNote?.title,
  ]);

  // Focus and select title input when entering inline edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Fetch all available protocols for mentions
  useEffect(() => {
    const fetchAllProtocols = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("protocols")
        .select("id, name, version")
        .order("name");

      if (data) {
        setAvailableProtocols(data);
      }
    };

    fetchAllProtocols();
  }, []);

  // Fetch linked protocols when a note is selected
  useEffect(() => {
    if (selectedNote && !isCreating) {
      fetchLinkedProtocols(selectedNote.id);
    } else {
      setLinkedProtocols([]);
    }
  }, [selectedNote?.id, isCreating]);

  // Published if public API returns JSON (works for any viewer; storage may be author-only).
  // Dep is `selectedNote?.id` so we don't refire on every parent re-render (the prior
  // `[selectedNote]` dep was object-identity and caused a 404 storm on toggle-back).
  // Result is memoized per session so unpublished notes don't get re-fetched.
  useEffect(() => {
    const id = selectedNote?.id;
    setPublicUrl(null);
    if (!id) return;

    const cached = publishStatusCacheRef.current.get(id);
    if (cached === "unpublished") return;
    if (cached === "published") {
      setPublicUrl(`${window.location.origin}/share/note/${id}`);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/share/note/${encodeURIComponent(id)}`, {
          method: "GET",
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.ok) {
          publishStatusCacheRef.current.set(id, "published");
          setPublicUrl(`${window.location.origin}/share/note/${id}`);
        } else if (res.status === 404) {
          publishStatusCacheRef.current.set(id, "unpublished");
        }
        // Other status codes (5xx, 401) intentionally NOT cached so a transient
        // server hiccup gets re-asked next time the user opens the note.
      } catch {
        /* network blip — leave uncached so a retry is possible */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedNote?.id]);

  // Sync current note metadata to document root for external/accessibility use
  useEffect(() => {
    const root = document.documentElement;
    const attrs: Record<string, string> = {
      "data-experiment-id": String(experimentId ?? ""),
    };

    if (selectedNote && !isCreating) {
      attrs["data-note-id"] = selectedNote.id;
      attrs["data-note-title"] = selectedNote.title || "New Lab Note";
      attrs["data-note-created-at"] = selectedNote.created_at ?? "";
      attrs["data-note-updated-at"] = selectedNote.updated_at ?? "";
    } else if (isCreating) {
      attrs["data-note-title"] = formData.title.trim() || "New Lab Note";
      attrs["data-note-created-at"] = "";
      attrs["data-note-updated-at"] = "";
    } else {
      attrs["data-note-id"] = "";
      attrs["data-note-title"] = "";
      attrs["data-note-created-at"] = "";
      attrs["data-note-updated-at"] = "";
    }

    for (const [key, value] of Object.entries(attrs)) {
      root.setAttribute(key, value);
    }

    return () => {
      root.removeAttribute("data-note-id");
      root.removeAttribute("data-note-title");
      root.removeAttribute("data-note-created-at");
      root.removeAttribute("data-note-updated-at");
      root.removeAttribute("data-experiment-id");
    };
  }, [experimentId, selectedNote, isCreating, formData.title]);

  const handlePublish = async () => {
    if (!selectedNote) return;

    try {
      setIsPublishing(true);
      const supabase = createClient();
      if (!user || user.id !== selectedNote.created_by) {
        toast({
          title: "Cannot publish",
          description: "Only the note author can publish to storage.",
          variant: "destructive",
        });
        setIsPublishing(false);
        return;
      }

      const jsonBlob = new Blob(
        [
          JSON.stringify({
            title: formData.title,
            content: formData.content,
            updatedAt: new Date().toISOString(),
          }),
        ],
        { type: "application/json" }
      );

      const objectPath = createPublishedLabNoteStoragePath(
        selectedNote.created_by,
        selectedNote.id
      );
      const { error } = await supabase.storage.from(USER_STORAGE_BUCKET).upload(objectPath, jsonBlob, {
        upsert: true,
        contentType: "application/json",
      });

      if (error) throw error;

      setPublicUrl(`${window.location.origin}/share/note/${selectedNote.id}`);
      toast({
        title: "Note Published",
        description: "Your note is now publicly available.",
      });
    } catch (error: any) {
      console.error("Publish error:", error);
      toast({
        title: "Publish Failed",
        description: error.message || "Failed to publish note.",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!selectedNote) return;

    try {
      setIsPublishing(true);
      const supabase = createClient();
      if (!user || user.id !== selectedNote.created_by) {
        toast({
          title: "Cannot unpublish",
          description: "Only the note author can remove the published file.",
          variant: "destructive",
        });
        setIsPublishing(false);
        return;
      }

      const objectPath = createPublishedLabNoteStoragePath(
        selectedNote.created_by,
        selectedNote.id
      );
      const { error } = await supabase.storage.from(USER_STORAGE_BUCKET).remove([objectPath]);

      if (error) throw error;

      setPublicUrl(null);
      toast({
        title: "Note Unpublished",
        description: "Your note is no longer public.",
      });
    } catch (error: any) {
      toast({
        title: "Unpublish Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };


  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for your lab note.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
      if (!user) throw new Error("Not authenticated");

      if (selectedNote && !isCreating) {
        // Update existing note
        const { error } = await supabase
          .from("lab_notes")
          .update({
            title: formData.title,
            content: formData.content,
            note_type: formData.note_type,
          })
          .eq("id", selectedNote.id);

        if (error) throw error;

        setSavedContent(formData.content);

        toast({
          title: "Note updated",
          description: "Your lab note has been updated successfully.",
        });
      } else {
        // Create new note
        const { error } = await supabase.from("lab_notes").insert({
          experiment_id: experimentId,
          title: formData.title,
          content: formData.content,
          note_type: formData.note_type,
          created_by: user.id,
        });

        if (error) throw error;

        setSavedContent(formData.content);

        recordRumEvent('lab_note_created', { experimentId })

        toast({
          title: "Note created",
          description: "Your lab note has been created successfully.",
        });

        setIsCreating(false);
      }

      // Refresh notes list
      await fetchNotes();
      router.refresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: getUniqueNameErrorMessage(error, "lab_note"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getUniqueDefaultTitle = async (): Promise<string> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("lab_notes")
      .select("title")
      .eq("experiment_id", experimentId);
    const existing = (data || []).map((r) => (r as { title: string }).title);
    if (!existing.includes("New Lab Note")) return "New Lab Note";
    let n = 2;
    while (existing.includes(`New Lab Note (${n})`)) n++;
    return `New Lab Note (${n})`;
  };

  const handleNewNote = async () => {
    setIsCreatingNew(true);
    // Drop any pending debounced save before the selectedNote pivot. Without
    // this, content typed in note A 1.5s before the user clicked + would fire
    // its update after the pivot and overwrite the just-created note N with
    // A's body (since handleAutoSave reads the latest selectedNote at fire
    // time, not at schedule time).
    cancelPendingSave();
    try {
      const supabase = createClient();
      if (!user) throw new Error("Not authenticated");

      const defaultTitle = await getUniqueDefaultTitle();
      const { data, error } = await supabase
        .from("lab_notes")
        .insert({
          experiment_id: experimentId,
          title: defaultTitle,
          content: "",
          note_type: "general",
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      recordRumEvent('lab_note_created', { experimentId })
      try {
        if (typeof window !== 'undefined' && !window.sessionStorage.getItem('n9_first_note_sent')) {
          recordRumEvent('user_first_note', {})
          window.sessionStorage.setItem('n9_first_note_sent', '1')
        }
      } catch {}

      toast({
        title: "Note created",
        description: "New lab note created. You can rename it anytime.",
      });

      await fetchNotes(data.id);
      setSelectedNote(data);
      setFormData({
        title: data.title,
        content: data.content,
        note_type: data.note_type || "general",
      });
      setIsCreating(false);
      // Point the URL at the freshly-created note so the sidebar highlight
      // moves and the editor's `key={selectedNote?.id}` flips to remount with
      // an empty body.
      syncNoteIdInUrl(data.id);
    } catch (error: any) {
      console.error("Error creating note:", error);
      toast({
        title: "Error",
        description: getUniqueNameErrorMessage(error, "lab_note"),
        variant: "destructive",
      });
    } finally {
      setIsCreatingNew(false);
    }
  };

  const fetchLinkedProtocols = async (noteId: string) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("lab_note_protocols")
        .select(`
          id,
          protocol_id,
          protocol:protocols(id, name, version)
        `)
        .eq("lab_note_id", noteId);

      if (error) throw error;

      // Map the data to handle Supabase returning protocol as array
      const mapped = (data || []).map((item: any) => ({
        id: item.id,
        protocol_id: item.protocol_id,
        protocol: Array.isArray(item.protocol) ? item.protocol[0] : item.protocol,
      })).filter((item: any) => item.protocol);

      setLinkedProtocols(mapped);
    } catch (error: any) {
      // A Supabase PostgrestError logs as "{}" via console.error(obj) because
      // its fields are non-enumerable; pull them out so the cause is visible.
      const code = error?.code ?? null;
      const message = error?.message ?? null;
      const details = error?.details ?? null;
      const hint = error?.hint ?? null;
      console.error("Error fetching linked protocols:", {
        noteId,
        code,
        message,
        details,
        hint,
      });
      setLinkedProtocols([]);
      // Only surface a toast for a *real* failure. An empty error object (no
      // code/message — e.g. an RLS-filtered embed or aborted request on note
      // switch) is benign and was previously spamming a destructive toast on
      // every note open.
      if (code || message) {
        toast({
          title: "Couldn't load linked protocols",
          description: message ?? "Try refreshing the page.",
          variant: "destructive",
        });
      }
    }
  };

  const removeLinkedProtocol = async (linkId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("lab_note_protocols")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      setLinkedProtocols(prev => prev.filter(p => p.id !== linkId));
      toast({
        title: "Protocol unlinked",
        description: "Protocol removed from this note",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove protocol",
        variant: "destructive",
      });
    }
  };

  /**
   * Mirror the currently-open note into the URL via `?noteId=<id>`. Used by
   * the sidebar select-note and the `+` create-note flows so the URL is
   * always the source of truth — without this, refresh would jump back to
   * the stale `noteId` and the sidebar highlight wouldn't update.
   * Pass `null` to clear the param entirely (e.g. when no note is selected).
   */
  const syncNoteIdInUrl = useCallback(
    (noteId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (noteId) {
        if (next.get("noteId") === noteId) return; // no-op when already in sync
        next.set("noteId", noteId);
      } else {
        if (!next.has("noteId")) return;
        next.delete("noteId");
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname ?? "", { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const performSwitchToNote = useCallback((note: LabNote) => {
    cancelPendingSave();
    setIsCreating(false);
    setSelectedNote(note);
    setFormData({
      title: note.title,
      content: note.content,
      note_type: note.note_type || "general",
    });
    setSavedContent(note.content);
    fetchLinkedProtocols(note.id);
    syncNoteIdInUrl(note.id);
  }, [cancelPendingSave, fetchLinkedProtocols, syncNoteIdInUrl]);

  const handleSelectNote = (note: LabNote) => {
    if (note.id === selectedNote?.id) return; // already viewing this note
    const hasPendingChanges =
      selectedNote != null && formData.content !== savedContent;
    if (hasPendingChanges) {
      setPendingSwitchNote(note);
      return;
    }
    performSwitchToNote(note);
  };

  const handleDeleteNote = async (e: React.MouseEvent, note: LabNote) => {
    e.stopPropagation();
    // Optimistic delete: hide the note immediately so the click feels instant,
    // then issue the network call. On failure we re-insert and surface a toast
    // — the user only ever sees a delay if it actually fails, which is rare.
    const previousNotes = notes;
    const wasSelected = selectedNote?.id === note.id;
    const previousSelected = selectedNote;
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    if (wasSelected) {
      cancelPendingSave(); // don't let a queued save fire against the deleted row
      setSelectedNote(null);
      setIsCreating(true);
      setFormData({ title: "", content: "", note_type: "general" });
      syncNoteIdInUrl(null); // drop stale noteId from URL
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.from("lab_notes").delete().eq("id", note.id);
      if (error) throw error;
      toast({ title: "Note deleted", description: `"${note.title}" has been removed.` });
    } catch (err: any) {
      // Roll back local state — restore the deleted row in its prior position,
      // and re-select it if it was active so the user doesn't lose their place.
      setNotes(previousNotes);
      if (wasSelected) {
        setSelectedNote(previousSelected);
        setIsCreating(false);
        if (previousSelected) {
          setFormData({
            title: previousSelected.title,
            content: previousSelected.content,
            note_type: previousSelected.note_type || "general",
          });
          syncNoteIdInUrl(previousSelected.id);
        }
      }
      toast({
        title: "Couldn't delete note",
        description: err.message || "The note was restored. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openRenameNote = (e: React.MouseEvent, note: LabNote) => {
    e.stopPropagation();
    setRenameNoteId(note.id);
    setRenameTitle(note.title || "");
  };

  const handleRenameNote = async () => {
    if (!renameNoteId || !renameTitle.trim()) return;
    const id = renameNoteId;
    const newTitle = renameTitle.trim();
    // Capture the previous title in case we need to roll back. Reading the
    // current notes array (vs the selectedNote object) handles renames on
    // notes other than the one currently being viewed.
    const previousTitle = notes.find((n) => n.id === id)?.title ?? "";
    const previousSelectedTitle = selectedNote?.id === id ? selectedNote.title : null;
    const nowIso = new Date().toISOString();

    // Optimistic update — close the dialog and reflect the rename immediately.
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, title: newTitle, updated_at: nowIso } : n)),
    );
    if (selectedNote?.id === id) {
      setFormData((f) => ({ ...f, title: newTitle }));
      setSelectedNote((prev) => (prev?.id === id ? { ...prev, title: newTitle } : prev));
    }
    setRenameNoteId(null);
    setRenameTitle("");

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("lab_notes")
        .update({ title: newTitle, updated_at: nowIso })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Note renamed", description: "Title updated." });
    } catch (err: any) {
      // Roll back: restore the original title in the list and (if applicable)
      // in the currently-selected note + form. Reopen the rename dialog so
      // the user lands back in the same modal with their attempted title
      // preserved — easier than starting over from the row menu.
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, title: previousTitle } : n)),
      );
      if (previousSelectedTitle !== null) {
        setFormData((f) => ({ ...f, title: previousSelectedTitle }));
        setSelectedNote((prev) =>
          prev?.id === id ? { ...prev, title: previousSelectedTitle } : prev,
        );
      }
      setRenameNoteId(id);
      setRenameTitle(newTitle);
      toast({
        title: "Couldn't rename note",
        description: getUniqueNameErrorMessage(err, "lab_note"),
        variant: "destructive",
      });
    }
  };

  const handleInlineTitleSave = async () => {
    if (!selectedNote) return;
    const newTitle = formData.title.trim();
    if (!newTitle) {
      setFormData((f) => ({ ...f, title: selectedNote.title || "" }));
      setIsEditingTitle(false);
      return;
    }
    if (newTitle === (selectedNote.title || "")) {
      setIsEditingTitle(false);
      return;
    }
    // Optimistic: close edit mode and reflect the new title immediately in
    // the list, header, and selectedNote so blur → render feels instant.
    const previousTitle = selectedNote.title || "";
    const id = selectedNote.id;
    const nowIso = new Date().toISOString();
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, title: newTitle, updated_at: nowIso } : n)),
    );
    setSelectedNote((prev) => (prev?.id === id ? { ...prev, title: newTitle } : prev));
    setIsEditingTitle(false);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("lab_notes")
        .update({ title: newTitle, updated_at: nowIso })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Note renamed", description: "Title updated." });
    } catch (err: any) {
      // Roll back the optimistic title swap and reopen the inline editor so
      // the user can correct the value without losing what they typed.
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, title: previousTitle } : n)),
      );
      setSelectedNote((prev) => (prev?.id === id ? { ...prev, title: previousTitle } : prev));
      setFormData((f) => ({ ...f, title: newTitle }));
      setIsEditingTitle(true);
      toast({
        title: "Couldn't rename note",
        description: getUniqueNameErrorMessage(err, "lab_note"),
        variant: "destructive",
      });
    }
  };

  /** PDF/print + downloads: prefer in-form title, then saved note title (avoids empty title in exports). */
  const resolvedExportTitle =
    (formData.title || "").trim() || (selectedNote?.title || "").trim() || "Lab note";

  /** Fullscreen note: list + title + save share one row with Tiptap toolbar (… | tools | …). */
  const labNoteMergedFullscreenToolbar =
    noteEditorFullscreen && (selectedNote != null || isCreating);

  const labNoteFullscreenToolbarLeading = labNoteMergedFullscreenToolbar ? (
    <div className="flex min-w-0 w-full max-w-[min(11rem,min(56vw,100%))] items-center gap-1.5 sm:max-w-[min(18rem,38%)] sm:gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-foreground pointer-events-auto"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setNotebookPanelOpen((open) => !open);
        }}
        aria-label={notebookPanelOpen ? "Hide notes" : "Show notes"}
        title={notebookPanelOpen ? "Hide notes list" : `Show notes (${notes.length})`}
      >
        {notebookPanelOpen ? (
          <ChevronLeft className="h-4 w-4 pointer-events-none" />
        ) : (
          <List className="h-4 w-4 pointer-events-none" />
        )}
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <div className="min-w-0 flex-1">
          {isEditingTitle && selectedNote ? (
            <input
              ref={titleInputRef}
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
              onBlur={handleInlineTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  titleInputRef.current?.blur();
                }
                if (e.key === "Escape") {
                  setFormData((f) => ({ ...f, title: selectedNote.title || "" }));
                  setIsEditingTitle(false);
                  titleInputRef.current?.blur();
                }
              }}
              className="w-full border-b border-transparent bg-transparent pb-0.5 text-base font-semibold leading-none text-foreground outline-none focus:border-primary"
              aria-label="Edit note title"
            />
          ) : (
            <div
              className={cn(
                "truncate",
                !isCreating && selectedNote && "cursor-pointer rounded px-1 -mx-1 hover:bg-muted/60 hover:text-foreground"
              )}
              onClick={() => {
                if (!isCreating && selectedNote) setIsEditingTitle(true);
              }}
              role={!isCreating && selectedNote ? "button" : undefined}
              tabIndex={!isCreating && selectedNote ? 0 : undefined}
              onKeyDown={(e) => {
                if (!isCreating && selectedNote && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  setIsEditingTitle(true);
                }
              }}
              aria-label={!isCreating && selectedNote ? "Click to edit title" : undefined}
            >
              <CardTitle className="truncate text-base font-semibold leading-none text-foreground">
                {isCreating
                  ? "New Lab Note"
                  : (!selectedNote ? "Lab Notes" : formData.title || "New Lab Note")}
              </CardTitle>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : undefined;

  const labNoteFullscreenToolbarTrailing = labNoteMergedFullscreenToolbar ? (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="m-0 shrink-0 text-muted-foreground hover:text-foreground"
        disabled={isCreatingNew}
        onClick={() => {
          setNotebookPanelOpen(true);
          handleNewNote();
        }}
        aria-label="Add lab note to this experiment"
        title="Add lab note to this experiment"
      >
        {isCreatingNew ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </Button>
      {!isCreating && selectedNote ? (
        <>
          <NotePrintButton
            getHtmlContent={() => formData.content || ""}
            title={resolvedExportTitle}
            includeCommentsInPdf
          />
          <NoteExportMenu
            title={resolvedExportTitle}
            htmlContent={formData.content || ""}
            getHtmlContent={() => formData.content || ""}
            getTiptapJson={() => noteEditorRef.current?.getJSON() ?? null}
            includeCommentsInPdf
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Export"
              >
                <Download className="h-4 w-4" />
              </Button>
            }
          />
        </>
      ) : null}
    </>
  ) : undefined;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Rename note dialog */}
      <Dialog
        open={!!renameNoteId}
        onOpenChange={(open) => {
          if (!open) {
            setRenameNoteId(null);
            setRenameTitle("");
          }
        }}
      >
        <DialogContent dialogSize="sm" onPointerDownOutside={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Rename note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-title">Note name</Label>
            <Input
              id="rename-title"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Note title"
              onKeyDown={(e) => e.key === "Enter" && handleRenameNote()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameNoteId(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameNote} disabled={!renameTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Card: notes list (when open) + editor */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <Card className="flex h-full min-h-0 flex-col gap-0 py-0">
          <div
            ref={labNotesFullscreenShellRef}
            data-editor-workspace-shell=""
            className="flex h-full min-h-0 min-w-0 flex-1 flex-row items-stretch overflow-hidden"
          >
            {/* Notes list - inside card, left side (hidden on mobile; use Sheet instead) */}
            <aside
              ref={notesAsideRef}
              className={cn(
                "flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden border-r border-border bg-muted/30 relative",
                !isMobile && notebookPanelOpen
                  ? cn(
                      "w-52 min-w-[13rem] bg-card",
                      /* Above editor column (z-0) and TipTap chrome — critical when workspace is fullscreen z-110 */
                      noteEditorFullscreen ? "z-[120]" : "z-10",
                    )
                  : "w-0 min-w-0 border-r-0 overflow-hidden",
              )}
              aria-hidden={!notebookPanelOpen || isMobile}
            >
              {!isMobile && notebookPanelOpen && (
                <div className="flex h-full min-h-0 w-52 min-w-[13rem] flex-col gap-0 p-2">
                  <div className="flex h-9 shrink-0 items-center px-1">
                    <span className="truncate text-xs font-medium text-muted-foreground">Notes</span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto mt-1">
                    {notes.length > 0 ? (
                      <ul className="flex w-full min-w-0 flex-col gap-0.5">
                        {notes.map((note) => {
                          const isActive = selectedNote?.id === note.id && !isCreating;
                          const createdStr = new Date(note.created_at).toLocaleString();
                          const updatedStr = new Date(note.updated_at).toLocaleString();
                          return (
                            <li key={note.id} className="group/list-item relative">
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => handleSelectNote(note)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    handleSelectNote(note);
                                  }
                                }}
                                data-note-id={note.id}
                                data-created-at={note.created_at}
                                data-updated-at={note.updated_at}
                                title={`Created: ${createdStr} · Updated: ${updatedStr}`}
                                className={cn(
                                  "grid w-full min-h-8 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted/80",
                                  isActive && "bg-muted font-medium"
                                )}
                              >
                                <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <p className="min-w-0 truncate font-medium m-0 text-sm">
                                  {note.title || "New Lab Note"}
                                </p>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 shrink-0 opacity-70 hover:opacity-100"
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label="Note options"
                                    >
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenuItem onClick={(e) => openRenameNote(e, note)}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={(e) => handleDeleteNote(e, note)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete note
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 px-2 py-6">
                        <p className="text-center text-xs text-muted-foreground w-3/4">Create your first lab notebook by clicking "+" button</p>
                        <Button
                          onClick={handleNewNote}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={isCreatingNew}
                        >
                          {isCreatingNew ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="mr-2 h-3.5 w-3.5" />
                          )}
                          New note
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </aside>

            {/* Mobile: notes list in a Sheet overlay so it doesn't squeeze the editor */}
            {isMobile && (
              <Sheet open={notebookPanelOpen} onOpenChange={setNotebookPanelOpen}>
                <SheetContent
                  side="left"
                  showCloseButton={false}
                  /* TipTap workspace fullscreen uses z-110 — portal must stack above it */
                  overlayClassName="z-[120]"
                  className={cn(
                    "z-[120] flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col gap-0 p-0",
                    /* Beat sheet.tsx defaults (w-full / sm:w-3/4) so width stays predictable on all phone sizes */
                    "w-[min(88vw,20rem)] max-w-[min(20rem,calc(100vw-1.5rem))] border-r sm:w-[min(88vw,24rem)] sm:max-w-sm",
                    "pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)]",
                  )}
                >
                  <SheetHeader className="!flex-row shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3 pb-3">
                    <SheetTitle className="text-base leading-none">Notes</SheetTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 touch-manipulation"
                      onClick={() => setNotebookPanelOpen(false)}
                      aria-label="Close notes list"
                    >
                      <X className="h-5 w-5" aria-hidden />
                    </Button>
                  </SheetHeader>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-y-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-2">
                    {notes.length > 0 ? (
                      <ul className="flex w-full min-w-0 flex-col gap-0.5">
                        {notes.map((note) => {
                          const isActive = selectedNote?.id === note.id && !isCreating;
                          const createdStr = new Date(note.created_at).toLocaleString();
                          const updatedStr = new Date(note.updated_at).toLocaleString();
                          return (
                            <li key={note.id} className="group/list-item relative">
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  handleSelectNote(note);
                                  setNotebookPanelOpen(false);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    handleSelectNote(note);
                                    setNotebookPanelOpen(false);
                                  }
                                }}
                                data-note-id={note.id}
                                title={`Created: ${createdStr} · Updated: ${updatedStr}`}
                                className={cn(
                                  "grid w-full min-h-10 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-muted/80 active:bg-muted/90",
                                  isActive && "bg-muted font-medium"
                                )}
                              >
                                <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <p className="min-w-0 truncate font-medium m-0 text-sm">
                                  {note.title || "New Lab Note"}
                                </p>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 shrink-0 touch-manipulation opacity-70 hover:opacity-100"
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label="Note options"
                                    >
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenuItem onClick={(e) => { openRenameNote(e, note); setNotebookPanelOpen(false); }}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={(e) => handleDeleteNote(e, note)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete note
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 px-2 py-6">
                        <p className="text-center text-xs text-muted-foreground w-3/4">Create your first lab notebook by clicking "+" button</p>
                        <Button
                          onClick={() => {
                            setNotebookPanelOpen(false);
                            handleNewNote();
                          }}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={isCreatingNew}
                        >
                          {isCreatingNew ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="mr-2 h-3.5 w-3.5" />
                          )}
                          New note
                        </Button>
                      </div>
                    )}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            )}

            {/* Editor area - header + content (fullscreen lives on parent shell: notes list + this column) */}
            <div
              className={cn(
                "relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                noteEditorFullscreen
                  ? "gap-0 py-0 sm:py-0"
                  : "gap-4 py-4",
              )}
            >
              {!labNoteMergedFullscreenToolbar && (
              <CardHeader
                className={cn(
                  "shrink-0",
                  noteEditorFullscreen
                    ? "gap-1 border-b border-border/70 px-3 py-1.5 sm:px-4 [.border-b]:pb-1.5 items-center"
                    : "pb-0 px-4 sm:px-6",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-1 min-w-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground hover:text-foreground pointer-events-auto"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setNotebookPanelOpen((open) => !open);
                      }}
                      aria-label={notebookPanelOpen ? "Hide notes" : "Show notes"}
                      title={notebookPanelOpen ? "Hide notes list" : `Show notes (${notes.length})`}
                    >
                      {notebookPanelOpen ? (
                        <ChevronLeft className="h-4 w-4 pointer-events-none" />
                      ) : (
                        <List className="h-4 w-4 pointer-events-none" />
                      )}
                    </Button>
                    <div className="flex flex-1 min-w-0 items-center gap-1">
                      <div className="flex-1 min-w-0">
                        {isEditingTitle && selectedNote ? (
                          <input
                            ref={titleInputRef}
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                            onBlur={handleInlineTitleSave}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                titleInputRef.current?.blur();
                              }
                              if (e.key === "Escape") {
                                setFormData((f) => ({ ...f, title: selectedNote.title || "" }));
                                setIsEditingTitle(false);
                                titleInputRef.current?.blur();
                              }
                            }}
                            className={cn(
                              "w-full bg-transparent font-semibold text-foreground leading-none outline-none border-b border-transparent focus:border-primary",
                              noteEditorFullscreen ? "text-base" : "text-lg",
                            )}
                            aria-label="Edit note title"
                          />
                        ) : (
                          <div
                            className={cn(
                              "truncate",
                              !isCreating && selectedNote && "cursor-pointer rounded px-1 -mx-1 hover:bg-muted/60 hover:text-foreground"
                            )}
                            onClick={() => {
                              if (!isCreating && selectedNote) setIsEditingTitle(true);
                            }}
                            role={!isCreating && selectedNote ? "button" : undefined}
                            tabIndex={!isCreating && selectedNote ? 0 : undefined}
                            onKeyDown={(e) => {
                              if (!isCreating && selectedNote && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                setIsEditingTitle(true);
                              }
                            }}
                            aria-label={!isCreating && selectedNote ? "Click to edit title" : undefined}
                          >
                            <CardTitle
                              className={cn(
                                "font-semibold text-foreground truncate leading-none",
                                noteEditorFullscreen ? "text-base" : "text-lg",
                              )}
                            >
                              {isCreating
                                ? "New Lab Note"
                                : (!selectedNote ? "Lab Notes" : formData.title || "New Lab Note")}
                            </CardTitle>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="m-0 text-muted-foreground hover:text-foreground"
                      disabled={isCreatingNew}
                      onClick={() => {
                        setNotebookPanelOpen(true);
                        handleNewNote();
                      }}
                      aria-label="Add lab note to this experiment"
                      title="Add lab note to this experiment"
                    >
                      {isCreatingNew ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                    {!isCreating && selectedNote && (
                      <>
                        <NotePrintButton
                          getHtmlContent={() => formData.content || ""}
                          title={resolvedExportTitle}
                          includeCommentsInPdf
                        />
                        <NoteExportMenu
                          title={resolvedExportTitle}
                          htmlContent={formData.content || ""}
                          getHtmlContent={() => formData.content || ""}
                          getTiptapJson={() => noteEditorRef.current?.getJSON() ?? null}
                          includeCommentsInPdf
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Export"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              )}
              <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3 overflow-hidden px-4 sm:px-6">
                {!isCreating && !selectedNote ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
                    <p className="text-lg font-medium mb-2">No note selected</p>
                    <p className="text-sm text-center max-w-sm mb-6">
                      Select a note from the sidebar or create your first lab notebook by clicking "+" button
                    </p>
                    <Button onClick={handleNewNote}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Note
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Same editor + approval column layout as protocol design mode */}
                    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                      <TiptapEditor
                        // Hard-remount when the selected note changes so a fresh ProseMirror
                        // state is built. Without the key, the editor's internal
                        // `lastEmittedHtmlRef` can suppress the setContent() the parent issues
                        // and the previous note's body bleeds into a brand-new note.
                        key={selectedNote?.id ?? "new-note"}
                        content={formData.content}
                        onChange={handleEditorContentChange}
                        placeholder="Write your lab notes here... Use @ to tag protocols"
                        title={resolvedExportTitle}
                        minHeight="100%"
                        fillParentHeight
                        fullscreenWorkspaceRef={labNotesFullscreenShellRef}
                        onEditorFullscreenChange={setNoteEditorFullscreen}
                        leadingToolbarSlot={labNoteFullscreenToolbarLeading}
                        trailingToolbarSlot={labNoteFullscreenToolbarTrailing}
                        showAITools={true}
                        showAiWritingDropdown={false}
                        protocols={editorProtocols}
                        samples={editorSamples}
                        hideExportControls
                        exportIncludeCommentsInPdf
                        enableMath
                        className="min-h-0 flex-1"
                        onOpenScientificCalculator={openScientificCalculator}
                        onEditorReady={handleEditorReady}
                      />
                      <ScientificCalculatorSheet
                        open={scientificCalculatorOpen}
                        onOpenChange={setScientificCalculatorOpen}
                        getEditor={() => noteEditorRef.current}
                      />
                    </div>
                    {(selectedNote || isCreating) && !!formData.title.trim() && (
                      <LabNoteChangeApprovalBar
                        savedContent={savedContent}
                        draftContent={formData.content}
                        noteId={selectedNote?.id ?? null}
                        onAccept={async (newContent) => {
                          // Mirror the prior cloud-button behavior: cancel the
                          // pending debounced auto-save, run the full handleSave
                          // flow (title validation, toast, list refresh, router
                          // refresh), then advance the diff baseline so the
                          // approval bar collapses to "No pending changes".
                          cancelPendingSave();
                          await handleSave();
                          setSavedContent(newContent);
                          historyBaselineRef.current = newContent;
                        }}
                        onReject={() => {
                          cancelPendingSave();
                          setFormData((f) => ({ ...f, content: savedContent }));
                          markSynced();
                        }}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </div>
          </div>
        </Card>
      </div>
      <AlertDialog open={pendingSwitchNote !== null} onOpenChange={(open) => { if (!open) setPendingSwitchNote(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              {`You have unsaved edits in "${selectedNote?.title || 'this note'}". Save them before switching?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSwitchNote(null)}>Stay</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const target = pendingSwitchNote
                setPendingSwitchNote(null)
                if (target) performSwitchToNote(target)
              }}
            >
              Discard
            </Button>
            <AlertDialogAction
              onClick={async () => {
                const target = pendingSwitchNote
                setPendingSwitchNote(null)
                try {
                  await forceSave()
                } catch (err) {
                  console.error('Save before switch failed', err)
                  toast({ title: "Couldn't save", description: 'The previous note was kept. Please try again.', variant: 'destructive' })
                  return
                }
                if (target) performSwitchToNote(target)
              }}
            >
              Save and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
