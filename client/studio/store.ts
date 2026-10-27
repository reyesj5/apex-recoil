import { create } from 'zustand';
import { getWeaponModeConfig } from '@/engine/weapons';
import type { JobProgress } from '@/lib/api';
import { useEditorSettings } from '@/lib/storage/editor';
import { sessionFrames, type AnalysisOutcome } from './model/analysis';
import type { Detection } from './model/detect';
import type { Report } from './model/discrepancy';
import type { FrameSize, View } from './model/placement';
import { addSample, discardSample, slotAfterDiscard, type Sample } from './model/capture';
import { emptyHistory, record, redo, undo, type History } from './model/history';
import type { Session } from './model/session';
import { findSpec, retime, sameSpec, withShots, type Pt, type Shot, type Spec } from './model/spec';

// The Studio's working state (docs/ui-migration-plan.md, Phase 3.2): the specs being edited, the
// analysis session, the screenshots and recorded sprays, and what the canvas shows. Specs come from
// the API (useSpecs) and are copied in as `saved`; an edit makes a draft of that weapon, which Save
// sends. Settings that last between visits live in useEditorSettings, under the Recoil Editor's keys.

/** A screenshot in the Screenshots tab */
export interface BatchItem {
  id: string;
  name: string;
  /** The image as a data URL */
  src: string;
  /** Where it came from: Disk, Library or Import */
  source: string;
  /** The library address it was added from */
  url?: string;
  status: 'ready' | 'analyzing' | 'done' | 'failed';
  shots?: number;
  expected?: number;
}

/** The image under the pattern */
export interface Background {
  /** Tells images apart, so the canvas knows when to load another */
  key: string;
  name: string;
  src: string;
  /** Apply the color correction: screenshots from the game get it, analyzed frames and the Manual tab's image don't */
  correct: boolean;
}

export type Tool = 'select' | 'pan' | 'align' | 'correct';

/** The pattern drawn on the canvas: the spec being edited, the saved one, the new samples alone, or the decals found */
export type Shown = 'draft' | 'saved' | 'batch' | 'decals';

export interface Layers {
  wall: boolean;
  /** Percent */
  wallOpacity: number;
  pattern: boolean;
  patternOpacity: number;
}

/**
 * What undo brings back: the pattern, its shot times (at the fire rate they were set for), its anchors
 * and where it sits on the frame
 */
interface PatternState {
  x: number[];
  y: number[];
  raw_1x_x?: number[];
  raw_1x_y?: number[];
  time_points: number[];
  rpm: number;
  anchors: number[];
  offset: Pt;
}

/** Recorded sprays (the Live tab) or screenshots (the Screenshots tab) */
export type AnalysisKind = 'session' | 'static';

/** The analysis running, as the server reports it */
export interface Job {
  id: string;
  kind: AnalysisKind;
  weapon: string;
  progress: JobProgress;
}

/** An analysis' outcome, shown in the tab it started from */
export type AnalysisRecord =
  | { state: 'sending' }
  | { state: 'running' }
  | { state: 'done'; outcome: AnalysisOutcome; weapon: string; mode: string }
  | { state: 'failed'; error: string };

export type Section = 'capture' | 'library' | 'sessions' | 'import';

export type Dialog =
  | { kind: 'shortcuts' }
  | { kind: 'analysis'; analysis: AnalysisKind }
  | { kind: 'checkpoint'; report: Report }
  | { kind: 'video'; title: string; url: string }
  | { kind: 'new-weapon' };

