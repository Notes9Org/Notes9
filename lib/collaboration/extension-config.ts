/**
 * Extension configuration logic for the TipTap editor in collaboration mode.
 *
 * This module models the decision logic used in TiptapEditor to determine
 * which extensions are active based on collaboration state. It mirrors the
 * conditional logic in components/text-editor/tiptap-editor.tsx.
 */

export interface ExtensionConfig {
  /** Whether the built-in history (undo/redo) extension is enabled */
  historyEnabled: boolean;
  /** Whether the Collaboration extension is present in the extension list */
  collaborationExtensionPresent: boolean;
  /** Whether the CollaborationCursor extension is present in the extension list */
  collaborationCursorPresent: boolean;
}

/**
 * Determines the extension configuration based on collaboration state.
 *
 * Collaboration is considered active when ALL three conditions are met:
 * - collaborationEnabled is true
 * - hasYdoc is true (a Y.Doc instance is available)
 * - hasProvider is true (a HocuspocusProvider instance is available)
 *
 * When collaboration is active:
 * - StarterKit is configured with `history: false` (disables built-in undo/redo)
 * - Collaboration and CollaborationCursor extensions are added
 *
 * When collaboration is NOT active:
 * - StarterKit uses default config (history enabled)
 * - Collaboration and CollaborationCursor extensions are NOT added
 */
export function getExtensionConfig(
  collaborationEnabled: boolean,
  hasYdoc: boolean,
  hasProvider: boolean
): ExtensionConfig {
  const isCollabActive = collaborationEnabled && hasYdoc && hasProvider;
  return {
    historyEnabled: !isCollabActive,
    collaborationExtensionPresent: isCollabActive,
    collaborationCursorPresent: isCollabActive,
  };
}
