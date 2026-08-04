/**
 * Whether a section composer must refuse the question it is being handed.
 *
 * Lives apart from the component so the rule can be tested without rendering
 * the whole Catalyst hero (project scope, panel state, router). The rule is
 * small but load-bearing: it is what stops the Data page sending a statistical
 * question that has no dataset behind it, and what makes sure attaching a file
 * is enough to satisfy that — the requirement is "at least one dataset", not
 * "a populated spreadsheet".
 *
 * @param reason  why the page cannot accept a question yet, or null when it can
 * @param attachmentCount  files already uploaded and attached to the composer
 * @param uploadingCount   files still in flight; they count, so the composer
 *                         does not flicker back to blocked mid-upload
 */
export function isComposerBlocked(
  reason: string | null,
  attachmentCount: number,
  uploadingCount: number
): boolean {
  return reason !== null && attachmentCount === 0 && uploadingCount === 0
}