export interface StudioState {
  /** The specs as the server has them; null until they load */
  saved: Spec[] | null;
  drafts: Record<string, Spec>;
  /** The selected weapon's fire mode, for analyses */
  mode: string;
  anchors: number[];
  history: History<PatternState>;
  session: Session | null;
  batch: BatchItem[];
  samples: Sample[];
  /** The sample the next recording replaces */
  slot: number | null;
  /** The frame shown: a session's spray, or a screenshot of the batch */
  frame: number;
  background: Background | null;
  shown: Shown;
  comparing: boolean;
  tool: Tool;
  /** How far the Align tool moved the pattern on the frame */
  offset: Pt;
  layers: Layers;
  job: Job | null;
  analyses: Partial<Record<AnalysisKind, AnalysisRecord>>;
  /** The rail's section in the side panel */
  section: Section;
  dialog: Dialog | null;
  /** The canvas' zoom and position */
  view: View;
  /** Counts Fit requests (F, the Fit button); the canvas fits when it changes */
  fits: number;
  /** The shot under the pointer or being dragged */
  hovered: number | null;
  /** The screenshot's size once it has loaded; the canvas works in its pixels */
  frameSize: FrameSize | null;
  /** The Manual tab's targets on the screenshot */
  detection: Detection | null;
}

const initialLayers: Layers = { wall: true, wallOpacity: 80, pattern: true, patternOpacity: 100 };

const initial: StudioState = {
  saved: null,
  drafts: {},
  mode: 'auto',
  anchors: [],
  history: emptyHistory<PatternState>(),
  session: null,
  batch: [],
  samples: [],
  slot: null,
  frame: 0,
  background: null,
  shown: 'draft',
  comparing: false,
  tool: 'select',
  offset: { x: 0, y: 0 },
  layers: initialLayers,
  job: null,
  analyses: {},
  section: 'capture',
  dialog: null,
  view: { scale: 1, x: 0, y: 0 },
  fits: 0,
  hovered: null,
  frameSize: null,
  detection: null,
};

export const useStudio = create<StudioState>()(() => initial);

const set = useStudio.setState;
const get = useStudio.getState;

/** Back to an empty Studio (tests start from it) */
export const resetStudio = () => set(initial, true);

export const selectedWeapon = () => useEditorSettings.getState().weapon;

/** The weapon's spec as edited, else as saved */
export function specOf(state: Pick<StudioState, 'saved' | 'drafts'>, name: string): Spec | undefined {
  return state.drafts[name] ?? findSpec(state.saved ?? [], name);
}

export const savedOf = (state: Pick<StudioState, 'saved'>, name: string) => findSpec(state.saved ?? [], name);

/** Whether the weapon's draft differs from what the server has */
export function isUnsaved(state: Pick<StudioState, 'saved' | 'drafts'>, name: string): boolean {
  const draft = state.drafts[name];
  if (!draft) return false;
  const saved = savedOf(state, name);
  return !saved || !sameSpec(draft, saved);
}

/** The specs from the server; the selected weapon falls back to the first when the list doesn't have it */
export function setSaved(saved: Spec[]) {
  set({ saved });
  const { weapon } = useEditorSettings.getState();
  if (saved.length > 0 && !findSpec(saved, weapon) && !get().drafts[weapon]) selectWeapon(saved[0].name);
  else if (!modes(weapon).includes(get().mode)) set({ mode: defaultMode(weapon) });
}

export const modes = (weapon: string): string[] => getWeaponModeConfig(weapon).modes;
const defaultMode = (weapon: string) => getWeaponModeConfig(weapon).defaultMode;

/** Picks a weapon. A session belongs to its weapon, so it ends; the screenshot stays to measure the new one on */
export function selectWeapon(name: string) {
  useEditorSettings.getState().set('weapon', name);
  const { session } = get();
  set({
    mode: defaultMode(name),
    anchors: [],
    history: emptyHistory(),
    shown: 'draft',
    comparing: false,
    offset: { x: 0, y: 0 },
    ...(session && session.weapon !== name ? { session: null, frame: 0 } : {}),
  });
}

export const setMode = (mode: string) => set({ mode });

/** Adds a weapon that the server doesn't have yet; it is saved with the next Save */
export function addWeapon(spec: Spec) {
  set((s) => ({ drafts: { ...s.drafts, [spec.name]: spec } }));
  selectWeapon(spec.name);
}

/** Changes the weapon's spec (the inspector's fields, an import); the pattern's undo history stays */
export function editSpec(name: string, change: (spec: Spec) => Spec) {
  const current = specOf(get(), name);
  if (current) set((s) => ({ drafts: { ...s.drafts, [name]: change(current) } }));
}

