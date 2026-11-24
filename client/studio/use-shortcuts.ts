import { useEffect } from 'react';
import { useEditorSettings } from '@/lib/storage/editor';
import { requestSave } from './actions';
import {
  goToFrame,
  openDialog,
  redoEdit,
  requestFit,
  savedOf,
  selectedWeapon,
  setComparing,
  setLayers,
  setTool,
  undoEdit,
  useStudio,
} from './store';

// The Studio's keys (the shortcuts dialog lists them). Ctrl S saves from anywhere, a field included;
// the others wait while a field has the focus or a dialog is open. Space (pan, or snap the wall while
// recording) belongs to the canvas and the live capture.

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement && !!e.target.closest('input, textarea, select, [contenteditable]');
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const weapon = selectedWeapon();
      const state = useStudio.getState();

      if (ctrl && key === 's') {
        e.preventDefault();
        // A field commits its value when it loses the focus
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (!state.dialog) requestSave();
        return;
      }
      if (state.dialog || typing || e.altKey) return;
      if (ctrl) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redoEdit(weapon);
          else undoEdit(weapon);
        } else if (key === 'y') {
          e.preventDefault();
          redoEdit(weapon);
        }
        return;
      }

      const settings = useEditorSettings.getState();
      const actions: Record<string, () => void> = {
        v: () => setTool('select'),
        h: () => setTool('pan'),
        a: () => setTool('align'),
        c: () => setTool('correct'),
        f: requestFit,
        p: () => setLayers({ pattern: !state.layers.pattern }),
        o: () => {
          if (savedOf(state, weapon)) setComparing(!state.comparing);
        },
        '[': () => goToFrame(state.frame - 1),
        ']': () => goToFrame(state.frame + 1),
        m: () => settings.set('sidebarCollapsed', !settings.sidebarCollapsed),
        e: () => settings.set('toolsCollapsed', !settings.toolsCollapsed),
        '?': () => openDialog({ kind: 'shortcuts' }),
        Escape: () => {
          if (state.comparing) setComparing(false);
          else if (state.tool !== 'select') setTool('select');
        },
      };
      const action = actions[key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
