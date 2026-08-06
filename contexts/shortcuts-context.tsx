'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { CREATE_ACTIONS, createActionHref } from '@/lib/app-create-actions';
import { openCatalystPanel } from '@/lib/catalyst-launch';
import { SHORTCUTS } from '@/lib/shortcuts/registry';
import type { ShortcutActionMap } from '@/lib/shortcuts/types';

/**
 * `c` then `n`. The New-lab-note dialog is owned by components/layout/app-sidebar.tsx
 * (it needs the sidebar's project/experiment scope), so the shortcut asks for it
 * by event rather than lifting that dialog's state up here.
 */
export const CREATE_LAB_NOTE_EVENT = 'notes9:create-lab-note';

/**
 * Cmd+S. Dispatched CANCELABLE: an editor holding unsaved state listens, calls
 * `preventDefault()` to claim the save, and shows its own confirmation.
 * `dispatchEvent` then returns false and we stay quiet. When it returns true
 * nobody claimed the save, so we must NOT say "Saved" — on an autosaving page
 * that would be a lie about durability.
 */
export const SAVE_NOW_EVENT = 'notes9:save-now';

/**
 * Cmd+J. `lib/catalyst-launch` only knows how to OPEN the panel, and the panel's
 * visibility lives in components/layout/app-layout.tsx — so a real toggle has to
 * be asked for by event. The layout listens and flips its own state.
 */
export const CATALYST_TOGGLE_EVENT = 'notes9:catalyst-toggle';

type ShortcutsContextValue = {
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  openPalette: () => void;
  cheatSheetOpen: boolean;
  setCheatSheetOpen: (v: boolean) => void;
  openCheatSheet: () => void;
};

const Context = createContext<ShortcutsContextValue | null>(null);

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openCheatSheet = useCallback(() => setCheatSheetOpen(true), []);

  const saveNow = useCallback(() => {
    const claimed = !window.dispatchEvent(
      new CustomEvent(SAVE_NOW_EVENT, { cancelable: true }),
    );
    if (!claimed) toast('Everything here saves automatically');
  }, []);

  const actions = useMemo<ShortcutActionMap>(() => {
    const map: ShortcutActionMap = {
      'palette.open': openPalette,
      'shortcuts.open': openCheatSheet,
      'shortcuts.openAlt': openCheatSheet,
      'save.now': saveNow,
      'theme.toggle': () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
      // openCatalystPanel only opens, so a toggle goes through the layout, which
      // owns the panel's visibility. See CATALYST_TOGGLE_EVENT above.
      'catalyst.toggle': () =>
        window.dispatchEvent(new CustomEvent(CATALYST_TOGGLE_EVENT)),
      // Dock beside the current page — "about this page" only makes sense with
      // the page still visible. The panel derives the entity scope from the route.
      'catalyst.askPage': () => openCatalystPanel({ dock: true }),
    };

    // goto.* — derived from the registry so a new nav entry needs no edit here.
    for (const def of SHORTCUTS) {
      if (!def.id.startsWith('goto.') || !def.href) continue;
      const href = def.href;
      map[def.id] = () => router.push(href);
    }

    // create.* — derived from the shared create-action list.
    // ponytail: pushes unscoped hrefs. Pass the active project id to
    // createActionHref() here if `c e` should inherit project scope the way the
    // sidebar New menu does; that needs this provider to sit inside ProjectScopeProvider.
    for (const action of CREATE_ACTIONS) {
      const id = `create.${action.id}`;
      if (action.id === 'labNote') {
        map[id] = () => window.dispatchEvent(new CustomEvent(CREATE_LAB_NOTE_EVENT));
        continue;
      }
      const href = createActionHref(action);
      if (href) map[id] = () => router.push(href);
    }

    return map;
  }, [openPalette, openCheatSheet, saveNow, setTheme, resolvedTheme, router]);

  useGlobalShortcuts(actions);

  const value = useMemo<ShortcutsContextValue>(
    () => ({
      paletteOpen,
      setPaletteOpen,
      openPalette,
      cheatSheetOpen,
      setCheatSheetOpen,
      openCheatSheet,
    }),
    [paletteOpen, openPalette, cheatSheetOpen, openCheatSheet],
  );

  // Children only — app-layout.tsx mounts the palette and the cheat sheet.
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useShortcuts(): ShortcutsContextValue {
  const value = useContext(Context);
  if (!value) {
    throw new Error('useShortcuts must be used inside <ShortcutsProvider>');
  }
  return value;
}
