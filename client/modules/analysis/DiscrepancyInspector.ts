/**
 * Discrepancy Inspector Module:
 * Precision mathematical comparison between candidate recoil curves and canonical baseline specs,
 * ground-truth decal coordinate scaling, and divergence HUD reporting.
 */

import { DiscrepancyReport } from '../types';

/**
 * Computes mouse Mickey to screen pixel scale using Source engine perspective projection.
 * Formula: (zoom / 3.36) * (h / 1080) * (1 / tan(fov/2)) * scaleFactor
 */
export function getMouseToPixelScale(
  imgHeight: number = 1080,
  zoom: number = 2.0,
  fov: number = 104.0,
  activeScaleFactor: number = 1.0
): number {
  const z = (zoom && zoom > 0) ? zoom : 2.0;
  const h = (imgHeight && imgHeight > 0) ? imgHeight : 1080;
  const f = (fov && fov > 0) ? fov : 104.0;
  const fovFactor = 1.0 / Math.tan((f * Math.PI) / 360);
  return (z / 3.36) * (h / 1080) * fovFactor * activeScaleFactor;
}

/**
 * Computes empirical scaling factor (in screenshot pixels per 1x spec unit)
 * mapping canonical spec coordinates directly to screenshot wall decals
 * via least-squares regression.
 */
export function computeCaptureToSpecScale(
  captureDecals: { points: [number, number][], origin: [number, number] } | null,
  referenceSpec?: any
): number | null {
  if (!captureDecals || !captureDecals.points || captureDecals.points.length < 2) {
    return null;
  }
  const spec = referenceSpec;
  if (!spec || !spec.x || !spec.y || spec.x.length < 2) {
    return null;
  }

  const mult = spec.multiplier || 1.0;
  const numPoints = Math.min(captureDecals.points.length, spec.x.length);
  if (numPoints < 2) return null;

  let dotProduct = 0;
  let specNormSq = 0;
  let sumCapDist = 0;
  let sumSpecDist = 0;

  for (let i = 1; i < numPoints; i++) {
    const capDx = captureDecals.points[i][0] - captureDecals.origin[0];
    const capDy = captureDecals.points[i][1] - captureDecals.origin[1];

    const specDx = (spec.raw_1x_x && spec.raw_1x_x[i] !== undefined)
      ? spec.raw_1x_x[i]
      : (mult ? spec.x[i] / mult : spec.x[i]);
    const specDy = (spec.raw_1x_y && spec.raw_1x_y[i] !== undefined)
      ? spec.raw_1x_y[i]
      : (mult ? spec.y[i] / mult : spec.y[i]);

    dotProduct += (capDx * specDx + capDy * specDy);
    specNormSq += (specDx * specDx + specDy * specDy);

    sumCapDist += Math.hypot(capDx, capDy);
    sumSpecDist += Math.hypot(specDx, specDy);
  }

  if (specNormSq > 0.0001 && dotProduct > 0.0001) {
    return dotProduct / specNormSq;
  }
  if (sumSpecDist > 0.0001 && sumCapDist > 0.0001) {
    return sumCapDist / sumSpecDist;
  }
  return null;
}

/**
 * Generates an analytical discrepancy report comparing baseline and candidate weapon specs.
 */
