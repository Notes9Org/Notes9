"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit, Star, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function EditLiteratureReviewDialog({
  literature,
  onSuccess,
}: {
  literature: any;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [filteredExperiments, setFilteredExperiments] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: literature.title,
    authors: literature.authors || "",
    journal: literature.journal || "",
    publication_year: literature.publication_year?.toString() || "",
    volume: literature.volume || "",
    issue: literature.issue || "",
    pages: literature.pages || "",
    doi: literature.doi || "",
    pmid: literature.pmid || "",
    url: literature.url || "",
    abstract: literature.abstract || "",
    keywords: literature.keywords?.join(", ") || "",
    personal_notes: literature.personal_notes || "",
    relevance_rating: literature.relevance_rating || 0,
    project_id: literature.project_id || (undefined as string | undefined),
    experiment_id:
      literature.experiment_id || (undefined as string | undefined),
    status: literature.status,
  });

  useEffect(() => {
    if (open) {
      fetchProjects();
      fetchExperiments();
    }
  }, [open]);

  useEffect(() => {
    if (formData.project_id) {
      const filtered = experiments.filter(
        (exp) => exp.project_id === formData.project_id
      );
      setFilteredExperiments(filtered);
      if (
        formData.experiment_id &&
        !filtered.find((e) => e.id === formData.experiment_id)
      ) {
        setFormData({ ...formData, experiment_id: undefined });
      }
    } else {
      setFilteredExperiments([]);
      if (formData.experiment_id) {
        setFormData({ ...formData, experiment_id: undefined });
      }
    }
  }, [formData.project_id, experiments]);

  const fetchProjects = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .order("name");
    if (data) setProjects(data);
  };

  const fetchExperiments = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("experiments")
      .select("id, name, project_id")
      .order("name");
    if (data) setExperiments(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const supabase = createClient();

      const keywordsArray = formData.keywords
        ? formData.keywords
            .split(",")
            .map((k: string) => k.trim())
            .filter((k: string) => k)
        : null;

      const { error } = await supabase
        .from("literature_reviews")
        .update({
          title: formData.title,
          authors: formData.authors || null,
          journal: formData.journal || null,
          publication_year: formData.publication_year
            ? parseInt(formData.publication_year)
            : null,
          volume: formData.volume || null,
          issue: formData.issue || null,
          pages: formData.pages || null,
          doi: formData.doi || null,
          pmid: formData.pmid || null,
          url: formData.url || null,
          abstract: formData.abstract || null,
          keywords: keywordsArray,
          personal_notes: formData.personal_notes || null,
          relevance_rating: formData.relevance_rating || null,
          project_id: formData.project_id || null,
          experiment_id: formData.experiment_id || null,
          status: formData.status,
        })
        .eq("id", literature.id);

      if (error) throw error;

      toast({
        title: "Literature reference updated",
        description: "Reference has been updated successfully.",
      });

      setOpen(false);
      router.refresh();

      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Literature Reference</DialogTitle>
          <DialogDescription>
            Update citation and reference information
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Citation Details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="authors">Authors</Label>
              <Input
                id="authors"
                value={formData.authors}
                onChange={(e) =>
                  setFormData({ ...formData, authors: e.target.value })
                }
                disabled={isLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="journal">Journal</Label>
                <Input
                  id="journal"
                  value={formData.journal}
                  onChange={(e) =>
                    setFormData({ ...formData, journal: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publication_year">Year</Label>
                <Input
                  id="publication_year"
                  type="number"
                  value={formData.publication_year}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      publication_year: e.target.value,
                    })
                  }
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="volume">Volume</Label>
                <Input
                  id="volume"
                  value={formData.volume}
                  onChange={(e) =>
                    setFormData({ ...formData, volume: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issue">Issue</Label>
                <Input
                  id="issue"
                  value={formData.issue}
                  onChange={(e) =>
                    setFormData({ ...formData, issue: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pages">Pages</Label>
                <Input
                  id="pages"
                  value={formData.pages}
                  onChange={(e) =>
                    setFormData({ ...formData, pages: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doi">DOI</Label>
                <Input
                  id="doi"
                  value={formData.doi}
                  onChange={(e) =>
                    setFormData({ ...formData, doi: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pmid">PubMed ID</Label>
                <Input
                  id="pmid"
                  value={formData.pmid}
                  onChange={(e) =>
                    setFormData({ ...formData, pmid: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) =>
                  setFormData({ ...formData, url: e.target.value })
                }
                disabled={isLoading}
              />
            </div>
          </div>

          <Separator />

          {/* Content & Notes */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="abstract">Abstract</Label>
              <Textarea
                id="abstract"
                rows={3}
                value={formData.abstract}
                onChange={(e) =>
                  setFormData({ ...formData, abstract: e.target.value })
                }
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords (comma-separated)</Label>
              <Input
                id="keywords"
                value={formData.keywords}
                onChange={(e) =>
                  setFormData({ ...formData, keywords: e.target.value })
                }
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="personal_notes">Personal Notes</Label>
              <Textarea
                id="personal_notes"
                rows={3}
                value={formData.personal_notes}
                onChange={(e) =>
                  setFormData({ ...formData, personal_notes: e.target.value })
                }
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label>Relevance Rating</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, relevance_rating: rating })
                    }
                    className="focus:outline-none"
                    disabled={isLoading}
                  >
                    <Star
                      className={`h-5 w-5 ${
                        rating <= formData.relevance_rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                      } hover:scale-110 transition-transform`}
                    />
                  </button>
                ))}
                {formData.relevance_rating > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setFormData({ ...formData, relevance_rating: 0 })
                    }
                    disabled={isLoading}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Link to Research */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="project_id">Project (Optional)</Label>
                <Select
                  value={formData.project_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, project_id: value })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger id="project_id">
                    <SelectValue placeholder="Select project (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="experiment_id">Experiment (Optional)</Label>
                <Select
                  value={formData.experiment_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, experiment_id: value })
                  }
                  disabled={!formData.project_id || isLoading}
                >
                  <SelectTrigger id="experiment_id">
                    <SelectValue
                      placeholder={
                        formData.project_id
                          ? "Select experiment (optional)"
                          : "Select project first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredExperiments.map((experiment) => (
                      <SelectItem key={experiment.id} value={experiment.id}>
                        {experiment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Reading Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saved">Saved</SelectItem>
                  <SelectItem value="reading">Reading</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Separator = () => <div className="border-t my-4" />;
