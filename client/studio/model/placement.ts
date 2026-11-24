import { captureDecals, captureToSpecScale, mouseToPixelScale } from './calibration';
import { discrepancyReport, type Report } from './discrepancy';
import type { Session } from './session';
import { multiplierOf, round2, shotCount, unitShot, type Pattern, type Pt, type Shot } from './spec';

// Where a pattern sits on the canvas. On a screenshot the canvas works in the image's pixels: shot 0
// sits at the spray's origin and the others at the image's scale, measured from the decals the
// analysis found or worked out from the optic. Without a screenshot it works in the spec's own
// units. Edits come back through the same placement, so a shot that wasn't moved keeps its exact
// value (client/modules/editor/overlays.ts and canvas.ts placed and read shots with two different
// scales, and a tall pattern shrank when it was edited without a screenshot).

export interface Placement {
  /** Where shot 0 is, in canvas units */
  origin: Pt;
  /** Image pixels per mouse count at 1x on a screenshot; null draws the spec's own values */
  pxPerCount: number | null;
}

/** The optic and screen settings the Setup panel holds */
export interface Optics {
  /** The optic's zoom: 1, 2, 3 or 4 */
  zoom: number;
  /** The game's field of view in degrees */
  fov: number;
  /** The Visual scale fine-tune, 0.8 to 1.2 */
  scaleFactor: number;
}

/** The screenshot's size in pixels */
export interface FrameSize {
  width: number;
  height: number;
}

export const plainPlacement: Placement = { origin: { x: 0, y: 0 }, pxPerCount: null };

export function shotToWorld(spec: Pattern, i: number, placement: Placement): Pt {
  const { origin, pxPerCount } = placement;
  if (pxPerCount === null) return { x: origin.x + spec.x[i], y: origin.y + spec.y[i] };
  const u = unitShot(spec, i);
  return { x: origin.x + u.x * pxPerCount, y: origin.y + u.y * pxPerCount };
}

export const patternToWorld = (spec: Pattern, placement: Placement): Pt[] =>
  Array.from({ length: shotCount(spec) }, (_, i) => shotToWorld(spec, i, placement));

/** The spec values of a shot at `at`, measured from shot 0 at `first` */
export function worldToShot(at: Pt, first: Pt, placement: Placement, spec: Pattern): Shot {
  const mult = multiplierOf(spec);
  const hasRaw = Boolean(spec.raw_1x_x && spec.raw_1x_y);
  if (placement.pxPerCount === null) {
    const x = round2(at.x - first.x);
    const y = round2(at.y - first.y);
    return { x, y, ...(hasRaw ? { raw: { x: round2(x / mult), y: round2(y / mult) } } : {}) };
  }
  const ux = (at.x - first.x) / placement.pxPerCount;
  const uy = (at.y - first.y) / placement.pxPerCount;
  return { x: round2(ux * mult), y: round2(uy * mult), ...(hasRaw ? { raw: { x: round2(ux), y: round2(uy) } } : {}) };
}

/** The default spray origin on a screenshot: the crosshair, a little left of and above the center */
export const defaultOrigin = (size: FrameSize): Pt => ({ x: size.width * 0.487, y: size.height * 0.495 });

const isSet = (p: [number, number] | undefined): p is [number, number] => !!p && (p[0] > 0 || p[1] > 0);

/**
 * Where a spec sits on frame `index`: shot 0 at the decals' origin (else the spray's or the preview's
 * reported origin, else the default), at the scale the decals measure against `spec`, else the one
 * the optic, the field of view and the image height give.
 */
export function framePlacement({
  spec,
  session,
  index,
  size,
  optics,
}: {
  spec: Pattern;
  session: Session | null;
  index: number;
  size: FrameSize;
  optics: Optics;
}): Placement {
  const decals = captureDecals(session, index);
  return {
    origin: frameOrigin(session, index, size, decals?.origin),
    pxPerCount: captureToSpecScale(decals, spec) || opticScale(session, size, optics),
  };
}

function frameOrigin(session: Session | null, index: number, size: FrameSize, decalOrigin?: [number, number]): Pt {
  if (decalOrigin) return { x: decalOrigin[0], y: decalOrigin[1] };
  const trialOrigin = session?.trials[index]?.origin;
  const previewOrigin = session?.previewOrigin;
  const reported = isSet(trialOrigin) ? trialOrigin : isSet(previewOrigin) ? previewOrigin : null;
  if (reported) return { x: reported[0], y: reported[1] };
  return defaultOrigin({
    width: session?.frameWidth || size.width || 1920,
    height: session?.frameHeight || size.height || 1080,
  });
}

