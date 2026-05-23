/**
 * Collaboration configuration utility.
 *
 * Provides helpers to check whether real-time collaboration is enabled
 * and to retrieve the WebSocket URL for the collaboration server.
 * The feature is gated by the NEXT_PUBLIC_COLLABORATION_URL environment variable.
 */

/**
 * Returns true if the collaboration feature is enabled.
 * Collaboration is considered enabled when the NEXT_PUBLIC_COLLABORATION_URL
 * environment variable is set to a non-empty string.
 */
export function isCollaborationEnabled(): boolean {
  return typeof process.env.NEXT_PUBLIC_COLLABORATION_URL === 'string' &&
    process.env.NEXT_PUBLIC_COLLABORATION_URL.length > 0;
}

/**
 * Returns the WebSocket URL for the collaboration server.
 * Returns an empty string if the environment variable is not set.
 */
export function getCollaborationUrl(): string {
  return process.env.NEXT_PUBLIC_COLLABORATION_URL || '';
}
