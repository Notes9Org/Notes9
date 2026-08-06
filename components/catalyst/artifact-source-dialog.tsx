'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  fetchArtifactSource,
  regenerateArtifact,
  type ArtifactSource,
  type RegenerateResult,
} from '@/lib/agent-artifacts';
import type { AgentArtifact } from '@/hooks/use-agent-stream';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Fence code/JSON so the Streamdown+Shiki pipeline in MarkdownRenderer highlights it. */
function asFencedBlock(src: ArtifactSource): { lang: string; text: string } {
  if (src.source_kind === 'python') {
    const code = typeof src.source?.code === 'string' ? src.source.code : '';
    return { lang: 'python', text: code };
  }
  let pretty = '';
  try {
    pretty = JSON.stringify(src.source ?? {}, null, 2);
  } catch {
    pretty = String(src.source ?? '');
  }
  return { lang: 'json', text: pretty };
}

export interface ArtifactSourceDialogProps {
  artifact: AgentArtifact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the freshly-regenerated draft version so the card can swap to it. */
  onRegenerated?: (next: RegenerateResult) => void;
}

/**
 * "View code" / "Edit" for an artifact. Fetches the stored recipe (matplotlib
 * code or a tool-input spec) and shows it read-only with Shiki highlighting.
 * For python figures the code is editable and can be re-rendered in place; for
 * either kind a natural-language instruction can patch it. Each regenerate
 * produces a NEW draft version, the current one is never destroyed.
 */
export function ArtifactSourceDialog({
  artifact,
  open,
  onOpenChange,
  onRegenerated,
}: ArtifactSourceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<ArtifactSource | null>(null);
  const [editedCode, setEditedCode] = useState<string>('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    void (async () => {
      const token = await getAccessToken();
      const s = await fetchArtifactSource(artifact.dataId, token);
      if (!mounted.current) return;
      setSource(s);
      setEditedCode(s && s.source_kind === 'python' && typeof s.source?.code === 'string' ? s.source.code : '');
      setLoading(false);
      if (!s) setError('No editable source was stored for this artifact.');
    })();
  }, [open, artifact.dataId]);

  const isPython = source?.source_kind === 'python';
  const block = source ? asFencedBlock(source) : null;
  const codeChanged = isPython && editedCode.trim() !== (source?.source?.code ?? '').toString().trim();

  const runRegenerate = useCallback(
    async (body: { instruction: string } | { source: Record<string, unknown> }) => {
      setBusy(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const next = await regenerateArtifact(artifact.dataId, body, token);
        if (!mounted.current) return;
        toast.success(`Regenerated, version ${next.version}`);
        onRegenerated?.(next);
        onOpenChange(false);
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : 'Regenerate failed.');
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [artifact.dataId, onRegenerated, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isPython ? 'Figure code' : 'Artifact spec'}</DialogTitle>
          <DialogDescription>
            {isPython
              ? 'The matplotlib code behind this figure. Edit it and re-render, or describe a change below.'
              : 'The inputs that produced this artifact. Describe a change below to regenerate it.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {block && !isPython && (
              <div className="max-h-72 overflow-auto rounded-md border">
                <MarkdownRenderer content={'```' + block.lang + '\n' + block.text + '\n```'} />
              </div>
            )}

            {isPython && (
              <>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="figure-code">
                  Code (editable)
                </label>
                <textarea
                  id="figure-code"
                  value={editedCode}
                  onChange={(e) => setEditedCode(e.target.value)}
                  spellCheck={false}
                  className="h-56 w-full resize-y rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </>
            )}

            {source && (
              <>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="edit-instruction">
                  Or describe a change
                </label>
                <input
                  id="edit-instruction"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={
                    isPython
                      ? 'e.g. make the bars horizontal and add p-value brackets'
                      : 'e.g. add a Methods section summarizing the assay'
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && instruction.trim() && !busy) {
                      void runRegenerate({ instruction: instruction.trim() });
                    }
                  }}
                />
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2">
          {isPython && (
            <Button
              variant="secondary"
              disabled={busy || !codeChanged}
              onClick={() => runRegenerate({ source: { ...(source?.source ?? {}), code: editedCode } })}
            >
              {busy ? <Spinner className="size-4" /> : 'Re-render code'}
            </Button>
          )}
          {source && (
            <Button
              disabled={busy || !instruction.trim()}
              onClick={() => runRegenerate({ instruction: instruction.trim() })}
            >
              {busy ? <Spinner className="size-4" /> : 'Apply change'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