const patternState = (spec: Spec, anchors: number[], offset: Pt): PatternState => ({
  x: spec.x,
  y: spec.y,
  ...(spec.raw_1x_x && spec.raw_1x_y ? { raw_1x_x: spec.raw_1x_x, raw_1x_y: spec.raw_1x_y } : {}),
  time_points: spec.time_points,
  rpm: spec.rpm,
  anchors,
  offset,
});

/**
 * A pattern edit from the canvas: the new shots and anchors, and where the pattern now starts on the
 * frame when shot 0 moved; undo takes it back
 */
export function applyShots(name: string, shots: Shot[], anchors: number[], offset?: Pt) {
  const state = get();
  const current = specOf(state, name);
  if (!current) return;
  set({
    history: record(state.history, patternState(current, state.anchors, state.offset)),
    drafts: { ...state.drafts, [name]: withShots(current, shots) },
    anchors,
    ...(offset ? { offset } : {}),
  });
}

function restore(name: string, step: typeof undo<PatternState>) {
  const state = get();
  const current = specOf(state, name);
  if (!current) return;
  const result = step(state.history, patternState(current, state.anchors, state.offset));
  if (!result) return;
  const { anchors, offset, rpm, time_points, ...pattern } = result.state;
  const next: Spec = {
    ...current,
    ...pattern,
    // The fire rate may have changed since: the times move with it
    time_points: retime(time_points, rpm, current.rpm),
  };
  if (!pattern.raw_1x_x) {
    delete next.raw_1x_x;
    delete next.raw_1x_y;
  }
  set({ history: result.history, drafts: { ...state.drafts, [name]: next }, anchors, offset });
}

export const undoEdit = (name: string) => restore(name, undo);
export const redoEdit = (name: string) => restore(name, redo);

/** Drops the weapon's unsaved changes */
export function revert(name: string) {
  set((s) => {
    const drafts = { ...s.drafts };
    delete drafts[name];
    return { drafts, history: emptyHistory(), anchors: [] };
  });
}

/** After a save: the server's list holds the spec, and the draft goes */
export function markSaved(spec: Spec) {
  set((s) => {
    const drafts = { ...s.drafts };
    delete drafts[spec.name];
    const saved = s.saved ?? [];
    const known = saved.some((w) => w.name === spec.name);
    return {
      saved: known ? saved.map((w) => (w.name === spec.name ? spec : w)) : [...saved, spec],
      drafts,
      session: s.session?.weapon === spec.name ? { ...s.session, baseline: spec } : s.session,
    };
  });
}

// Each session's frames get keys of their own, so a second analysis of the same clip reloads them
let sessionCount = 0;

/** An analysis result: its session, and the weapon's spec with the measured pattern */
export function startSession(outcome: AnalysisOutcome) {
  const { session } = outcome;
  sessionCount++;
  set((s) => ({
    session,
    drafts: { ...s.drafts, [session.weapon]: outcome.draft },
    history: emptyHistory(),
    anchors: [],
    shown: 'draft',
    comparing: false,
    offset: { x: 0, y: 0 },
  }));
  if (selectedWeapon() !== session.weapon) {
    useEditorSettings.getState().set('weapon', session.weapon);
    set({ mode: session.mode });
  }
  goToFrame(0);
}

export function endSession() {
  set({ session: null, comparing: false, shown: 'draft', frame: 0 });
}

/** The frames Prev and Next go through: the session's sprays, else the batch's screenshots */
export function frames(state: Pick<StudioState, 'session' | 'batch'>): { name: string; src?: string }[] {
  return state.session ? sessionFrames(state.session) : state.batch.map((b) => ({ name: b.name, src: b.src }));
}

/** Shows frame `index` (Prev and Next wrap around) */
export function goToFrame(index: number) {
  const state = get();
  const list = frames(state);
  if (list.length === 0) return;
  const frame = ((index % list.length) + list.length) % list.length;
  const item = list[frame];
  const key = state.session ? `session:${sessionCount}:${frame}` : `batch:${state.batch[frame].id}`;
  set({
    frame,
    offset: { x: 0, y: 0 },
    background: item.src ? { key, name: item.name, src: item.src, correct: !state.session } : state.background,
  });
}

