import { z } from 'zod';

// What the API (server/routes/) sends, and what the browser sends it. The browser checks each response
// as it arrives, so a changed API fails in one place with a clear message instead of deep inside a
// component, and the server's routes are typed with the same shapes. Objects keep fields that aren't
// listed here (looseObject), so a spec saved back loses nothing. What the server accepts is looser
// (requests.ts): a form sends every field as text, and a spec update needs only a name and a pattern.

// --- Specs ---

export const magazine = z.looseObject({
  size: z.number().int().positive(),
  /** The sound set, such as 'r99_0' */
  audio: z.string(),
});

/** What an attachment changes, such as the Rampage's revved_up */
export const weaponMod = z.looseObject({
  mags: z.array(magazine).optional(),
  time_points: z.array(z.number()).optional(),
  ping_points: z.array(z.number()).optional(),
});

export const weaponSpec = z
  .looseObject({
    /** The weapon's id, such as 'r301' */
    name: z.string().min(1),
    rpm: z.number().positive(),
    multiplier: z.number().optional(),
    mags: z.array(magazine),
    mods: z.record(z.string(), weaponMod),
    /** The pattern: one point per shot, with the time it's fired in milliseconds */
    x: z.array(z.number()),
    y: z.array(z.number()),
    time_points: z.array(z.number()),
    ping_points: z.array(z.number()).optional(),
    /** The pattern in mouse counts at 1x, before the multiplier, as the analysis measured it */
    raw_1x_x: z.array(z.number()).optional(),
    raw_1x_y: z.array(z.number()).optional(),
    /** How many sprays the pattern is the median of */
    sample_count: z.number().optional(),
  })
  .refine((spec) => spec.x.length === spec.y.length && spec.x.length === spec.time_points.length, {
    message: 'x, y and time_points must have the same length',
  });

export const specList = z.array(weaponSpec);

export const specHistoryEntry = z.looseObject({
  id: z.number(),
  version: z.number(),
  rpm: z.number(),
  multiplier: z.number(),
  sample_count: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
  author: z.string().nullable(),
  notes: z.string().nullable(),
  diff: z.unknown(),
});

export const specHistory = z.looseObject({
  success: z.literal(true),
  weapon: z.string(),
  history: z.array(specHistoryEntry),
});

export const saveSpecRequest = z.object({
  weapon: weaponSpec,
  author: z.string().optional(),
  notes: z.string().optional(),
  diff: z.record(z.string(), z.unknown()).optional(),
});

export const savedSpec = z.looseObject({
  success: z.literal(true),
  message: z.string(),
  version: z.number(),
  weapon: z.string(),
  /** Nothing changed, so no new version was made */
  unchanged: z.boolean(),
});

// --- Captures ---

export const captureSample = z.looseObject({
  video: z.string(),
  videoUrl: z.string(),
  screenshot: z.string().nullable(),
  screenshotUrl: z.string().nullable(),
});

export const captureSession = z.looseObject({
  id: z.string(),
  weapon: z.string(),
  mode: z.string(),
  timestamp: z.number(),
  date: z.string(),
  samplesCount: z.number(),
  samples: z.array(captureSample),
  label: z.string(),
  // From the analysis, once one has run
  shot_count: z.number().nullish(),
  measured_rpm: z.number().nullish(),
  convergence_score: z.number().nullish(),
});

export const sessionList = z.looseObject({ success: z.literal(true), sessions: z.array(captureSession) });

export const screenshot = z.looseObject({
  filename: z.string(),
  url: z.string(),
  timestamp: z.number(),
  date: z.string(),
  sizeBytes: z.number(),
  /** 'library', or the id of the session it belongs to */
  source: z.string(),
});

export const screenshotList = z.looseObject({ success: z.literal(true), screenshots: z.array(screenshot) });

// --- Uploads and analysis ---

export const uploadPlanRequest = z.object({
  purpose: z.enum(['session', 'static']),
  files: z.array(z.object({ name: z.string(), size: z.number(), type: z.string(), field: z.string().optional() })),
  weapon: z.string(),
  mode: z.string().optional(),
  save_capture: z.boolean().optional(),
});

/** Direct uploads go to object storage with presigned URLs; with local storage, files go with the request */
export const uploadPlan = z.discriminatedUnion('direct', [
  z.looseObject({ success: z.literal(true), direct: z.literal(false) }),
  z.looseObject({
    success: z.literal(true),
    direct: z.literal(true),
    prefix: z.string(),
    /** Sent back with the analysis request */
    token: z.string(),
    files: z.array(
      z.object({ name: z.string(), url: z.string(), method: z.string(), headers: z.record(z.string(), z.string()) }),
    ),
  }),
]);

/** The analysis settings, as the API names them */
export const analysisParams = z.object({
  weapon: z.string().regex(/^[\w-]+$/),
  mode: z
    .string()
    .regex(/^[\w-]+$/)
    .optional(),
  save_capture: z.boolean().optional(),
  rpm: z.number().positive().optional(),
  shots: z.number().int().positive().optional(),
  zoom: z.number().positive().optional(),
  fov: z.number().positive().optional(),
  distance: z.number().positive().optional(),
  multiplier: z.number().positive().optional(),
  hdr: z.enum(['auto', 'natural', 'vibrant', 'off', 'hdr-standard', 'hdr-vibrant']).optional(),
  strategy: z.enum(['accumulate', 'overwrite']).optional(),
  existing_samples: z.number().int().nonnegative().optional(),
});

export const jobAccepted = z.looseObject({
  success: z.literal(true),
  job_id: z.string(),
  status: z.literal('queued'),
  events_url: z.string(),
  status_url: z.string(),
});

// --- Jobs ---

export const jobStatus = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']);

export const jobDetails = z.looseObject({
  clip_index: z.number().optional(),
  total_clips: z.number().optional(),
  image_index: z.number().optional(),
  total_images: z.number().optional(),
});

export const job = z.looseObject({
  id: z.string(),
  type: z.string().nullable(),
  status: jobStatus,
  progress: z.number(),
  stage: z.string(),
  details: jobDetails.nullable(),
  /** The analysis result; Phase 3 gives it a schema */
  result: z.unknown(),
  error: z.string().nullable(),
  createdAt: z.number().nullable(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});

export const jobResponse = z.looseObject({ success: z.literal(true), job });

export const cancelledJob = z.looseObject({ success: z.literal(true), message: z.string() });

/** Where the server keeps captures, and how it runs analyses */
export const discoveryStatus = z.looseObject({
  success: z.literal(true),
  storage: z.enum(['local', 's3']),
  queue: z.enum(['memory', 'redis']),
});

export type Magazine = z.infer<typeof magazine>;
export type WeaponSpec = z.infer<typeof weaponSpec>;
export type SpecHistoryEntry = z.infer<typeof specHistoryEntry>;
export type SaveSpecRequest = z.infer<typeof saveSpecRequest>;
export type SavedSpec = z.infer<typeof savedSpec>;
export type CaptureSession = z.infer<typeof captureSession>;
export type Screenshot = z.infer<typeof screenshot>;
export type UploadPlanRequest = z.infer<typeof uploadPlanRequest>;
export type UploadPlan = z.infer<typeof uploadPlan>;
export type AnalysisParams = z.infer<typeof analysisParams>;
export type JobAccepted = z.infer<typeof jobAccepted>;
export type JobStatus = z.infer<typeof jobStatus>;
export type JobDetails = z.infer<typeof jobDetails>;
export type Job = z.infer<typeof job>;
export type DiscoveryStatus = z.infer<typeof discoveryStatus>;
