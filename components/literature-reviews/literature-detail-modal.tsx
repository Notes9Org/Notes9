"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiteratureDetailView } from "./literature-detail-view";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface LiteratureDetailModalProps {
  literatureId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "overview" | "pdf" | "citation" | "linked";
}

// Mirrors the LiteratureData shape consumed by LiteratureDetailView. The
// Supabase `select("*", ...joins)` returns a broad row; we narrow it to the
// fields the view actually reads so the rest of this component is type-safe.
interface LiteratureData {
  id: string;
  title: string;
  authors: string | null;
  journal: string | null;
  publication_year: number | null;
  doi: string | null;
  pmid: string | null;
  status: string;
  relevance_rating: number | null;
  abstract: string | null;
  keywords: string[] | null;
  personal_notes: string | null;
  url: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  pdf_file_url: string | null;
  pdf_file_name: string | null;
  pdf_file_size: number | null;
  pdf_file_type: string | null;
  pdf_storage_path: string | null;
  pdf_uploaded_at: string | null;
  pdf_checksum: string | null;
  pdf_match_source: string | null;
  pdf_metadata: Record<string, unknown> | null;
  pdf_import_status?: string | null;
  created_at: string;
  project: { id: string; name: string } | null;
  experiment: { id: string; name: string } | null;
  created_by_profile: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

export function LiteratureDetailModal({
  literatureId,
  open,
  onOpenChange,
  initialTab = "overview",
}: LiteratureDetailModalProps) {
  const [literature, setLiterature] = useState<LiteratureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && literatureId) {
      fetchLiterature();
    } else {
      // Reset state when modal closes
      setLiterature(null);
      setError(null);
    }
  }, [open, literatureId]);

  const fetchLiterature = async () => {
    if (!literatureId) return;

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("literature_reviews")
        .select(
          `
          *,
          created_by_profile:profiles!literature_reviews_created_by_fkey(
            first_name,
            last_name,
            email
          ),
          project:projects(id, name),
          experiment:experiments(id, name)
        `
        )
        .eq("id", literatureId)
        .single();

      if (error) {
        setError("Failed to load literature details");
        console.error("Error fetching literature:", error);
      } else {
        // The select returns a broad joined row; narrow to the fields the
        // view reads. Shape is guaranteed by the select above.
        setLiterature(data as unknown as LiteratureData);
      }
    } catch (err) {
      setError("Failed to load literature details");
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dialogSize="xl" className="glass-panel max-h-[90vh] overflow-y-auto pt-12" overlayClassName="glass-overlay">
        <DialogHeader className="sr-only">
          <DialogTitle>{literature?.title || "Literature details"}</DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-12">
            <p className="text-destructive">{error}</p>
          </div>
        )}

        {literature && !loading && (
          <LiteratureDetailView
            literature={literature}
            showBreadcrumb={false}
            showActions={true}
            onRefresh={fetchLiterature}
            initialTab={initialTab}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
