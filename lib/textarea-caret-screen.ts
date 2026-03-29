/**
 * Viewport (fixed-position) coordinates for the caret in a textarea at `position`.
 * Uses an off-DOM mirror aligned to the textarea box and scroll, so wrapped lines match.
 */
export function getTextareaCaretScreenPoint(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number } {
  const rect = textarea.getBoundingClientRect();
  const cs = getComputedStyle(textarea);

  const mirror = document.createElement('div');

  mirror.style.position = 'fixed';
  mirror.style.left = `${rect.left}px`;
  mirror.style.top = `${rect.top}px`;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = `${textarea.clientHeight}px`;
  mirror.style.overflow = 'hidden';
  mirror.style.boxSizing = cs.boxSizing;
  mirror.style.padding = cs.padding;
  mirror.style.border = cs.border;
  mirror.style.font = cs.font;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.wordSpacing = cs.wordSpacing;
  mirror.style.textIndent = cs.textIndent;
  mirror.style.textTransform = cs.textTransform;
  mirror.style.textAlign = cs.textAlign;
  mirror.style.direction = cs.direction;
  mirror.style.tabSize = cs.tabSize;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.zIndex = '-1';

  const before = textarea.value.slice(0, Math.min(position, textarea.value.length));
  const marker = document.createElement('span');
  marker.textContent = '\u200b';

  mirror.appendChild(document.createTextNode(before));
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  try {
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
    const mr = marker.getBoundingClientRect();
    return { top: mr.top, left: mr.left };
  } finally {
    mirror.remove();
  }
}
