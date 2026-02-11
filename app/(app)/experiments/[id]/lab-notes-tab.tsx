"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { AffineBlock } from "@/components/text-editor/affine-block"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"
import { useToast } from "@/hooks/use-toast"
import { useAutoSave } from "@/hooks/use-auto-save"
import { useCollaborativeEditor } from "@/hooks/useCollaborativeEditor"
import { SaveStatusIndicator } from "@/components/ui/save-status"
import { Save, Plus, FileText, Download, FileCode, Globe, Loader2, X, Users } from "lucide-react"
import { LinkNoteProtocolDialog } from "./link-note-protocol-dialog"
import { CollaboratorsDialog } from "@/components/lab-notes/collaborators-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils";

const COLLAB_WEBSOCKET_URL =
  process.env.NEXT_PUBLIC_COLLAB_SERVER ?? "ws://localhost:3001/collab";

const AWARENESS_COLORS = [
  "#2563eb",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#be123c",
  "#4f46e5",
];

function getAwarenessColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return AWARENESS_COLORS[hash % AWARENESS_COLORS.length];
}

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
}: {
  experimentId: string
  experimentName?: string
  projectName?: string
  projectId?: string
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [notes, setNotes] = useState<LabNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<LabNote | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [collabToken, setCollabToken] = useState<string | null>(null);
  const [collabUser, setCollabUser] = useState<{
    id: string;
    name: string;
    color: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    note_type: "general",
  });

  // Linked protocols state
  const [linkedProtocols, setLinkedProtocols] = useState<LinkedProtocol[]>([]);
  const latestContentRef = useRef(formData.content);
  const selectedNoteIdRef = useRef<string | null>(null);
  const linkedProtocolsFetchIdRef = useRef(0);

  const syncNoteQueryParam = (noteId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (noteId) {
      params.set("noteId", noteId);
    } else {
      params.delete("noteId");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  useEffect(() => {
    latestContentRef.current = formData.content;
  }, [formData.content]);

  useEffect(() => {
    selectedNoteIdRef.current = selectedNote?.id ?? null;
  }, [selectedNote?.id]);

  // Auto-save functionality
  const handleAutoSave = async (
    content: string,
    title?: string,
    noteType?: string,
    noteId?: string | null
  ) => {
    // Use provided values or fall back to formData
    const titleToSave = title !== undefined ? title : formData.title;
    const noteTypeToSave = noteType !== undefined ? noteType : formData.note_type;
    const targetNoteId = noteId ?? selectedNoteIdRef.current;
    const shouldCreate = !targetNoteId;

    // Don't auto-save if title is empty
    if (!titleToSave.trim()) return;

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not authenticated");

      // If creating a new note, insert it first
      if (shouldCreate) {
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
        selectedNoteIdRef.current = data.id;

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
          .eq("id", targetNoteId);

        if (error) throw error;

        // Update local state
        setNotes((previousNotes) =>
          previousNotes.map((note) =>
            note.id === targetNoteId
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
      throw error; // Re-throw to trigger error status in auto-save hook
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
  const collaborationDocumentId =
    !isCreating && selectedNote ? `lab-note:${selectedNote.id}` : null;

  const { ydoc, provider, isSynced } = useCollaborativeEditor({
    documentId: collaborationDocumentId,
    websocketUrl: COLLAB_WEBSOCKET_URL,
    token: collabToken,
    user: collabUser,
    enabled: Boolean(collaborationDocumentId && collabToken && collabUser),
  });

  const collaborationConfig = useMemo(() => {
    // Safety guard: only enable collaborative editor once initial Yjs sync completes.
    // This prevents an empty unsynced Y.Doc from replacing already-saved note content.
    if (!ydoc || !provider || !collabUser || !isSynced) return undefined;
    return {
      document: ydoc,
      provider,
      user: collabUser,
      field: "default",
      isSynced,
    };
  }, [ydoc, provider, collabUser, isSynced]);

  // Fetch current user ID
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      setCollabToken(session?.access_token ?? null);
      if (user) {
        setCurrentUserId(user.id);
        const name =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          [user.user_metadata?.first_name, user.user_metadata?.last_name]
            .filter(Boolean)
            .join(" ") ||
          user.email ||
          "Anonymous";

        setCollabUser({
          id: user.id,
          name,
          color: getAwarenessColor(user.id),
        });
      } else {
        setCollabUser(null);
      }
    };

    fetchCurrentUser();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCollabToken(session?.access_token ?? null);
      const authUser = session?.user;

      if (!authUser) {
        setCollabUser(null);
        return;
      }

      const name =
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        [authUser.user_metadata?.first_name, authUser.user_metadata?.last_name]
          .filter(Boolean)
          .join(" ") ||
        authUser.email ||
        "Anonymous";

      setCollabUser({
        id: authUser.id,
        name,
        color: getAwarenessColor(authUser.id),
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    fetchNotes(noteIdFromQuery);
  }, [experimentId, noteIdFromQuery]);

  // Fetch linked protocols when a note is selected
  useEffect(() => {
    if (selectedNote && !isCreating) {
      fetchLinkedProtocols(selectedNote.id);
    } else {
      linkedProtocolsFetchIdRef.current += 1;
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
          syncNoteQueryParam(next.id);
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
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewNote = async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not authenticated");

      // Create new note with "untitled" as default title
      const { data, error } = await supabase
        .from("lab_notes")
        .insert({
          experiment_id: experimentId,
          title: "untitled",
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

      // Refresh notes list and select the new note
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
        description: error.message || "Failed to create note",
        variant: "destructive",
      });
    }
  };

  const fetchLinkedProtocols = async (noteId: string) => {
    const fetchId = ++linkedProtocolsFetchIdRef.current;
    try {
      const response = await fetch(`/api/lab-notes/linked-protocols?labNoteId=${noteId}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to fetch linked protocols");
      }

      const data = await response.json();
      if (fetchId !== linkedProtocolsFetchIdRef.current) return;
      setLinkedProtocols(data.linkedProtocols || []);
    } catch (error: any) {
      console.error("Error fetching linked protocols:", error);
      if (fetchId !== linkedProtocolsFetchIdRef.current) return;
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
    syncNoteQueryParam(note.id);
    fetchLinkedProtocols(note.id);
  };

  return (
    <div className="flex gap-4 w-full">
      {/* Left Sidebar - Notes List */}
      <div className="w-48 shrink-0">
        <Card className="h-full">
          <CardHeader className="">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">NOTEBOOK</CardTitle>
              <Button
                onClick={handleNewNote}
                size="icon"
                variant="ghost"
                className="h-8 w-8"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-0 border-t">
              {notes.length > 0 ? (
                notes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => handleSelectNote(note)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors",
                      selectedNote?.id === note.id && !isCreating
                        ? "bg-muted border-l-4 border-l-primary"
                        : "border-l-4 border-l-transparent"
                    )}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {note.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(note.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No notes yet</p>
                  <Button
                    onClick={handleNewNote}
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                  >
                    Create your first note
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Side - Note Editor */}
      <div className="flex-1 min-w-0">
        <Card className="h-full">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-foreground">
                  {isCreating
                    ? "New Lab Note"
                    : formData.title || "Untitled Lab Note"}
                </CardTitle>
                <CardDescription>
                  Document your observations, analysis, and findings
                </CardDescription>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* Save Status Button - Google Drive Style */}
                <SaveStatusIndicator
                  status={autoSaveStatus}
                  lastSaved={lastSaved}
                />
                {!isCreating && selectedNote && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export
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
                {!isCreating && selectedNote && (
                  <CollaboratorsDialog 
                    labNoteId={selectedNote.id}
                    labNoteTitle={selectedNote.title}
                  />
                )}

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
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title & Type */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setFormData({ ...formData, title: newTitle });
                    // Trigger auto-save when title changes, passing the new title directly
                    debouncedSave(
                      formData.content,
                      newTitle,
                      formData.note_type,
                      selectedNote?.id ?? null
                    );
                  }}
                  placeholder="e.g., Day 3 Observations"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="note_type">Note Type</Label>
                <Select
                  value={formData.note_type}
                  onValueChange={(value) => {
                    setFormData({ ...formData, note_type: value });
                    // Trigger auto-save when note type changes, passing the new note type directly
                    debouncedSave(
                      formData.content,
                      formData.title,
                      value,
                      selectedNote?.id ?? null
                    );
                  }}
                >
                  <SelectTrigger id="note_type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="observation">Observation</SelectItem>
                    <SelectItem value="analysis">Analysis</SelectItem>
                    <SelectItem value="conclusion">Conclusion</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linked Protocols */}
            {!isCreating && selectedNote && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Linked Protocols</Label>
                  <LinkNoteProtocolDialog
                    noteId={selectedNote.id}
                    linkedProtocolIds={linkedProtocols.map(p => p.protocol_id)}
                    onLink={() => fetchLinkedProtocols(selectedNote.id)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {linkedProtocols.length > 0 ? (
                    linkedProtocols.map((link) => (
                      <Badge
                        key={link.id}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1 cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/x-protocol",
                            JSON.stringify({
                              id: link.protocol_id,
                              name: link.protocol.name,
                            })
                          );
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        <span>{link.protocol.name}</span>
                        {link.protocol.version && (
                          <span className="text-muted-foreground text-xs">v{link.protocol.version}</span>
                        )}
                        <button
                          type="button"
                          title="Remove linked protocol"
                          onClick={() => removeLinkedProtocol(link.id)}
                          className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No protocols linked</span>
                  )}
                </div>
              </div>
            )}

            {/* Rich Text Editor */}
            <div className="space-y-2">
              <Label>Content</Label>
              <TiptapEditor
                content={formData.content}
                onChange={(content) => {
                  // Ignore no-op changes.
                  if (content === latestContentRef.current) return;

                  setFormData((previous) => ({ ...previous, content }));
                  // Trigger auto-save (works for both creation and editing)
                  debouncedSave(
                    content,
                    formData.title,
                    formData.note_type,
                    selectedNote?.id ?? null
                  );
                }}
                placeholder="Write your lab notes here... Use @ to tag protocols"
                title={formData.title || "lab-note"}
                minHeight="400px"
                showAITools={true}
                collaboration={collaborationConfig}
                protocols={linkedProtocols.map(lp => ({
                  id: lp.protocol_id,
                  name: lp.protocol.name,
                  version: lp.protocol.version,
                }))}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                onClick={handleSave}
                disabled={isSaving || !formData.title.trim()}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save Note"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
