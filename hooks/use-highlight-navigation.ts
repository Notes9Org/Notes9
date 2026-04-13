'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  HIGHLIGHT_PARAM,
  decodeHighlightParam,
  type HighlightTarget,
} from '@/lib/document-highlight';

const AUTO_CLEAR_MS = 30_000;

/**
 * Reads the `?highlight=` URL param, decodes it into a {@link HighlightTarget},
 * and provides a `clearHighlight` helper that removes the param from the URL.
 *
 * The highlight auto-clears after 30 s so stale highlights don't persist across
 * navigations.
 */
export function useHighlightNavigation() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  const raw = searchParams.get(HIGHLIGHT_PARAM);

  const highlightTarget: HighlightTarget | null = useMemo(() => {
    if (dismissed || !raw) return null;
    return decodeHighlightParam(raw);
  }, [raw, dismissed]);

  const clearHighlight = useCallback(() => {
    setDismissed(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(HIGHLIGHT_PARAM);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, pathname, router]);

  // Auto-clear after timeout
  useEffect(() => {
    if (!highlightTarget) return;
    const id = setTimeout(clearHighlight, AUTO_CLEAR_MS);
    return () => clearTimeout(id);
  }, [highlightTarget, clearHighlight]);

  // Reset dismissed flag when the raw param changes (new navigation)
  useEffect(() => {
    setDismissed(false);
  }, [raw]);

  return { highlightTarget, clearHighlight };
}
