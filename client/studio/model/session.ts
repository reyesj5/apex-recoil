import { z } from 'zod';
import { weaponMod, type WeaponSpec } from '@/lib/api';

// What an analysis job gives back (processing/recoil_discovery/pipeline.py, process_clips_session and
// process_images_session, with saved_to_disk from server/job-processor.ts), checked as it arrives,
// and the session the Studio keeps from it: the spec it measured, the one saved before, and each
// spray's frame with the decals found on it.

const point = z.tuple([z.number(), z.number()]);

/** One analyzed spray: its pattern and the frame its decals were found on */
export const trialResult = z.looseObject({
  /** The clip's or screenshot's file name */
  source: z.string().catch(''),
  shots: z.number(),
  x: z.array(z.number()),
  y: z.array(z.number()),
  /** The decals in image pixels, shot 0 first */
  frame_points: z.array(point).catch([]),
  /** Where the spray starts in the image (0, 0 when unknown) */
  origin: point.catch([0, 0]),
  /** The frame as a data URL */
  frame_image: z.string().nullish(),
  frame_width: z.number().catch(0),
  frame_height: z.number().catch(0),
  rpm: z.number().nullish(),
});

/**
 * A spec as an analysis measures it. Like the API's, but looser: an analysis that finds no shots
 * reports an empty pattern with a magazine of 0, and its magazines aren't used anyway (the weapon's
 * own stay)
 */
const analyzedSpec = z.looseObject({
  name: z.string(),
  rpm: z.number(),
  multiplier: z.number().optional(),
  mags: z.array(z.looseObject({ size: z.number(), audio: z.string() })).catch([]),
  mods: z.record(z.string(), weaponMod).catch({}),
  x: z.array(z.number()),
  y: z.array(z.number()),
  time_points: z.array(z.number()),
  ping_points: z.array(z.number()).optional(),
  raw_1x_x: z.array(z.number()).optional(),
  raw_1x_y: z.array(z.number()).optional(),
  sample_count: z.number().optional(),
});

/** The spec an analysis returns, with how the new samples were merged into the saved one */
export const analysisSpec = analyzedSpec.extend({
  /** The new samples on their own, when they were blended into the saved spec */
  standalone_batch_spec: analyzedSpec.optional(),
  merge_strategy: z.enum(['accumulate', 'overwrite']).optional(),
  existing_sample_count: z.number().optional(),
  new_sample_count: z.number().optional(),
  total_sample_count: z.number().optional(),
});

export const analysisResult = z.looseObject({
  spec: analysisSpec,
  convergence: z.looseObject({ convergence_score: z.number().optional() }).nullish(),
  trials_count: z.number(),
  measured_rpm: z.number().nullish(),
  zoom: z.number().nullish(),
  fov: z.number().nullish(),
  preview_image: z.string().nullish(),
  preview_points: z.array(point).catch([]),
  preview_origin: point.catch([0, 0]),
  frame_width: z.number().catch(0),
  frame_height: z.number().catch(0),
  individual_trials: z.array(trialResult).catch([]),
  saved_to_disk: z.boolean().optional(),
});

export type TrialResult = z.infer<typeof trialResult>;
export type AnalysisSpec = z.infer<typeof analysisSpec>;
export type AnalysisResult = z.infer<typeof analysisResult>;

/** What the Studio keeps after an analysis */
export interface Session {
  weapon: string;
  mode: string;
  /** The spec saved before the analysis (what Compare measures against) */
  baseline: WeaponSpec;
  /** The spec the analysis measured, merged with the saved one when it accumulated */
  candidate: AnalysisSpec;
  /** The new samples on their own, when they were blended into the saved spec */
  batch?: z.infer<typeof analyzedSpec>;
  strategy: 'accumulate' | 'overwrite';
  /** Samples behind the candidate, the saved ones included when it accumulated */
  sampleCount: number;
  existingSamples?: number;
  newSamples: number;
  previewImage?: string;
  previewPoints: [number, number][];
  previewOrigin: [number, number];
  frameWidth: number;
  frameHeight: number;
  trials: TrialResult[];
  /** The optic's zoom the analysis ran with */
  zoom: number;
}

/** The parts of a session that say where its decals are */
export type DecalSource = Pick<Session, 'trials' | 'previewPoints' | 'previewOrigin'>;
