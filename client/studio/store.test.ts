import { beforeEach, describe, expect, it } from 'vitest';
import specs from '@/specs.json';
import { useEditorSettings } from '@/lib/storage/editor';
import { applyAnalysis } from './model/analysis';
import { analysisResult } from './model/session';
import { shotsOf, withRpm, type Spec } from './model/spec';
import {
  addToBatch,
  applyShots,
  frames,
  goToFrame,
  isUnsaved,
  markSaved,
  removeFromBatch,
  resetStudio,
  revert,
  selectWeapon,
  setSaved,
  specOf,
  startSession,
  editSpec,
  undoEdit,
  redoEdit,
  useStudio,
  recordSample,
  toggleSlot,
  discard,
} from './store';

const all = specs as Spec[];
const spec = (name: string) => structuredClone(all.find((s) => s.name === name)!);
const state = () => useStudio.getState();

beforeEach(() => {
  localStorage.clear();
  useEditorSettings.getState().load();
  resetStudio();
  setSaved(structuredClone(all));
});

describe('the Studio store', () => {
  it('opens on the stored weapon, or the first when the specs lack it', () => {
    expect(useEditorSettings.getState().weapon).toBe('r301');
    expect(state().mode).toBe('auto');
    useEditorSettings.getState().set('weapon', 'gone');
    setSaved(structuredClone(all));
    expect(useEditorSettings.getState().weapon).toBe(all[0].name);
    selectWeapon('wingman');
    expect(state().mode).toBe('single');
    expect(localStorage.getItem('editor:weapon')).toBe('wingman');
  });

  it('keeps edits as a draft until they are saved', () => {
    editSpec('r99', (s) => withRpm(s, 1000));
    expect(specOf(state(), 'r99')?.rpm).toBe(1000);
    expect(isUnsaved(state(), 'r99')).toBe(true);
    expect(isUnsaved(state(), 'r301')).toBe(false);
    markSaved(specOf(state(), 'r99')!);
    expect(isUnsaved(state(), 'r99')).toBe(false);
    expect(state().saved?.find((s) => s.name === 'r99')?.rpm).toBe(1000);

    editSpec('r99', (s) => withRpm(s, 900));
    revert('r99');
    expect(specOf(state(), 'r99')?.rpm).toBe(1000);
  });

  it('undoes and redoes pattern edits', () => {
    const r99 = spec('r99');
    const shots = shotsOf(r99);
    applyShots('r99', [...shots, { x: 30, y: -600 }], [2]);
    applyShots('r99', shots.slice(0, 10), []);
    expect(specOf(state(), 'r99')?.x).toHaveLength(10);

    undoEdit('r99');
    expect(specOf(state(), 'r99')?.x).toHaveLength(r99.x.length + 1);
    expect(state().anchors).toEqual([2]);
    undoEdit('r99');
    expect(specOf(state(), 'r99')).toEqual(r99);
    redoEdit('r99');
    redoEdit('r99');
    expect(specOf(state(), 'r99')?.x).toHaveLength(10);
    expect(specOf(state(), 'r99')?.time_points).toEqual(r99.time_points.slice(0, 10));
    // Another weapon starts a history of its own
    selectWeapon('r301');
    expect(state().history.past).toEqual([]);
  });

  it('keeps one copy of each screenshot', () => {
    const one = { id: 'a', name: 'wall.png', src: 'data:a', source: 'Disk' };
    expect(addToBatch([one, { ...one, id: 'b' }])).toEqual({ added: 1, duplicates: 1 });
    expect(addToBatch([{ id: 'c', name: 'other.png', src: 'data:a', source: 'Disk' }])).toEqual({
      added: 0,
      duplicates: 1,
    });
    addToBatch([{ id: 'd', name: 'second.png', src: 'data:d', source: 'Library', url: '/captures/x.png' }]);
    expect(state().batch.map((b) => [b.id, b.status])).toEqual([
      ['a', 'ready'],
      ['d', 'ready'],
    ]);
    // Prev and Next go round
    goToFrame(-1);
    expect(state().frame).toBe(1);
    expect(state().background).toMatchObject({ key: 'batch:d', name: 'second.png', correct: true });
    goToFrame(2);
    expect(state().frame).toBe(0);
    removeFromBatch(0);
    expect(frames(state())).toEqual([{ name: 'second.png', src: 'data:d' }]);
  });

  it('records sprays into the slot marked for a re-recording', () => {
    const sample = (id: string) => ({ id, name: 'Spray #1', clip: new Blob([]), url: `blob:${id}`, durationSec: 2 });
    recordSample(sample('a'));
    recordSample({ ...sample('b'), name: 'Spray #2' });
    toggleSlot(0);
    recordSample({ ...sample('c'), name: 'Spray #3' });
    expect(state().samples.map((s) => [s.id, s.name])).toEqual([
      ['c', 'Spray #1'],
      ['b', 'Spray #2'],
    ]);
    expect(state().slot).toBeNull();
    discard(0);
    expect(state().samples.map((s) => [s.id, s.name])).toEqual([['b', 'Spray #1']]);
  });

  it("starts a session on the analysis' weapon and frame", () => {
    const r99 = spec('r99');
    const result = analysisResult.parse({
      spec: { ...r99, x: r99.x.map((x) => x + 1) },
      trials_count: 2,
      individual_trials: [
        { source: 'one.webm', shots: 33, x: [], y: [], frame_image: 'data:1', frame_points: [] },
        { source: 'two.webm', shots: 30, x: [], y: [], frame_image: 'data:2', frame_points: [] },
      ],
    });
    const outcome = applyAnalysis(result, {
      choice: { weapon: 'r99', mode: 'auto', saveCapture: false, strategy: 'overwrite' },
      saved: r99,
      draft: specOf(state(), 'r99'),
      sent: 2,
      zoom: 2,
    });
    startSession(outcome);
    expect(useEditorSettings.getState().weapon).toBe('r99');
    expect(isUnsaved(state(), 'r99')).toBe(true);
    expect(state().background).toMatchObject({ name: 'one.webm', src: 'data:1', correct: false });
    goToFrame(1);
    expect(state().background).toMatchObject({ name: 'two.webm', src: 'data:2' });
    // Another weapon ends it
    selectWeapon('r301');
    expect(state().session).toBeNull();
  });
});