export function computeDiscrepancyReport(
  baselineSpec: any,
  candidateSpec: any,
  zoom: number = 2.0,
  imgH: number = 1080,
  captureScaleOverride?: number,
  mergeStrategy: string = 'accumulate'
): DiscrepancyReport {
  const weapon = baselineSpec?.name || candidateSpec?.name || 'WEAPON';
  const baselineShots = baselineSpec?.x?.length || 0;
  const candidateShots = candidateSpec?.x?.length || 0;
  const shotCountDelta = candidateShots - baselineShots;
  const shotCountMatches = (baselineShots === candidateShots);

  const mouseToPx = (captureScaleOverride && captureScaleOverride > 0)
    ? captureScaleOverride
    : getMouseToPixelScale(imgH, zoom);

  const bMult = baselineSpec?.multiplier || 1.0;
  const cMult = candidateSpec?.multiplier || 1.0;

  const commonLen = Math.min(baselineShots, candidateShots);
  let sumDevMickeys = 0;
  let maxDevMickeys = 0;
  let maxDevIdx = 0;
  let hasDifferences = (baselineShots !== candidateShots);

  for (let i = 0; i < commonLen; i++) {
    const bx = (baselineSpec.raw_1x_x && baselineSpec.raw_1x_x[i] !== undefined)
      ? baselineSpec.raw_1x_x[i]
      : (bMult ? baselineSpec.x[i] / bMult : baselineSpec.x[i]);
    const by = (baselineSpec.raw_1x_y && baselineSpec.raw_1x_y[i] !== undefined)
      ? baselineSpec.raw_1x_y[i]
      : (bMult ? baselineSpec.y[i] / bMult : baselineSpec.y[i]);

    const cx = (candidateSpec.raw_1x_x && candidateSpec.raw_1x_x[i] !== undefined)
      ? candidateSpec.raw_1x_x[i]
      : (cMult ? candidateSpec.x[i] / cMult : candidateSpec.x[i]);
    const cy = (candidateSpec.raw_1x_y && candidateSpec.raw_1x_y[i] !== undefined)
      ? candidateSpec.raw_1x_y[i]
      : (cMult ? candidateSpec.y[i] / cMult : candidateSpec.y[i]);

    const dM = Math.hypot(cx - bx, cy - by);
    if (dM > 0.05) hasDifferences = true;
    sumDevMickeys += dM;
    if (dM > maxDevMickeys) {
      maxDevMickeys = dM;
      maxDevIdx = i;
    }
  }

  const meanDevMickeys = commonLen > 0 ? (sumDevMickeys / commonLen) : 0;
  const meanDeviationPx = meanDevMickeys * mouseToPx;
  const maxDeviationPx = maxDevMickeys * mouseToPx;

  const warnings: string[] = [];

  if (baselineShots > 0 && candidateShots < baselineShots) {
    warnings.push(`⚠️ Shot count truncation: Candidate has ${candidateShots} shots, but saved spec has ${baselineShots} shots (${baselineShots - candidateShots} missing shots). Saving will shorten the compensation curve.`);
  } else if (baselineShots > 0 && candidateShots > baselineShots) {
    warnings.push(`⚠️ Extra shots detected: Candidate has ${candidateShots} shots, but saved spec has ${baselineShots} shots (${candidateShots - baselineShots} additional shots).`);
  }

  if (meanDeviationPx > 22.0) {
    warnings.push(`⚠️ High average deflection error: ${meanDeviationPx.toFixed(1)}px (${meanDevMickeys.toFixed(1)} mickeys). Pattern deviates heavily from baseline.`);
  }

  if (maxDeviationPx > 42.0) {
    warnings.push(`⚠️ Large outlier deflection at Shot #${maxDevIdx + 1}: ${maxDeviationPx.toFixed(1)}px (${maxDevMickeys.toFixed(1)} mickeys) deviation from baseline.`);
  }

  if (commonLen >= 5 && baselineSpec.y && candidateSpec.y) {
    const baseEndY = baselineSpec.y[commonLen - 1];
    const candEndY = candidateSpec.y[commonLen - 1];
    if ((baseEndY < 0 && candEndY > 0) || (baseEndY > 0 && candEndY < 0)) {
      warnings.push(`🚨 Inverted recoil direction! Vertical progression is opposite to saved baseline. Check camera tracking.`);
    }
  }

  let status: 'safe' | 'warning' | 'danger' = 'safe';
  const hasMajorDiscrepancy = warnings.length > 0 || !shotCountMatches || meanDeviationPx > 20;

  if (warnings.some(w => w.startsWith('🚨') || w.includes('truncation')) || meanDeviationPx > 30 || Math.abs(shotCountDelta) >= 3) {
    status = 'danger';
  } else if (hasMajorDiscrepancy) {
    status = 'warning';
  } else {
    status = 'safe';
  }

  const savedSamples = baselineSpec?.sample_count || 1;
  const candSamples = candidateSpec?.sample_count || (savedSamples + 1);
  const isAccumulate = mergeStrategy === 'accumulate';

  const savedSamplesText = `${savedSamples} sample${savedSamples === 1 ? '' : 's'}`;
  const candidateSamplesText = isAccumulate
    ? `${candSamples} samples (Proportional Refinement)`
    : `${candidateSpec?.new_sample_count || 1} sample (Fresh Overwrite)`;

  return {
    weapon,
    baselineShots,
    candidateShots,
    shotCountMatches,
    shotCountDelta,
    meanDeviationPx,
    maxDeviationPx,
    maxDeviationShotIdx: maxDevIdx,
    meanDeviationMickeys: meanDevMickeys,
    maxDeviationMickeys: maxDevMickeys,
    hasMajorDiscrepancy,
    hasDifferences,
    warnings,
    status,
    savedSamplesText,
    candidateSamplesText
  };
}
