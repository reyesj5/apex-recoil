import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { useTrainerSettings } from '@/lib/storage/trainer';

const noSubscription = () => () => {};

/**
 * False while the page renders on the server or hydrates, true after: for what only the browser can
 * show (the consent banner reads a choice stored on the device)
 */
export function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/** Loads the stored settings and history once the page has hydrated (the prerender rendered the defaults) */
export function useStoredSettings() {
  useEffect(() => useTrainerSettings.getState().load(), []);
}

/** Whether a media query matches; `serverValue` before the page runs in a browser */
export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

// Keys that act on the whole page: plain letters ('b') and Ctrl or ⌘ with a letter ('mod+k'). They
// do nothing while the player types in a field, picks from a list or works in a dialog.
function ignored(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="listbox"], [role="menu"]'),
  );
}

export function useHotkeys(bindings: Record<string, () => void>) {
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.altKey || e.repeat || e.key.length !== 1) return;
    const key = (e.ctrlKey || e.metaKey ? 'mod+' : '') + e.key.toLowerCase();
    const action = bindings[key];
    if (!action || (ignored(e.target) && !key.startsWith('mod+'))) return;
    e.preventDefault();
    action();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
