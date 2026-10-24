import { create } from 'zustand';
import type { RunEnd } from './range/renderer';

// What the trainer remembers for this visit only: the last run, for the result card and the session
// panel. Settings and the score history persist in lib/storage instead.

export interface SessionState {
  /** The last finished run while its card shows; null before the first run and after Next run */
  shown: RunEnd | null;
  /** The last finished run of this visit, whatever shows */
  last: RunEnd | null;
  /** Whether the range is too small for the pattern (reported by the range) */
  tooSmall: boolean;
  /** Which dialog is open, if any */
  dialog: 'settings' | 'help' | 'search' | null;
  /** Whether a dialog has been opened, so their code (loaded on demand) is mounted */
  dialogsWanted: boolean;
}

export const useSession = create<SessionState>()(() => ({
  shown: null,
  last: null,
  tooSmall: false,
  dialog: null,
  dialogsWanted: false,
}));

/** Opens a dialog (settings, help or the weapon search), loading the dialogs' code the first time */
export function openDialog(dialog: NonNullable<SessionState['dialog']>) {
  useSession.setState({ dialog, dialogsWanted: true });
}
