import { useEditorSettings } from '@/lib/storage/editor';
import { addShot, canvasShots, measureShots, moveShot, removeShot, toggleAnchor, type Edit } from './model/pattern';
import {
  compareInSpecUnits,
  compareOnFrame,
  detectedPoints,
  framePlacement,
  plainPlacement,
  type Comparison,
  type Optics,
  type Placement,
} from './model/placement';
import { discrepancyReport } from './model/discrepancy';
import type { Pattern, Pt, Spec } from './model/spec';
import { applyShots, savedOf, selectedWeapon, specOf, useStudio, type StudioState } from './store';

// Where the canvas draws each pattern and how an edit on it comes back to the spec. The placement
// depends on the screenshot (its size, the session's decals), the optic settings and the Align
// tool's shift, all in the store, so the canvas and the panels place patterns the same way.

type Settings = ReturnType<typeof useEditorSettings.getState>;

export const opticsOf = (settings: Pick<Settings, 'captureOptic' | 'captureFov' | 'scaleFactor'>): Optics => ({
  zoom: Number(settings.captureOptic),
  fov: settings.captureFov,
  scaleFactor: settings.scaleFactor,
});

type PlacementState = Pick<StudioState, 'frameSize' | 'session' | 'frame' | 'offset'>;

/** Where `spec` sits on the canvas: on the screenshot when there is one, in its own units otherwise */
export function placementOf(state: PlacementState, optics: Optics, spec: Pattern): Placement {
  const base = state.frameSize
    ? framePlacement({ spec, session: state.session, index: state.frame, size: state.frameSize, optics })
    : plainPlacement;
  return { ...base, origin: { x: base.origin.x + state.offset.x, y: base.origin.y + state.offset.y } };
}

/** The weapon's spec and its placement, for an edit */
function editing() {
  const state = useStudio.getState();
  const name = selectedWeapon();
  const spec = specOf(state, name);
  if (!spec) return null;
  const placement = placementOf(state, opticsOf(useEditorSettings.getState()), spec);
  const edit: Edit = { shots: canvasShots(spec, placement), anchors: state.anchors };
  return { name, spec, placement, edit };
}

/**
 * Turns the edited canvas into the spec's shots. Shot 0 is drawn at the placement's origin, so when an
 * edit moves shot 0 (moved, added before it, or removed) the origin follows it, and the pattern stays
 * where it was drawn instead of jumping back.
 */
function commit(current: NonNullable<ReturnType<typeof editing>>, edit: Edit) {
  const shots = measureShots(edit.shots, current.placement, current.spec);
  const first = edit.shots[0]?.at;
  const { origin } = current.placement;
  const { offset } = useStudio.getState();
  const moved = first && (first.x !== origin.x || first.y !== origin.y);
  applyShots(
    current.name,
    shots,
    edit.anchors,
    moved ? { x: offset.x + first.x - origin.x, y: offset.y + first.y - origin.y } : undefined,
  );
}

/** Adds shots at canvas points, each where it fits the sequence */
export function addShotsAt(points: Pt[]) {
  const current = editing();
  if (!current || points.length === 0) return;
  let edit = current.edit;
  for (const at of points) edit = addShot(edit, at);
  commit(current, edit);
}

export function moveShotTo(index: number, at: Pt) {
  const current = editing();
  if (current) commit(current, moveShot(current.edit, index, at));
}

export function removeShotAt(index: number) {
  const current = editing();
  if (current) commit(current, removeShot(current.edit, index));
}

export function toggleAnchorAt(index: number) {
  const current = editing();
  if (current) commit(current, { ...current.edit, anchors: toggleAnchor(current.edit.anchors, index) });
}

/** The comparison of the saved spec with the one being edited, on the screenshot or in spec units */
export function comparisonOf(
  state: Pick<StudioState, 'frameSize' | 'session' | 'frame'>,
  optics: Optics,
  saved: Spec,
  candidate: Spec,
): Comparison {
  if (state.frameSize) {
    return compareOnFrame({
      saved,
      candidate,
      session: state.session,
      index: state.frame,
      size: state.frameSize,
      optics,
    });
  }
  const zoom = state.session?.zoom || optics.zoom;
  return compareInSpecUnits(saved, candidate, discrepancyReport(saved, candidate, zoom));
}

/** The decals the analysis found on the frame shown, when a session has them */
export function decalsOf(state: Pick<StudioState, 'frameSize' | 'session' | 'frame'>, optics: Optics): Pt[] {
  if (!state.session || !state.frameSize) return [];
  return detectedPoints(state.session, state.frame, state.frameSize, optics);
}

/** The weapon's saved spec and the one being edited */
export function specsOf(state: Pick<StudioState, 'saved' | 'drafts'>, name: string) {
  return { draft: specOf(state, name), saved: savedOf(state, name) };
}