/** Image pixels per mouse count at 1x from the optic, the field of view and the image height */
export function opticScale(session: Pick<Session, 'zoom' | 'frameHeight'> | null, size: FrameSize, optics: Optics) {
  const zoom = session && session.zoom > 0 ? session.zoom : optics.zoom;
  const height = session?.frameHeight || size.height || 1080;
  return mouseToPixelScale(height, zoom, optics.fov, optics.scaleFactor);
}

/**
 * The decals found on frame `index`, in image pixels; a spray analyzed without frame points is drawn
 * from its origin at the measured or optical scale instead.
 */
export function detectedPoints(session: Session, index: number, size: FrameSize, optics: Optics): Pt[] {
  const trial = session.trials[index];
  if (!trial) return index === 0 ? session.previewPoints.map(([x, y]) => ({ x, y })) : [];
  if (trial.frame_points.length > 0) return trial.frame_points.map(([x, y]) => ({ x, y }));
  const scale = captureToSpecScale(captureDecals(session, index), trial) || opticScale(session, size, optics);
  const [ox, oy] = trial.origin;
  return trial.x.slice(0, trial.y.length).map((x, i) => ({ x: ox + x * scale, y: oy + trial.y[i] * scale }));
}

export type DeltaTone = 'ok' | 'warn' | 'bad';

export interface Delta {
  from: Pt;
  to: Pt;
  /** How far apart the two shots are, in canvas units (image pixels on a screenshot) */
  distance: number;
  tone: DeltaTone;
  /** Shown next to the longest strays */
  label?: string;
}

export interface Comparison {
  saved: Pt[];
  candidate: Pt[];
  deltas: Delta[];
  report: Report;
}

/** Strays under 3 px aren't drawn; over 10 px they show amber, over 22 px red, and over 25 px they carry their length */
export function deltaOf(from: Pt, to: Pt): Delta | null {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance <= 3) return null;
  const tone: DeltaTone = distance > 22 ? 'bad' : distance > 10 ? 'warn' : 'ok';
  return { from, to, distance, tone, ...(distance > 25 ? { label: `Δ${Math.round(distance)}px` } : {}) };
}

/**
 * The saved spec and the candidate side by side, with a line from each saved shot to the candidate's.
 * On a screenshot the candidate is what the frame shows (its decals, then its later shots at the
 * measured scale) and the saved spec is placed from the same origin at the same scale.
 */
export function compareOnFrame({
  saved,
  candidate,
  session,
  index,
  size,
  optics,
}: {
  saved: Pattern;
  candidate: Pattern;
  session: Session | null;
  index: number;
  size: FrameSize;
  optics: Optics;
}): Comparison {
  const decals = captureDecals(session, index);
  const pxPerCount =
    captureToSpecScale(decals, candidate) || captureToSpecScale(decals, saved) || opticScale(session, size, optics);
  const placement: Placement = { origin: frameOrigin(session, index, size, decals?.origin), pxPerCount };

  const found = decals?.points.map(([x, y]) => ({ x, y })) ?? [];
  const later = patternToWorld(candidate, placement).slice(found.length);
  const candidatePoints = [...found, ...later];
  const savedPoints = patternToWorld(saved, placement);
  const zoom = session && session.zoom > 0 ? session.zoom : optics.zoom;
  return withDeltas(savedPoints, candidatePoints, discrepancyReport(saved, candidate, zoom, pxPerCount));
}

/** The two specs in their own units, without a screenshot */
export function compareInSpecUnits(saved: Pattern, candidate: Pattern, report: Report): Comparison {
  return withDeltas(patternToWorld(saved, plainPlacement), patternToWorld(candidate, plainPlacement), report);
}

function withDeltas(saved: Pt[], candidate: Pt[], report: Report): Comparison {
  const deltas: Delta[] = [];
  for (let i = 0; i < Math.min(saved.length, candidate.length); i++) {
    const delta = deltaOf(saved[i], candidate[i]);
    if (delta) deltas.push(delta);
  }
  return { saved, candidate, deltas, report };
}

/** The stage's zoom and position */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 8;

/** The view that shows `bounds` whole and centered, never enlarged past `maxScale` */
export function fitView(bounds: Bounds, stage: FrameSize, padding = 20, maxScale = 1): View {
  const scale = Math.max(
    MIN_ZOOM,
    Math.min(
      (stage.width - padding * 2) / Math.max(bounds.width, 1),
      (stage.height - padding * 2) / Math.max(bounds.height, 1),
      maxScale,
    ),
  );
  return {
    scale,
    x: (stage.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (stage.height - bounds.height * scale) / 2 - bounds.y * scale,
  };
}

export function boundsOf(points: Pt[]): Bounds {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The view zoomed by `factor` around the stage point `at`, within the zoom limits */
export function zoomAt(view: View, factor: number, at: Pt): View {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * factor));
  const world = { x: (at.x - view.x) / view.scale, y: (at.y - view.y) / view.scale };
  return { scale, x: at.x - world.x * scale, y: at.y - world.y * scale };
}
