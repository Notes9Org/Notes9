/**
 * Collaborator color assignment utility.
 *
 * Provides a deterministic color for each user based on their user ID,
 * ensuring the same user always gets the same color across sessions.
 */

export const COLLABORATOR_COLORS = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7',
  '#3F51B5', '#2196F3', '#00BCD4', '#009688',
  '#4CAF50', '#FF9800', '#FF5722', '#795548',
] as const;

/**
 * Deterministically assigns a color from the palette based on a hash of the user ID.
 * The same user ID will always produce the same color.
 */
export function getCollaboratorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash + userId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[index];
}
