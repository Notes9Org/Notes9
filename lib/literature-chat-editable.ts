/** Inline literature paper chips in the chat composer (same DOM pattern as todo-panel mentions). */

export const LITERATURE_CHIP = {
  id: 'data-literature-id',
  title: 'data-literature-title',
} as const;

const MENTION_PLACEHOLDER = '\uFFFC';

const CHIP_ICON_BOOK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';

export type LiteratureEditableSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; id: string; title: string };

export function getQueryAfterAt(text: string): { query: string; startIndex: number } {
  const lastAt = text.lastIndexOf('@');
  if (lastAt === -1) return { query: '', startIndex: -1 };
  const after = text.slice(lastAt + 1);
  if (after.startsWith(' ')) return { query: '', startIndex: -1 };
  const space = after.indexOf(' ');
  const query = space === -1 ? after : after.slice(0, space);
  return { query, startIndex: lastAt };
}

function getTextBeforeCursorAndOffset(el: HTMLElement): { text: string; offset: number } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { text: '', offset: 0 };
  const range = sel.getRangeAt(0);
  const anchorNode = range.startContainer;
  const anchorOffset = range.startOffset;
  let text = '';
  let offset = 0;
  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length;
      if (node === anchorNode) {
        text += (node.textContent || '').slice(0, anchorOffset);
        offset = text.length;
        return true;
      }
      text += node.textContent || '';
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as HTMLElement;
      if (e.getAttribute(LITERATURE_CHIP.id)) {
        if (node.contains(anchorNode) || node === anchorNode) {
          offset =
            text.length + (node === anchorNode && anchorOffset === 0 ? 0 : 1);
          text += MENTION_PLACEHOLDER;
          return true;
        }
        text += MENTION_PLACEHOLDER;
        return false;
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true;
      }
      return false;
    }
    return false;
  }
  for (let i = 0; i < el.childNodes.length; i++) {
    if (walk(el.childNodes[i])) break;
  }
  if (offset === 0) offset = text.length;
  return { text, offset };
}

export function getCursorOffset(el: HTMLElement): number {
  return getTextBeforeCursorAndOffset(el).offset;
}

export function getTextBeforeCursor(el: HTMLElement): string {
  return getTextBeforeCursorAndOffset(el).text;
}

export function deleteLiteratureTextRange(el: HTMLElement, start: number, end: number): void {
  const range = getRangeForCharRange(el, start, end);
  if (!range) return;
  range.deleteContents();
}

function getRangeForCharRange(el: HTMLElement, start: number, end: number): Range | null {
  let count = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length;
      if (count + len > start && startNode === null) {
        startNode = node;
        startOffset = start - count;
      }
      if (count + len >= end && endNode === null) {
        endNode = node;
        endOffset = Math.min(end - count, len);
        return true;
      }
      count += len;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as HTMLElement;
      if (e.getAttribute(LITERATURE_CHIP.id)) {
        count += 1;
        if (count > start && startNode === null) {
          startNode = node;
          startOffset = 0;
        }
        if (count >= end && endNode === null) {
          endNode = node;
          endOffset = 1;
          return true;
        }
        return false;
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true;
      }
      return false;
    }
    return false;
  }
  for (let i = 0; i < el.childNodes.length; i++) {
    if (walk(el.childNodes[i])) break;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function createLiteratureChipEl(item: { id: string; title: string }): HTMLElement {
  const span = document.createElement('span');
  span.contentEditable = 'false';
  span.setAttribute(LITERATURE_CHIP.id, item.id);
  span.setAttribute(LITERATURE_CHIP.title, item.title);
  span.setAttribute('tabindex', '-1');
  span.className =
    'inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground align-middle [&_svg]:size-3 shrink-0 cursor-default max-w-[min(20rem,100%)]';
  span.style.display = 'inline-flex';
  span.onclick = (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel) return;
    const host = span.parentElement;
    if (!host) return;
    const after = span.nextSibling?.nextSibling ?? span.nextSibling ?? span;
    const r = document.createRange();
    if (after.nodeType === Node.TEXT_NODE) {
      r.setStart(after, after.textContent?.length ?? 0);
    } else {
      r.setStartAfter(after);
    }
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };
  const icon = document.createElement('span');
  icon.innerHTML = CHIP_ICON_BOOK;
  span.appendChild(icon);
  const label = document.createElement('span');
  label.className = 'truncate min-w-0';
  label.textContent = item.title;
  span.appendChild(label);
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className =
    'ml-0.5 shrink-0 rounded-full p-0.5 hover:bg-muted-foreground/20 inline-flex';
  removeBtn.setAttribute('aria-label', 'Remove');
  removeBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  removeBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const host = span.parentElement;
    span.remove();
    host?.normalize();
    host?.dispatchEvent(new CustomEvent('literature-mention-removed', { bubbles: true }));
  };
  span.appendChild(removeBtn);
  return span;
}

