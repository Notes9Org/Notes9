"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
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
import { useToast } from "@/hooks/use-toast"
import { useAutoSave } from "@/hooks/use-auto-save"
import { SaveStatusIndicator } from "@/components/ui/save-status"
import { Plus, FileText, Download, FileCode, Globe, Loader2, Users, ChevronLeft, ChevronRight, MoreVertical, Trash2, List, Pencil } from "lucide-react"
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
    version: string | null;
  };
}

export function LabNotesTab({
  experimentId,
  experimentName,
  projectName,
  projectId,
}: {
  experimentId: string
  experimentName?: string
  projectName?: string
  projectId?: string
}) {
  const router = useRouter();
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

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    note_type: "general",
  });

  // Linked protocols state
  const [linkedProtocols, setLinkedProtocols] = useState<LinkedProtocol[]>([]);

  // Notebook list panel collapsed for more note-taking space (start closed)
  const [notebookPanelOpen, setNotebookPanelOpen] = useState(false);

  // Rename note dialog (used from sidebar note menu)
  const [renameNoteId, setRenameNoteId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  // Inline title editing in card header (no dialog)
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const toolbarPortalRef = useRef<HTMLDivElement>(null);
  const toolbarPortalReadyRef = useRef(false);
  const [, setToolbarPortalReady] = useState(false);

  // Auto-save functionality
  const handleAutoSave = async (content: string, title?: string, noteType?: string) => {
    // Use provided values or fall back to formData
    const titleToSave = title !== undefined ? title : formData.title;
    const noteTypeToSave = noteType !== undefined ? noteType : formData.note_type;

    // Don't auto-save if title is empty
    if (!titleToSave.trim()) return;

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

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

        // Switch to editing mode
        setIsCreating(false);
        setSelectedNote(data);

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

        // Update local state
        setNotes(
          notes.map((note) =>
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
    status: autoSaveStatus,
    lastSaved,
    debouncedSave,
  } = useAutoSave({
    onSave: handleAutoSave,
    delay: 2000, // Save 2 seconds after user stops typing
    enabled: true, // Always enabled, even during creation
  });

  // Fetch existing lab notes
  const noteIdFromQuery = searchParams.get("noteId");

  // Fetch current user ID
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    fetchNotes(noteIdFromQuery);
  }, [experimentId, noteIdFromQuery]);

  // Sync header breadcrumb: project › experiment › current note name
  useEffect(() => {
    if (!projectName || !experimentName) return;
    const baseSegments = [
      { label: projectName, href: projectId ? `/projects/${projectId}` : undefined },
      { label: experimentName },
    ];
    const noteTitle = formData.title || selectedNote?.title || "Lab notes";
    setSegments([...baseSegments, { label: noteTitle }]);
    return () => {
      setSegments(baseSegments);
    };
  }, [projectName, experimentName, projectId, setSegments, formData.title, selectedNote?.title]);

  // Focus and select title input when entering inline edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Fetch linked protocols when a note is selected
  useEffect(() => {
    if (selectedNote && !isCreating) {
      fetchLinkedProtocols(selectedNote.id);
    } else {
      setLinkedProtocols([]);
    }
  }, [selectedNote?.id, isCreating]);

  // Check if note is published when selected
  useEffect(() => {
    const checkPublicStatus = async () => {
      setPublicUrl(null);
      if (!selectedNote) return;

      const supabase = createClient();
      const { data } = await supabase.storage
        .from("lab_notes_public")
        .list("", {
          search: `${selectedNote.id}.json`,
        });

      if (data && data.length > 0) {
        setPublicUrl(`${window.location.origin}/share/note/${selectedNote.id}`);
      }
    };

    checkPublicStatus();
  }, [selectedNote]);

  // Sync current note metadata to document root for external/accessibility use
  useEffect(() => {
    const root = document.documentElement;
    const attrs: Record<string, string> = {
      "data-experiment-id": String(experimentId ?? ""),
    };

    if (selectedNote && !isCreating) {
      attrs["data-note-id"] = selectedNote.id;
      attrs["data-note-title"] = selectedNote.title || "Untitled";
      attrs["data-note-created-at"] = selectedNote.created_at ?? "";
      attrs["data-note-updated-at"] = selectedNote.updated_at ?? "";
    } else if (isCreating) {
      attrs["data-note-title"] = formData.title.trim() || "Untitled";
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

      const { error } = await supabase.storage
        .from("lab_notes_public")
        .upload(`${selectedNote.id}.json`, jsonBlob, {
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

      const { error } = await supabase.storage
        .from("lab_notes_public")
        .remove([`${selectedNote.id}.json`]);

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

  const fetchNotes = async (preferredNoteId?: string | null) => {
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
      if (data && data.length > 0 && !isCreating) {
        const next =
          (preferredNoteId && data.find((n) => n.id === preferredNoteId)) ||
          data.find((n) => n.id === selectedNote?.id) ||
          data[0];

        if (next) {
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
    }
  };



  const downloadAsHTML = () => {
    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${formData.title}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1, h2, h3 { margin-top: 1.5em; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f4f4f4; }
  </style>
</head>
<body>
  <h1>${formData.title}</h1>
  ${formData.content}
</body>
</html>`;
    const blob = new Blob([fullHTML], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formData.title || "lab-note"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAsMarkdown = async () => {
    try {
      // @ts-ignore
      const TurndownService = (await import('turndown')).default;
      // @ts-ignore
      const { gfm } = await import('turndown-plugin-gfm');

      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
      });

      turndownService.use(gfm);

      const markdown = turndownService.turndown(formData.content);
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${formData.title || "lab-note"}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Markdown exported",
        description: "Your note has been exported as Markdown.",
      });
    } catch (error: any) {
      console.error("Markdown export error:", error);
      toast({
        title: "Export failed",
        description: "Failed to export as Markdown.",
        variant: "destructive",
      });
    }
  };

  const downloadAsPDF = async () => {
    // Use iframe-based print approach for complete style isolation
    // This prevents CSS leaks that can break the main page
    let iframe: HTMLIFrameElement | null = null;

    try {
      toast({
        title: "Generating PDF",
        description: "Opening print dialog...",
      });

      // Create an isolated iframe for printing
      iframe = document.createElement("iframe");
      iframe.style.cssText = `
        position: fixed;
        right: 0;
        bottom: 0;
        width: 0;
        height: 0;
        border: 0;
        visibility: hidden;
      `;
      document.body.appendChild(iframe);

      // Wait for iframe to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error("Could not access iframe document");
      }

      // Sanitize HTML helper
      const sanitizeHtml = (html: string) => {
        return html
          .replace(/lab\([^)]+\)/gi, '#000000')
          .replace(/lch\([^)]+\)/gi, '#000000')
          .replace(/oklab\([^)]+\)/gi, '#000000')
          .replace(/oklch\([^)]+\)/gi, '#000000')
          .replace(/var\([^)]+\)/gi, '#000000');
      };

      const cleanContent = sanitizeHtml(formData.content || "");

      // Write isolated HTML with comprehensive print-friendly styles
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${formData.title || "Lab Note"}</title>
          <style>
            /* Reset */
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            /* Base */
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              font-size: 12pt;
              line-height: 1.6;
              padding: 40px;
              background: #fff;
              color: #000;
              max-width: 100%;
            }
            
            /* Typography */
            h1 { font-size: 24pt; font-weight: 700; margin: 0 0 20pt; border-bottom: 2pt solid #333; padding-bottom: 10pt; }
            h2 { font-size: 18pt; font-weight: 600; margin: 20pt 0 10pt; border-bottom: 1pt solid #ccc; padding-bottom: 5pt; }
            h3 { font-size: 14pt; font-weight: 600; margin: 15pt 0 8pt; }
            h4 { font-size: 12pt; font-weight: 600; margin: 12pt 0 6pt; }
            p { margin: 8pt 0; }
            
            /* Text formatting */
            strong, b { font-weight: 700; }
            em, i { font-style: italic; }
            u { text-decoration: underline; }
            s, strike { text-decoration: line-through; }
            sub { vertical-align: sub; font-size: 0.8em; }
            sup { vertical-align: super; font-size: 0.8em; }
            mark { background: #ff0; padding: 0 2px; }
            
            /* Links */
            a { color: #0066cc; text-decoration: underline; }
            
            /* Lists */
            ul, ol { margin: 10pt 0; padding-left: 25pt; }
            li { margin: 4pt 0; }
            ul { list-style-type: disc; }
            ol { list-style-type: decimal; }
            
            /* Task lists */
            ul[data-type="taskList"] { list-style: none; padding-left: 0; }
            ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
            
            /* Blockquotes */
            blockquote {
              border-left: 4pt solid #666;
              padding-left: 15pt;
              margin: 15pt 0;
              color: #444;
              font-style: italic;
            }
            
            /* Code */
            code {
              font-family: 'Courier New', Courier, monospace;
              font-size: 10pt;
              background: #f0f0f0;
              padding: 1pt 4pt;
              border-radius: 2pt;
            }
            pre {
              font-family: 'Courier New', Courier, monospace;
              font-size: 10pt;
              background: #f0f0f0;
              padding: 12pt;
              border-radius: 4pt;
              margin: 12pt 0;
              overflow-x: auto;
              white-space: pre-wrap;
              word-break: break-word;
            }
            pre code { background: none; padding: 0; }
            
            /* Tables - High contrast for print */
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 15pt 0;
              font-size: 11pt;
            }
            th, td {
              border: 1pt solid #000;
              padding: 8pt 10pt;
              text-align: left;
              vertical-align: top;
            }
            th {
              background: #e8e8e8 !important;
              font-weight: 700;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            td p { margin: 0; }
            
            /* Images */
            img { max-width: 100%; height: auto; margin: 10pt 0; }
            
            /* Horizontal rule */
            hr { border: none; border-top: 1pt solid #666; margin: 20pt 0; }
            
            /* Print-specific */
            @media print {
              body { padding: 0; }
              @page { margin: 20mm; }
            }
          </style>
        </head>
        <body>
          <h1>${formData.title || "Lab Note"}</h1>
          ${cleanContent}
        </body>
        </html>
      `);
      iframeDoc.close();

      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 200));

      // Use browser's print functionality
      const printWindow = iframe.contentWindow;
      if (printWindow) {
        printWindow.focus();
        printWindow.print();
      }

      toast({
        title: "Print dialog opened",
        description: "Save as PDF from your browser's print dialog.",
      });

      // Clean up after a delay to allow print dialog to work
      setTimeout(() => {
        if (iframe && document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    } catch (error: any) {
      console.error("PDF export error:", error);
      // Clean up on error
      if (iframe && document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      toast({
        title: "Export failed",
        description: error.message || "Failed to export as PDF.",
        variant: "destructive",
      });
    }
  };


  const downloadAsDOCX = async () => {
    try {
      toast({
        title: "Generating DOCX",
        description: "Please wait...",
      });

      // Get clean content
      const cleanContent = formData.content || "<p>No content</p>";

      // Dynamically import the DOCX export function (proper .docx format!)
      const { exportHtmlToDocx } = await import('@/lib/docx-export')

      // Export to DOCX (works on Mac, Windows, Linux!)
      await exportHtmlToDocx(cleanContent, formData.title || "Lab Note");

      toast({
        title: "DOCX exported",
        description: "Your note has been exported as DOCX.",
      });
    } catch (error: any) {
      console.error("DOCX export error:", error);
      toast({
        title: "Export failed",
        description: error.message || "Failed to export as DOCX. Please try HTML or PDF format instead.",
        variant: "destructive",
      });
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
      const {
        data: { user },
      } = await supabase.auth.getUser();

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
    if (!existing.includes("Untitled")) return "Untitled";
    let n = 2;
    while (existing.includes(`Untitled (${n})`)) n++;
    return `Untitled (${n})`;
  };

  const handleNewNote = async () => {
    setIsCreatingNew(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

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
    } catch (error) {
      console.error("Error fetching linked protocols:", error);
      setLinkedProtocols([]);
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

  const handleSelectNote = (note: LabNote) => {
    setIsCreating(false);
    setSelectedNote(note);
    setFormData({
      title: note.title,
      content: note.content,
      note_type: note.note_type || "general",
    });
    fetchLinkedProtocols(note.id);
  };

  const handleDeleteNote = async (e: React.MouseEvent, note: LabNote) => {
    e.stopPropagation();
    try {
      const supabase = createClient();
      const { error } = await supabase.from("lab_notes").delete().eq("id", note.id);
      if (error) throw error;
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
      if (selectedNote?.id === note.id) {
        setSelectedNote(null);
        setIsCreating(true);
        setFormData({ title: "", content: "", note_type: "general" });
      }
      toast({ title: "Note deleted", description: `"${note.title}" has been removed.` });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete note",
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
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("lab_notes")
        .update({ title: renameTitle.trim(), updated_at: new Date().toISOString() })
        .eq("id", renameNoteId);
      if (error) throw error;
      setNotes((prev) =>
        prev.map((n) =>
          n.id === renameNoteId ? { ...n, title: renameTitle.trim(), updated_at: new Date().toISOString() } : n
        )
      );
      if (selectedNote?.id === renameNoteId) {
        setFormData((f) => ({ ...f, title: renameTitle.trim() }));
        setSelectedNote((prev) =>
          prev?.id === renameNoteId ? { ...prev, title: renameTitle.trim() } : prev
        );
      }
      toast({ title: "Note renamed", description: "Title updated." });
      setRenameNoteId(null);
      setRenameTitle("");
    } catch (err: any) {
      toast({
        title: "Error",
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
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("lab_notes")
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq("id", selectedNote.id);
      if (error) throw error;
      setNotes((prev) =>
        prev.map((n) =>
          n.id === selectedNote.id ? { ...n, title: newTitle, updated_at: new Date().toISOString() } : n
        )
      );
      setSelectedNote((prev) => (prev?.id === selectedNote.id ? { ...prev, title: newTitle } : prev));
      toast({ title: "Note renamed", description: "Title updated." });
    } catch (err: any) {
      toast({
        title: "Error",
        description: getUniqueNameErrorMessage(err, "lab_note"),
        variant: "destructive",
      });
    }
    setIsEditingTitle(false);
  };

  return (
    <div className="flex w-full min-h-0 flex-1">
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
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.stopPropagation()}>
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
        <Card className="h-full flex flex-col min-h-0 py-0 gap-0 overflow-hidden">
          <div className="flex flex-row flex-1 min-h-0 min-w-0">
            {/* Notes list - inside card, left side */}
            <aside
              className={cn(
                "flex shrink-0 flex-col overflow-hidden border-r border-border bg-muted/30 relative",
                notebookPanelOpen ? "w-52 min-w-[13rem] z-10 bg-card" : "w-0 min-w-0 border-r-0 overflow-hidden"
              )}
              aria-hidden={!notebookPanelOpen}
            >
              {notebookPanelOpen && (
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
                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <p className="min-w-0 truncate font-medium m-0 text-sm">
                                  {note.title || "Untitled"}
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
                        <p className="text-center text-xs text-muted-foreground">No notes yet</p>
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

            {/* Editor area - header + content */}
            <div className="flex flex-1 min-w-0 min-h-0 flex-col py-4 gap-4 relative z-0">
          <CardHeader className="pb-0 px-4 sm:px-6 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-1 min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground pointer-events-auto"
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
                      className="w-full bg-transparent text-lg font-semibold text-foreground leading-none outline-none border-b border-transparent focus:border-primary"
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
                      <CardTitle className="text-lg font-semibold text-foreground truncate leading-none">
                        {isCreating
                          ? "New Lab Note"
                          : formData.title || "Untitled Lab Note"}
                      </CardTitle>
                    </div>
                  )}
                </div>
                <SaveStatusIndicator
                  status={autoSaveStatus}
                  lastSaved={lastSaved}
                  variant="icon"
                  onClick={handleSave}
                  disabled={isSaving || !formData.title.trim()}
                />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 m-0 text-muted-foreground hover:text-foreground"
                  disabled={isCreatingNew}
                  onClick={() => {
                    setNotebookPanelOpen(true);
                    handleNewNote();
                  }}
                  aria-label="New lab note"
                >
                  {isCreatingNew ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
                {!isCreating && selectedNote && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        aria-label="Export"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Download as...</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={downloadAsMarkdown}>
                        <FileCode className="h-4 w-4 mr-2" />
                        Markdown (.md)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={downloadAsHTML}>
                        <FileText className="h-4 w-4 mr-2" />
                        HTML (.html)
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={downloadAsPDF}>
                        <FileText className="h-4 w-4 mr-2" />
                        PDF (.pdf)
                      </DropdownMenuItem>
                      {/* <DropdownMenuItem onClick={downloadAsDOCX}>
                        <FileText className="h-4 w-4 mr-2" />
                        Word (.docx)
                      </DropdownMenuItem> */}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {/* Share Button - Google Docs style */}

                {/* Publish button temporarily hidden */}
                {/* {!isCreating && selectedNote && (
                  <div className="flex items-center gap-2">
                    {publicUrl ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                          onClick={() => {
                            navigator.clipboard.writeText(publicUrl)
                            toast({ title: "Copied!", description: "Public link copied to clipboard." })
                          }}
                        >
                          <Globe className="h-4 w-4 mr-2" />
                          Published
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePublish}
                          disabled={isPublishing}
                        >
                          {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Republish"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={isPublishing}
                          onClick={handleUnpublish}
                        >
                          Unpublish
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePublish}
                        disabled={isPublishing}
                      >
                        {isPublishing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Publishing...
                          </>
                        ) : (
                          <>
                            <Globe className="h-4 w-4 mr-2" />
                            Publish
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )} */}
              </div>
            </div>
            <div
              ref={(el) => {
                (toolbarPortalRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                if (el && !toolbarPortalReadyRef.current) {
                  toolbarPortalReadyRef.current = true;
                  setToolbarPortalReady(true);
                }
              }}
              className="min-h-0"
            />
          </CardHeader>
          <CardContent className="space-y-3 px-4 sm:px-6">
            {/* Rich Text Editor */}
            <div>
              <TiptapEditor
                content={formData.content}
                onChange={(content) => {
                  setFormData({ ...formData, content });
                  // Trigger auto-save (works for both creation and editing)
                  debouncedSave(content);
                }}
                placeholder="Write your lab notes here... Use @ to tag protocols"
                title={formData.title || "lab-note"}
                minHeight="400px"
                showAITools={true}
                protocols={linkedProtocols.map(lp => ({
                  id: lp.protocol_id,
                  name: lp.protocol.name,
                  version: lp.protocol.version,
                }))}
                toolbarPortalRef={toolbarPortalRef}
              />
            </div>
          </CardContent>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
