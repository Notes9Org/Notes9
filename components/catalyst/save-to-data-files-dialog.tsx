'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { PostgrestError } from '@supabase/supabase-js';
import { commitArtifact } from '@/lib/agent-artifacts';
import type { AgentArtifact } from '@/hooks/use-agent-stream';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProjectRow {
  id: string;
  name: string;
}
interface ExperimentRow {
  id: string;
  name: string;
}

interface SaveToDataFilesDialogProps {
  artifact: AgentArtifact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful commit so the parent can flip the card to "saved". */
  onSaved: (args: { experimentId: string; signedUrl: string | null }) => void;
}

export function SaveToDataFilesDialog({
  artifact,
  open,
  onOpenChange,
  onSaved,
}: SaveToDataFilesDialogProps) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [experimentId, setExperimentId] = useState<string>('');
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingExperiments, setLoadingExperiments] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the user's accessible projects when the dialog opens. RLS scopes these
  // to what the user can see, so no extra access check is needed here (the
  // backend commit re-checks the experiment regardless).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingProjects(true);
    const supabase = createClient();
    supabase
      .from('projects')
      .select('id, name')
      .order('updated_at', { ascending: false })
      .then(({ data, error }: { data: ProjectRow[] | null; error: PostgrestError | null }) => {
        if (cancelled) return;
        if (error) {
          toast.error('Could not load projects');
        } else {
          setProjects((data as ProjectRow[]) || []);
        }
        setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Load experiments for the chosen project.
  useEffect(() => {
    if (!projectId) {
      setExperiments([]);
      setExperimentId('');
      return;
    }
    let cancelled = false;
    setLoadingExperiments(true);
    const supabase = createClient();
    supabase
      .from('experiments')
      .select('id, name')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .then(({ data, error }: { data: ExperimentRow[] | null; error: PostgrestError | null }) => {
        if (cancelled) return;
        if (error) {
          toast.error('Could not load experiments');
        } else {
          setExperiments((data as ExperimentRow[]) || []);
        }
        setExperimentId('');
        setLoadingExperiments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleSave() {
    if (!experimentId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const result = await commitArtifact(
        artifact.dataId,
        experimentId,
        session?.access_token ?? null,
      );
      toast.success(`Saved "${result.file_name}" to Data files`);
      onSaved({ experimentId, signedUrl: result.signed_url });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the file');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dialogSize="sm">
        <DialogHeader>
          <DialogTitle>Save to Data files</DialogTitle>
          <DialogDescription>
            Choose where to file <span className="font-medium">{artifact.fileName}</span>. It
            will appear in the experiment&apos;s Data files tab.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <Select value={projectId} onValueChange={setProjectId} disabled={loadingProjects}>
              <SelectTrigger>
                <SelectValue placeholder={loadingProjects ? 'Loading…' : 'Select a project'} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Experiment</label>
            <Select
              value={experimentId}
              onValueChange={setExperimentId}
              disabled={!projectId || loadingExperiments}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !projectId
                      ? 'Select a project first'
                      : loadingExperiments
                        ? 'Loading…'
                        : experiments.length === 0
                          ? 'No experiments in this project'
                          : 'Select an experiment'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {experiments.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!experimentId || saving}>
            {saving ? (
              <>
                <Spinner className="size-4" />
                Saving…
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
