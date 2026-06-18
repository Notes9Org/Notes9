/**
 * Client helpers for AI-generated file artifacts (see `AgentArtifact` in
 * use-agent-stream). Handles human-readable formatting, file-kind detection for
 * icon/preview selection, the "Save to Data files" commit call that promotes
 * a draft into an experiment, and the encode/decode contract that lets artifact
 * metadata survive as a hidden block inside a persisted assistant message.
 */

export type ArtifactKind = 'image' | 'pdf' | 'word' | 'excel' | 'file';

// ── Persisted artifact contract ───────────────────────────────────────────────

/**
 * The stable fields persisted per artifact — deliberately excludes `signed_url`
 * (expires ~1 h) which is re-minted on demand by the resign route.
 */
export interface PersistedArtifact {
  data_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  /** True ⇒ draft (not yet committed to Data files). */
  draft: boolean;
  experiment_id: string | null;
  generator: string | null;
  kind: string | null;
}

/** Marker appended after the citations manifest block. Hidden from display. */
export const NOTES9_ARTIFACTS_MARKER = '\n§§NOTES9_ARTIFACTS§§\n';

function utf8ToBase64Artifacts(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8Artifacts(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Encode an array of `AgentArtifact`-like objects into an opaque base64 string
 * ready to be appended after {@link NOTES9_ARTIFACTS_MARKER}. Only stable fields
 * (no `signed_url`) are persisted.
 */
export function encodeStoredArtifacts(
  artifacts: ReadonlyArray<{
    dataId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    draft: boolean;
    experimentId?: string | null;
    generator?: string | null;
    kind?: string | null;
  }>,
): string {
  const payload: PersistedArtifact[] = artifacts.map((a) => ({
    data_id: a.dataId,
    file_name: a.fileName,
    mime_type: a.mimeType,
    size_bytes: a.sizeBytes,
    draft: a.draft,
    experiment_id: a.experimentId ?? null,
    generator: a.generator ?? null,
    kind: a.kind ?? null,
  }));
  return utf8ToBase64Artifacts(JSON.stringify(payload));
}

/**
 * Decode the base64 blob written by `encodeStoredArtifacts` back into
 * `PersistedArtifact[]`. Returns an empty array on any parse error so callers
 * never need to guard against thrown exceptions.
 */
export function parseStoredArtifacts(b64: string): PersistedArtifact[] {
  if (!b64.trim()) return [];
  try {
    const json = base64ToUtf8Artifacts(b64.trim());
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PersistedArtifact =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as PersistedArtifact).data_id === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Map live `AgentArtifact[]` (camelCase, with a transient signedUrl) to the
 * stable `PersistedArtifact[]` shape stored in `chat_messages.metadata.artifacts`.
 * Drops the signedUrl (re-minted on demand by data_id). This is the structured
 * linkage that replaces the fragile hidden `§§NOTES9_ARTIFACTS§§` markdown block.
 */
export function toPersistedArtifacts(
  artifacts: ReadonlyArray<{
    dataId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    draft: boolean;
    experimentId?: string | null;
    generator?: string | null;
    kind?: string | null;
  }>,
): PersistedArtifact[] {
  return artifacts.map((a) => ({
    data_id: a.dataId,
    file_name: a.fileName,
    mime_type: a.mimeType,
    size_bytes: a.sizeBytes,
    draft: a.draft,
    experiment_id: a.experimentId ?? null,
    generator: a.generator ?? null,
    kind: a.kind ?? null,
  }));
}

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

/**
 * Re-mint a fresh signed URL for a persisted draft artifact by data_id. Persisted
 * chat artifacts keep their metadata but not the ~1h signed URL, so the card calls
 * this on load / before download. Returns null when the artifact is gone/expired.
 */
export type ResignResult =
  | { signed_url: string; file_name: string; mime_type: string; committed: boolean }
  | { expired: true }
  | null;

export async function resignArtifact(dataId: string, token: string | null): Promise<ResignResult> {
  try {
    const res = await fetch(`/api/agent/artifacts/${encodeURIComponent(dataId)}/signed-url`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    // 410 Gone ⇒ the draft was swept (TTL) — distinct from a transient failure so
    // the card can show an honest "expired" tombstone instead of retrying forever.
    if (res.status === 410) return { expired: true };
    if (!res.ok) return null;
    return (await res.json()) as {
      signed_url: string;
      file_name: string;
      mime_type: string;
      committed: boolean;
    };
  } catch {
    return null;
  }
}

/**
 * Normalize a {@link PersistedArtifact} (snake_case, no signed_url) into the
 * camelCase shape the artifact card renders. The card re-signs the URL lazily.
 */
export function persistedToArtifact(p: PersistedArtifact): {
  dataId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  signedUrl: string | null;
  draft: boolean;
  experimentId: string | null;
  generator: string | null;
  kind: string | null;
} {
  return {
    dataId: p.data_id,
    fileName: p.file_name,
    mimeType: p.mime_type,
    sizeBytes: p.size_bytes,
    signedUrl: null,
    draft: p.draft,
    experimentId: p.experiment_id,
    generator: p.generator,
    kind: p.kind,
  };
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
