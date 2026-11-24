// Undo and redo: up to 50 earlier states, as the Recoil Editor kept them
// (client/modules/editor/canvas.ts). A new change clears what could be redone.

export interface History<T> {
  past: T[];
  future: T[];
}

export const HISTORY_LIMIT = 50;

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/** Remembers `current` before a change */
export function record<T>(history: History<T>, current: T, limit = HISTORY_LIMIT): History<T> {
  return { past: [...history.past, current].slice(-limit), future: [] };
}

/** The state before the last change, with `current` kept for redo; null when there is none */
export function undo<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  const state = history.past.at(-1);
  if (state === undefined) return null;
  return { history: { past: history.past.slice(0, -1), future: [...history.future, current] }, state };
}

/** The state the last undo left, with `current` kept for undo; null when there is none */
export function redo<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  const state = history.future.at(-1);
  if (state === undefined) return null;
  return { history: { past: [...history.past, current], future: history.future.slice(0, -1) }, state };
}
