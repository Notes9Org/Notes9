export type CatalystMentionKind =
  | 'literature_review'
  | 'lab_note'
  | 'experiment'
  | 'project'
  | 'protocol';

export type CatalystMentionDragPayload = {
  kind: CatalystMentionKind;
  id: string;
  title: string;
};

export const CATALYST_MENTION_DRAG_MIME = 'application/x-notes9-mention';

export function catalystMentionPath(kind: CatalystMentionKind, id: string): string {
  switch (kind) {
    case 'literature_review':
      return `/literature-reviews/${encodeURIComponent(id)}`;
    case 'lab_note':
      return `/lab-notes/${encodeURIComponent(id)}`;
    case 'experiment':
      return `/experiments/${encodeURIComponent(id)}`;
    case 'project':
      return `/projects/${encodeURIComponent(id)}`;
    case 'protocol':
      return `/protocols/${encodeURIComponent(id)}`;
    default:
      return `/notes/${encodeURIComponent(id)}`;
  }
}

