import { z } from 'zod';

// What the API accepts, as the server reads it (server/routes/). It is as lenient as it always was: a
// multipart form sends every field as text, a setting the server can't use falls back to its default,
// and a spec update needs only a name and a pattern, because the fields it leaves out keep their stored
// values. The browser sends stricter shapes (api.ts: saveSpecRequest, uploadPlanRequest, analysisParams).

// --- Specs ---

const pattern = z.array(z.number());

/** A spec as POST /api/specs takes it: the fields it has replace the stored spec's */
export const specUpdate = z
  .looseObject({
    /** The weapon's id, such as 'r301' */
    name: z.string().refine((name) => name.trim() !== ''),
    x: pattern,
    y: pattern,
    time_points: pattern,
  })
  .refine((spec) => spec.x.length === spec.y.length && spec.x.length === spec.time_points.length);

/** POST /api/specs with one spec, and what its version records */
export const saveSpecBody = z.object({
  weapon: specUpdate,
  author: z.string().optional().catch(undefined),
  notes: z.string().optional().catch(undefined),
  diff: z.unknown().optional(),
});

// --- Uploads and analysis ---

/** A field read from whatever was sent, or from nothing when it is missing */
const lenient = <T>(read: (value: unknown) => T) => z.unknown().optional().transform(read);

/** A weapon or a mode as a file name can hold it ('R-301 x' is 'R-301x'); empty when nothing usable was sent */
const tag = lenient((value) => (value == null ? '' : String(value).replace(/[^a-zA-Z0-9_-]/g, '')));

/** The mode, 'auto' unless one was sent */
const mode = tag.transform((value) => value || 'auto');

/** Yes or no: a boolean in JSON, 'true' or 'false' in a form; anything else counts as not sent */
const flag = lenient((value) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined,
);

/** A positive number: a number in JSON, text in a form; anything else counts as not sent */
const positive = lenient((value) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
});

const positiveOr = (fallback: number) => positive.transform((value) => value ?? fallback);

/** A list sent as JSON, or as JSON text in a form field; anything else is an empty list */
function jsonList<T extends z.ZodType>(item: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }, z.array(item).catch([]));
}

/** POST /api/discovery/uploads: the files the browser will put in storage, and how they are filed */
export const uploadPlanBody = z.object({
  purpose: z.enum(['session', 'static']).catch('session'),
  files: z
    .array(
      z
        .object({
          name: z.string().optional().catch(undefined),
          type: z.string().optional().catch(undefined),
          /** The form field it would have been posted under ('videos', 'screenshots' or 'images') */
          field: z.string().optional().catch(undefined),
          size: lenient(Number),
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
  weapon: tag,
  mode,
  /** Not sent: kept for a session, not for screenshots */
  save_capture: flag,
});

const hdrModes = ['auto', 'natural', 'vibrant', 'off', 'hdr-standard', 'hdr-vibrant'] as const;

/** The analysis settings, with the discovery CLI's defaults */
const analysisFields = {
  weapon: tag,
  mode,
  /** Not sent: kept for a session, not for screenshots */
  save_capture: flag,
  rpm: positive,
  shots: positive,
  zoom: positiveOr(1),
  fov: positiveOr(104),
  distance: positiveOr(20),
  multiplier: positiveOr(0.73),
  hdr: z.enum(hdrModes).catch('auto'),
  strategy: z.enum(['accumulate', 'overwrite']).catch('accumulate'),
  existing_samples: positive,
  /** Files the browser put in storage itself, with the token POST /api/discovery/uploads gave it */
  upload: z
    .object({ token: z.string().catch('') })
    .optional()
    .catch(undefined),
};

/** The analysis settings, and the HDR mode under its old name (hdr_mode) */
function analysisRequest<T extends z.ZodRawShape>(inputs: T) {
  return z.preprocess(
    (body) => {
      const fields = (body ?? {}) as Record<string, unknown>;
      return { ...fields, hdr: fields.hdr || fields.hdr_mode };
    },
    z.object({ ...analysisFields, ...inputs }),
  );
}

/** POST /api/discovery/process-session: clips (and their walls) as files, or as base64 JSON in old clients */
export const sessionRequest = analysisRequest({
  samples: jsonList(
    z.object({ data: z.string().catch(''), screenshot: z.string().optional().catch(undefined) }).catch({ data: '' }),
  ),
});

/** POST /api/discovery/process-static-image: screenshots as files, or as base64 JSON in old clients */
export const staticImageRequest = analysisRequest({
  images: jsonList(
    z.object({ name: z.string().optional().catch(undefined), data: z.string().catch('') }).catch({ data: '' }),
  ),
  image_data: z.string().optional().catch(undefined),
});

export type SpecUpdate = z.infer<typeof specUpdate>;
export type UploadPlanBody = z.infer<typeof uploadPlanBody>;
export type SessionRequest = z.infer<typeof sessionRequest>;
export type StaticImageRequest = z.infer<typeof staticImageRequest>;
/** The analysis settings both analysis requests have */
export type AnalysisSettings = Pick<
  SessionRequest,
  'rpm' | 'shots' | 'zoom' | 'fov' | 'distance' | 'multiplier' | 'hdr' | 'strategy' | 'existing_samples'
>;