export function setBackground(background: Background | null) {
  set({ background, offset: { x: 0, y: 0 } });
}

/** Clears the canvas: no screenshot and no session */
export function clearCanvas() {
  set({ background: null, session: null, comparing: false, shown: 'draft', frame: 0, offset: { x: 0, y: 0 } });
}

// The Screenshots tab's list

/** Adds screenshots, leaving out any with a name or an image already in the list; answers how many of each */
export function addToBatch(items: Omit<BatchItem, 'status'>[]) {
  const batch = get().batch;
  const added: BatchItem[] = [];
  let duplicates = 0;
  for (const item of items) {
    const all = [...batch, ...added];
    if (all.some((b) => b.name === item.name || b.src === item.src || (item.url && b.url === item.url))) {
      duplicates++;
      continue;
    }
    added.push({ ...item, status: 'ready' });
  }
  set({ batch: [...batch, ...added] });
  return { added: added.length, duplicates };
}

export function removeFromBatch(index: number) {
  set((s) => {
    const batch = s.batch.filter((_, i) => i !== index);
    return { batch, frame: Math.min(s.frame, Math.max(0, batch.length - 1)) };
  });
}

export const clearBatch = () => set({ batch: [], frame: 0 });

export function updateBatch(change: (item: BatchItem, index: number) => BatchItem) {
  set((s) => ({ batch: s.batch.map(change) }));
}

// The Live tab's recorded sprays

export function recordSample(sample: Sample) {
  const { samples, slot } = get();
  const result = addSample(samples, sample, slot);
  if (result.replaced) URL.revokeObjectURL(result.replaced.url);
  set({ samples: result.samples, slot: null });
}

export function addSamples(added: Sample[]) {
  set((s) => ({ samples: [...s.samples, ...added] }));
}

export function replaceSamples(samples: Sample[]) {
  for (const s of get().samples) URL.revokeObjectURL(s.url);
  set({ samples, slot: null });
}

export function discard(index: number) {
  const { samples, slot } = get();
  if (samples[index]) URL.revokeObjectURL(samples[index].url);
  set({ samples: discardSample(samples, index), slot: slotAfterDiscard(slot, index) });
}

/** Marks a sample for a re-recording, or unmarks it */
export const toggleSlot = (index: number) => set((s) => ({ slot: s.slot === index ? null : index }));

export function setSampleWall(index: number, wall: string) {
  set((s) => ({ samples: s.samples.map((x, i) => (i === index ? { ...x, wall } : x)) }));
}

export const clearSamples = () => replaceSamples([]);

// What the canvas shows

export const setTool = (tool: Tool) => set({ tool });
export const setShown = (shown: Shown) => set({ shown, comparing: false });
export const setComparing = (comparing: boolean) => set({ comparing });
export const setOffset = (offset: Pt) => set({ offset });
export const setLayers = (change: Partial<Layers>) => set((s) => ({ layers: { ...s.layers, ...change } }));
export const setJob = (job: Job | null) => set({ job });
export const setAnchors = (anchors: number[]) => set({ anchors });
export const setHovered = (hovered: number | null) => set({ hovered });
export const setFrameSize = (frameSize: FrameSize | null) => set({ frameSize });
export const setDetection = (detection: Detection | null) => set({ detection });
export const setView = (view: View) => set({ view });
/** Asks the canvas to fit the frame or pattern in view */
export const requestFit = () => set((s) => ({ fits: s.fits + 1 }));

// The interface around it

export const setSection = (section: Section) => set({ section });
export const openDialog = (dialog: Dialog) => set({ dialog });
export const closeDialog = () => set({ dialog: null });
export function setAnalysis(kind: AnalysisKind, record: AnalysisRecord | undefined) {
  set((s) => ({ analyses: { ...s.analyses, [kind]: record } }));
}
