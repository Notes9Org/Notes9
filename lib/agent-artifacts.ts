/**
 * Client helpers for AI-generated file artifacts (see `AgentArtifact` in
 * use-agent-stream). Handles human-readable formatting, file-kind detection for
 * icon/preview selection, and the "Save to Data files" commit call that promotes
 * a draft into an experiment.
 */

export type ArtifactKind = 'image' | 'pdf' | 'word' | 'excel' | 'file';

/** Map a MIME type to a coarse kind used for icon + preview decisions. */
export function artifactKind(mime: string | null | undefined): ArtifactKind {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('wordprocessingml') || m === 'application/msword') return 'word';
  if (m.includes('spreadsheetml') || m === 'application/vnd.ms-excel') return 'excel';
  return 'file';
}

/** "1,234 bytes" → "1.2 KB" etc. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

export interface CommitArtifactResult {
  data_id: string;
  file_name: string;
  size_bytes: number;
  signed_url: string | null;
  experiment_id: string;
  saved: boolean;
}

/**
 * Save a draft artifact into an experiment's Data files. Calls the Next proxy
 * (`/api/agent/artifacts/[dataId]/commit`), which forwards to the agent backend
 * where the chosen experiment is re-checked against the user's access scope.
 *
 * Throws Error(message) on failure so callers can surface it via toast.
 */
export async function commitArtifact(
  dataId: string,
  experimentId: string,
  token: string | null,
): Promise<CommitArtifactResult> {
  const res = await fetch(`/api/agent/artifacts/${encodeURIComponent(dataId)}/commit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ experiment_id: experimentId }),
  });
  if (!res.ok) {
    let detail = `Save failed (${res.status})`;
    try {
      const j = (await res.json()) as { detail?: string; error?: string };
      detail = j.detail || j.error || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return (await res.json()) as CommitArtifactResult;
}
