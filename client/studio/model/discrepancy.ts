import { mouseToPixelScale } from './calibration';
import { unitShot, type Pattern } from './spec';

// How far a candidate pattern strays from the saved spec, shot by shot, before it replaces it: the
// figures the save checkpoint and the Compare overlay show. Moved from
// client/modules/analysis/DiscrepancyInspector.ts; the figures and the thresholds are the same, the
// warnings are data for the interface to word.

export type Warning =
  /** The candidate has fewer shots than the saved spec: saving shortens the pattern */
  | { kind: 'truncated'; candidate: number; saved: number }
  | { kind: 'extra'; candidate: number; saved: number }
  /** The average shot is far from its saved place */
  | { kind: 'mean'; px: number; counts: number }
  /** One shot is far from its saved place */
  | { kind: 'outlier'; shot: number; px: number; counts: number }
  /** The pattern climbs where the saved one falls, or the other way round */
  | { kind: 'inverted' };

export type Status = 'safe' | 'warning' | 'danger';

export interface Report {
  savedShots: number;
  candidateShots: number;
  shotCountMatches: boolean;
  /** Candidate minus saved */
  shotCountDelta: number;
  meanPx: number;
  maxPx: number;
  /** Zero-based index of the shot that strays most */
  maxShot: number;
  meanCounts: number;
  maxCounts: number;
  /** Whether the patterns differ at all (a shot moved more than 0.05 counts, or the counts differ) */
  hasDifferences: boolean;
  hasMajorDiscrepancy: boolean;
  warnings: Warning[];
  status: Status;
}

/**
 * Compares two patterns in mouse counts at 1x and converts the strays to image pixels with
 * `pxPerCount` (the screenshot's measured scale), or for a 1080p screenshot at `zoom` without one.
 */
export function discrepancyReport(saved: Pattern, candidate: Pattern, zoom = 2, pxPerCount?: number): Report {
  const savedShots = saved.x.length;
  const candidateShots = candidate.x.length;
  const shotCountDelta = candidateShots - savedShots;
  const shotCountMatches = savedShots === candidateShots;
  const scale = pxPerCount && pxPerCount > 0 ? pxPerCount : mouseToPixelScale(1080, zoom);

  const common = Math.min(savedShots, candidateShots);
  let sum = 0;
  let maxCounts = 0;
  let maxShot = 0;
  let hasDifferences = !shotCountMatches;
  for (let i = 0; i < common; i++) {
    const b = unitShot(saved, i);
    const c = unitShot(candidate, i);
    const d = Math.hypot(c.x - b.x, c.y - b.y);
    if (d > 0.05) hasDifferences = true;
    sum += d;
    if (d > maxCounts) {
      maxCounts = d;
      maxShot = i;
    }
  }
  const meanCounts = common > 0 ? sum / common : 0;
  const meanPx = meanCounts * scale;
  const maxPx = maxCounts * scale;

  const warnings: Warning[] = [];
  if (savedShots > 0 && candidateShots < savedShots) {
    warnings.push({ kind: 'truncated', candidate: candidateShots, saved: savedShots });
  } else if (savedShots > 0 && candidateShots > savedShots) {
    warnings.push({ kind: 'extra', candidate: candidateShots, saved: savedShots });
  }
  if (meanPx > 22) warnings.push({ kind: 'mean', px: meanPx, counts: meanCounts });
  if (maxPx > 42) warnings.push({ kind: 'outlier', shot: maxShot, px: maxPx, counts: maxCounts });
  if (common >= 5) {
    const savedEnd = saved.y[common - 1];
    const candidateEnd = candidate.y[common - 1];
    if ((savedEnd < 0 && candidateEnd > 0) || (savedEnd > 0 && candidateEnd < 0)) warnings.push({ kind: 'inverted' });
  }

  const hasMajorDiscrepancy = warnings.length > 0 || !shotCountMatches || meanPx > 20;
  const danger =
    warnings.some((w) => w.kind === 'inverted' || w.kind === 'truncated') ||
    meanPx > 30 ||
    Math.abs(shotCountDelta) >= 3;
  const status: Status = danger ? 'danger' : hasMajorDiscrepancy ? 'warning' : 'safe';

  return {
    savedShots,
    candidateShots,
    shotCountMatches,
    shotCountDelta,
    meanPx,
    maxPx,
    maxShot,
    meanCounts,
    maxCounts,
    hasDifferences,
    hasMajorDiscrepancy,
    warnings,
    status,
  };
}

const px = (value: number) => `${value.toFixed(1)} px`;
const counts = (value: number) => `${value.toFixed(1)} counts`;

/** A warning in words */
export function describeWarning(w: Warning): string {
  switch (w.kind) {
    case 'truncated':
      return `The candidate has ${w.candidate} shots and the saved spec ${w.saved}: saving drops the last ${w.saved - w.candidate}.`;
    case 'extra':
      return `The candidate has ${w.candidate - w.saved} more shots than the saved spec (${w.candidate} against ${w.saved}).`;
    case 'mean':
      return `On average a shot lands ${px(w.px)} (${counts(w.counts)}) from the saved pattern.`;
    case 'outlier':
      return `Shot ${w.shot + 1} lands ${px(w.px)} (${counts(w.counts)}) from its saved place.`;
    case 'inverted':
      return 'The pattern runs the other way up from the saved one. Check the camera tracking.';
  }
}

/** Badge tones for the per-shot figures, as the checkpoint showed them */
export const meanStatus = (meanPx: number): Status => (meanPx < 12 ? 'safe' : meanPx < 25 ? 'warning' : 'danger');
export const maxStatus = (maxPx: number): Status => (maxPx < 20 ? 'safe' : maxPx < 40 ? 'warning' : 'danger');
