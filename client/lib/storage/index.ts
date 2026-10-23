import { create } from 'zustand';

// Values kept in localStorage under the keys and formats the current app writes: one key per value,
// stored as a string ('true', '3.5', 'r301', JSON for lists). Players keep their settings and score
// history when the new interface replaces the old one, so this layer never changes a key or a format.
// Zustand's persist middleware would keep a whole store as one JSON value under one key, which the
// current app's values don't match; these stores read and write each value on its own instead.

/** How a value is written as a string, and read back; parse returns undefined for what it can't read */
export interface Codec<T> {
  parse(raw: string): T | undefined;
  format(value: T): string;
}

export const text: Codec<string> = {
  parse: (raw) => raw,
  format: (value) => value,
};

export const flag: Codec<boolean> = {
  parse: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
  format: (value) => String(value),
};

export const number: Codec<number> = {
  parse: (raw) => (raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : undefined),
  format: (value) => String(value),
};

/** A number within [min, max]; anything outside reads as unset */
export function numberIn(min: number, max: number): Codec<number> {
  return {
    parse: (raw) => {
      const value = number.parse(raw);
      return value !== undefined && value >= min && value <= max ? value : undefined;
    },
    format: number.format,
  };
}

/** One of a fixed list of strings */
export function oneOf<const T extends string>(values: readonly T[]): Codec<T> {
  return {
    parse: (raw) => values.find((value) => value === raw),
    format: (value) => value,
  };
}

export interface Field<T> {
  /** The full localStorage key, such as 'game::weapon' */
  key: string;
  codec: Codec<T>;
  /** Used while the key is missing or unreadable */
  fallback: T;
  /** Remove the key instead of writing the fallback (the editor's scale factor does this) */
  removeAtFallback?: boolean;
}

export function field<T>(
  key: string,
  codec: Codec<T>,
  fallback: T,
  options?: { removeAtFallback?: boolean },
): Field<T> {
  return { key, codec, fallback, ...options };
}

type Fields = Record<string, Field<unknown>>;
export type Values<F extends Fields> = { [K in keyof F]: F[K] extends Field<infer T> ? T : never };
export type PersistedState<F extends Fields> = Values<F> & {
  /** Sets one value and writes it to its key */
  set<K extends keyof F>(name: K, value: Values<F>[K]): void;
};

// localStorage can be missing or throw (storage disabled, private windows, a full quota); the values
// then live in memory for the visit
function readKey(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeKey(storage: Storage | undefined, key: string, value: string | null) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // keep the value in memory
  }
}

/** The values of `fields` as stored, with the fallback for any that are missing or unreadable */
export function readValues<F extends Fields>(fields: F, storage: Storage | undefined): Values<F> {
  const values: Record<string, unknown> = {};
  for (const [name, f] of Object.entries(fields)) {
    const raw = readKey(storage, f.key);
    values[name] = (raw === null ? undefined : f.codec.parse(raw)) ?? f.fallback;
  }
  return values as Values<F>;
}

/**
 * A Zustand store (a React hook with getState, setState and subscribe) of the values in `fields`,
 * read from storage when it is created. A changed value is written to its key at once; values nobody
 * changes are not written, so a first visit leaves storage empty.
 */
export function createPersistedStore<F extends Fields>(
  fields: F,
  storage: Storage | undefined = globalThis.localStorage,
) {
  const store = create<PersistedState<F>>()((setState) => ({
    ...readValues(fields, storage),
    set: (name, value) => setState({ [name]: value } as Partial<PersistedState<F>>),
  }));
  store.subscribe((state, previous) => {
    for (const [name, f] of Object.entries(fields)) {
      const value = state[name as keyof F];
      if (Object.is(value, previous[name as keyof F])) continue;
      const remove = f.removeAtFallback && Object.is(value, f.fallback);
      writeKey(storage, f.key, remove ? null : f.codec.format(value));
    }
  });
  return store;
}