export function insertLiteratureMention(
  el: HTMLElement,
  item: { id: string; title: string },
  startIndex: number,
  endIndex: number,
): void {
  const range = getRangeForCharRange(el, startIndex, endIndex);
  if (!range) return;
  range.deleteContents();
  const span = createLiteratureChipEl(item);
  const zwsp = document.createTextNode('\u200B');
  const space = document.createTextNode(' ');
  range.insertNode(span);
  range.setStartAfter(span);
  range.setEndAfter(span);
  range.insertNode(zwsp);
  range.setStartAfter(zwsp);
  range.setEndAfter(zwsp);
  range.insertNode(space);
  el.focus();
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStartAfter(space);
    r.collapse(true);
    sel.addRange(r);
  }
  el.normalize();
}

export function getLiteratureSegmentsFromEl(el: HTMLElement): LiteratureEditableSegment[] {
  const segments: LiteratureEditableSegment[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) segments.push({ type: 'text', value: node.textContent });
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const elNode = node as HTMLElement;
      const id = elNode.getAttribute(LITERATURE_CHIP.id);
      const title = elNode.getAttribute(LITERATURE_CHIP.title);
      if (id && title) segments.push({ type: 'mention', id, title });
      else elNode.childNodes.forEach(walk);
    }
  };
  el.childNodes.forEach(walk);
  return segments;
}

export function getPlainTextFromLiteratureEditable(el: HTMLElement): string {
  return getLiteratureSegmentsFromEl(el)
    .filter((s): s is { type: 'text'; value: string } => s.type === 'text')
    .map((s) => s.value.replace(/\u200B/g, ''))
    .join('')
    .replace(/\uFFFC/g, '');
}

export function getMentionsFromLiteratureEditable(el: HTMLElement): { id: string; title: string }[] {
  const seen = new Set<string>();
  const out: { id: string; title: string }[] = [];
  for (const s of getLiteratureSegmentsFromEl(el)) {
    if (s.type !== 'mention') continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id, title: s.title });
  }
  return out;
}

/** After send: keep chips, remove typed text (todo-style follow-up on same tags). */
export function clearLiteratureEditablePlainText(el: HTMLElement): void {
  const chips: HTMLElement[] = [];
  el.querySelectorAll<HTMLElement>(`[${LITERATURE_CHIP.id}]`).forEach((n) => chips.push(n));
  el.textContent = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < chips.length; i++) {
    if (i > 0) frag.appendChild(document.createTextNode(' '));
    frag.appendChild(chips[i]);
  }
  frag.appendChild(document.createTextNode('\u200B'));
  el.appendChild(frag);
  el.focus();
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const r = document.createRange();
    const last = el.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE) {
      r.setStart(last, last.textContent?.length ?? 0);
    } else if (last) {
      r.setStartAfter(last);
    } else {
      r.setStart(el, 0);
    }
    r.collapse(true);
    sel.addRange(r);
  }
  el.normalize();
}

/** Drop / programmatic add: append mention when under max unique count. Returns false if at cap. */
export function appendLiteratureMentionAtEnd(
  el: HTMLElement,
  item: { id: string; title: string },
  maxUnique: number,
): boolean {
  const existing = getMentionsFromLiteratureEditable(el);
  if (existing.some((m) => m.id === item.id)) return true;
  if (existing.length >= maxUnique) return false;

  if (el.childNodes.length > 0) {
    el.appendChild(document.createTextNode(' '));
  }
  el.appendChild(createLiteratureChipEl(item));
  const zwsp = document.createTextNode('\u200B');
  const space = document.createTextNode(' ');
  el.appendChild(zwsp);
  el.appendChild(space);
  el.focus();
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStartAfter(space);
    r.collapse(true);
    sel.addRange(r);
  }
  el.normalize();
  return true;
}
