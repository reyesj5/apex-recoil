import { describe, expect, it } from 'vitest';
import recorded from './current-app.fixture.json';
import { createPersistedStore, field, flag, number, readValues, type Values } from './index';
import { editorFields } from './editor';
import { previousTrainerFields, trainerFields } from './trainer';

// The stores read what the current app wrote (current-app.fixture.json, recorded from it) and write
// changes back in the same format, so players keep their settings and score history.

function storageWith(values: Record<string, string>) {
  localStorage.clear();
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  return localStorage;
}

function fallbacks<F extends Record<string, { fallback: unknown }>>(fields: F) {
  return Object.fromEntries(Object.entries(fields).map(([name, f]) => [name, f.fallback]));
}

const keysOf = (fields: Record<string, { key: string }>) => Object.values(fields).map((f) => f.key);

describe('trainer storage', () => {
  it('has a field for every key the previous trainer wrote', () => {
    expect(keysOf(previousTrainerFields).sort()).toEqual(Object.keys(recorded.trainerDefaults).sort());
    expect(Object.keys(recorded.trainer).filter((key) => !keysOf(previousTrainerFields).includes(key))).toEqual([]);
  });

  it('keeps the settings the redesign adds under keys of their own', () => {
    const added = keysOf(trainerFields).filter((key) => !keysOf(previousTrainerFields).includes(key));
    expect(added.sort()).toEqual(['game::ads', 'game::replay-speed', 'game::runs']);
    // An ADS multiplier of 1 leaves runs as the previous trainer set them up
    expect(readValues(trainerFields, storageWith(recorded.trainer))).toMatchObject({
      ads: 1,
      replaySpeed: 1,
      runs: '[]',
    });
  });

  it('reads the first-visit values as the defaults', () => {
    const values = readValues(trainerFields, storageWith(recorded.trainerDefaults));
    // The previous trainer replaced fire mode 'default' with the weapon's mode on its first visit
    expect(values).toEqual({ ...fallbacks(trainerFields), fireMode: 'auto' });
  });

  it('reads the settings and history the previous trainer saved', () => {
    const values = readValues(trainerFields, storageWith(recorded.trainer));
    expect(values).toMatchObject({
      weapon: 'r99',
      mag: 0,
      fireMode: 'auto',
      corruptedStock: true,
      sens: 3.5,
      scaleX: 1.1,
      scaleY: 1,
      invertY: true,
      stationaryTarget: false,
      movingTarget: true,
      hint: false,
      traceMode: 2,
      volume: 35,
      mute: true,
    } satisfies Partial<Values<typeof trainerFields>>);
    expect(JSON.parse(values.stats)).toEqual([
      expect.objectContaining({ v: 3, setup: { weapon: 'r99', mag: 0, hint: false, moving: true } }),
    ]);
  });

  it('writes every recorded value back unchanged', () => {
    for (const recording of [recorded.trainerDefaults, recorded.trainer]) {
      for (const f of Object.values(previousTrainerFields)) {
        const raw = recording[f.key as keyof typeof recording];
        expect(f.codec.format(f.codec.parse(raw) as never), f.key).toBe(raw);
      }
    }
  });

  it('writes a changed value to its key at once, and nothing else', () => {
    const storage = storageWith({});
    const store = createPersistedStore(trainerFields, storage);
    expect(storage.length).toBe(0);
    store.getState().set('sens', 4.25);
    store.getState().set('invertY', true);
    store.getState().set('weapon', 'r301');
    expect({ ...storage }).toEqual({ 'game::sens': '4.25', 'game::invert-y': 'true', 'game::weapon': 'r301' });
    expect(readValues(trainerFields, storage)).toMatchObject({ sens: 4.25, invertY: true, weapon: 'r301' });
  });
});

describe('editor storage', () => {
  it('has a field for every key the current editor writes', () => {
    expect(Object.keys(recorded.editor).filter((key) => !keysOf(editorFields).includes(key))).toEqual([]);
    expect(Object.keys(recorded.editorDefaults).filter((key) => !keysOf(editorFields).includes(key))).toEqual([]);
  });

  it('reads the layout, calibration and drawing the current editor saved', () => {
    const values = readValues(editorFields, storageWith(recorded.editor));
    expect(values).toMatchObject({
      weapon: 'r301',
      recordingMethod: 'offline',
      sidebarCollapsed: true,
      toolsCollapsed: true,
      scaleFactor: 0.95,
      hdrMode: 'hdr-standard',
      enableThreshold: true,
    } satisfies Partial<Values<typeof editorFields>>);
    expect(JSON.parse(values.points)).toHaveLength(33);
  });

  it('removes the scale factor at 100 % and ignores one out of range', () => {
    const storage = storageWith({ 'editor:scale_factor': '0.95' });
    const store = createPersistedStore(editorFields, storage);
    store.getState().set('scaleFactor', 1.05);
    expect(storage.getItem('editor:scale_factor')).toBe('1.05');
    store.getState().set('scaleFactor', 1);
    expect(storage.getItem('editor:scale_factor')).toBeNull();
    expect(readValues(editorFields, storageWith({ 'editor:scale_factor': '3' })).scaleFactor).toBe(1);
  });
});

describe('persisted store', () => {
  const fields = { sens: field('game::sens', number, 5), mute: field('game::mute', flag, false) };

  it('falls back to the default for a value it cannot read', () => {
    expect(readValues(fields, storageWith({ 'game::sens': 'abc', 'game::mute': 'yes' }))).toEqual({
      sens: 5,
      mute: false,
    });
    expect(readValues(fields, storageWith({ 'game::sens': '' })).sens).toBe(5);
  });

  it('keeps working in memory when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const store = createPersistedStore(fields, broken);
    expect(store.getState().sens).toBe(5);
    store.getState().set('sens', 3);
    expect(store.getState().sens).toBe(3);
  });

  it('notifies subscribers, as React components using the hook are', () => {
    const store = createPersistedStore(fields, storageWith({}));
    const seen: number[] = [];
    const unsubscribe = store.subscribe((state) => seen.push(state.sens));
    store.getState().set('sens', 2);
    unsubscribe();
    expect(seen).toEqual([2]);
  });
});
