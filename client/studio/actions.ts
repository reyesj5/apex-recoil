import { toast } from 'sonner';
import {
  apiRequest,
  createQueryClient,
  queryKeys,
  savedSpec,
  submitAnalysis,
  watchJob,
  type CaptureSession,
  type Screenshot,
  type Upload,
} from '@/lib/api';
import { useEditorSettings } from '@/lib/storage/editor';
import { blobToDataUrl, dataUrlToBlob, newId } from './media';
import { analysisParams, applyAnalysis, type AnalysisChoice, type Setup } from './model/analysis';
import { mouseToPixelScale } from './model/calibration';
import { sortImports, sprayFileName, wallFor, type Sample } from './model/capture';
import { discrepancyReport } from './model/discrepancy';
import { analysisResult } from './model/session';
import { weaponName } from './names';
import {
  addSamples,
  addToBatch,
  markSaved,
  openDialog,
  replaceSamples,
  savedOf,
  selectedWeapon,
  selectWeapon,
  setAnalysis,
  setBackground,
  setJob,
  setMode,
  specOf,
  startSession,
  updateBatch,
  useStudio,
  type AnalysisKind,
  type BatchItem,
} from './store';

// What the Studio does with the server: saving a spec (after the checkpoint when its pattern changed),
// running an analysis and following its job, and bringing in saved sessions, library screenshots and
// files. Plain functions, so buttons and keys share them.

export const queryClient = createQueryClient();

const get = useStudio.getState;
const settings = () => useEditorSettings.getState();

export const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The capture setup as the analysis takes it */
export function currentSetup(): Setup {
  const s = settings();
  return { distance: s.captureDistance, zoom: Number(s.captureOptic), fov: s.captureFov, hdr: s.hdrMode };
}

/** Image pixels per mouse count at 1x for the reports, from the setup (or the session's optic) */
function reportScale() {
  const { session } = get();
  const setup = currentSetup();
  return mouseToPixelScale(
    session?.frameHeight || 1080,
    session?.zoom || setup.zoom,
    setup.fov,
    settings().scaleFactor,
  );
}

/** The selected weapon's spec against the saved one, as the checkpoint shows it */
export function currentReport() {
  const state = get();
  const name = selectedWeapon();
  const draft = specOf(state, name);
  if (!draft) return null;
  const zoom = state.session?.zoom || currentSetup().zoom;
  return discrepancyReport(savedOf(state, name) ?? draft, draft, zoom, reportScale());
}

/** Save (Ctrl S): straight away, or through the checkpoint when the pattern changed or came from an analysis */
export function requestSave() {
  const report = currentReport();
  if (!report) return;
  if (report.hasDifferences || get().session?.weapon === selectedWeapon()) openDialog({ kind: 'checkpoint', report });
  else void save();
}

export async function save() {
  const name = selectedWeapon();
  const draft = specOf(get(), name);
  if (!draft) return;
  const spec = { ...draft, sample_count: draft.sample_count || 1 };
  try {
    const saved = await apiRequest('/api/specs', savedSpec, { method: 'POST', body: { weapon: spec } });
    markSaved(spec);
    void queryClient.invalidateQueries({ queryKey: queryKeys.specs, exact: true });
    void queryClient.invalidateQueries({ queryKey: queryKeys.specHistory(name) });
    toast.success(saved.unchanged ? 'Nothing changed' : 'Spec saved', {
      description: `${weaponName(name)}, version ${saved.version}`,
    });
  } catch (err) {
    toast.error('The spec was not saved', { description: messageOf(err) });
  }
}

/** The files an analysis sends: each spray's clip with its wall, or the screenshots */
function uploadsFor(kind: AnalysisKind): Upload[] {
  const { samples, batch } = get();
  if (kind === 'static') {
    return batch.map((b, i) => ({
      field: 'images',
      blob: dataUrlToBlob(b.src),
      name: b.name || sprayFileName(i, true),
    }));
  }
  return samples.flatMap((s, i): Upload[] => [
    { field: 'videos', blob: s.clip, name: sprayFileName(i) },
    ...(s.wall ? [{ field: 'screenshots' as const, blob: dataUrlToBlob(s.wall), name: sprayFileName(i, true) }] : []),
  ]);
}

/** Follows a job until it completes (its result) or fails */
function followJob(id: string, kind: AnalysisKind, weapon: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    watchJob(id, (progress) => {
      setJob({ id, kind, weapon, progress });
      if (progress.status === 'completed') resolve(progress.result);
      else if (progress.status === 'failed' || progress.status === 'cancelled') {
        reject(new Error(progress.error ?? `The analysis was ${progress.status}.`));
      }
    });
  });
}

/**
 * Sends the Live tab's sprays (session) or the Screenshots tab's images (static) for analysis and,
 * once the job is done, opens its session: the weapon's spec takes the measured pattern, and the
 * canvas shows the first spray.
 */
export async function runAnalysis(kind: AnalysisKind, choice: AnalysisChoice) {
  if (selectedWeapon() !== choice.weapon) selectWeapon(choice.weapon);
  setMode(choice.mode);
  const setup = currentSetup();
  const params = analysisParams(choice, setup, specOf(get(), choice.weapon));
  const uploads = uploadsFor(kind);
  const sent = kind === 'static' ? get().batch.length : get().samples.length;
  if (kind === 'static') updateBatch((b) => ({ ...b, status: 'analyzing', shots: undefined, expected: undefined }));
  setAnalysis(kind, { state: 'sending' });
  try {
    const path = kind === 'session' ? '/api/discovery/process-session' : '/api/discovery/process-static-image';
    const accepted = await submitAnalysis(path, params, uploads);
    setAnalysis(kind, { state: 'running' });
    const parsed = analysisResult.safeParse(await followJob(accepted.job_id, kind, choice.weapon));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `The analysis sent back a result the Studio can't read (${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid'}).`,
      );
    }
    const state = get();
    const outcome = applyAnalysis(parsed.data, {
      choice,
      saved: savedOf(state, choice.weapon),
      draft: specOf(state, choice.weapon),
      sent,
      zoom: setup.zoom,
      pxPerCount: mouseToPixelScale(parsed.data.frame_height || 1080, setup.zoom, setup.fov, settings().scaleFactor),
    });
    // Without any shot found there is nothing to look at or save: the spec stays as it was
    if (outcome.shots > 0) startSession(outcome);
    if (kind === 'static') {
      const trials = outcome.session.trials;
      updateBatch((b, i): BatchItem => {
        const shots = trials[i]?.shots ?? (trials.length === 0 && i === 0 ? outcome.shots : undefined);
        return shots === undefined
          ? { ...b, status: 'ready' }
          : { ...b, status: 'done', shots, expected: outcome.expected };
      });
    }
    setAnalysis(kind, { state: 'done', outcome, weapon: choice.weapon, mode: choice.mode });
    // A saved capture shows up in the lists
    if (choice.saveCapture) void queryClient.invalidateQueries({ queryKey: ['captures'] });
  } catch (err) {
    if (kind === 'static') updateBatch((b) => (b.status === 'analyzing' ? { ...b, status: 'failed' } : b));
    setAnalysis(kind, { state: 'failed', error: messageOf(err) });
  } finally {
    setJob(null);
  }
}

async function fetchDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return blobToDataUrl(await response.blob());
}

/** Loads a saved session's sprays into the Live tab, on its weapon, with the first wall on the canvas */
export async function loadSavedSession(session: CaptureSession) {
  selectWeapon(session.weapon);
  if (session.mode) setMode(session.mode);
  const samples = await Promise.all(
    session.samples.map(async (item, i): Promise<Sample> => {
      const response = await fetch(item.videoUrl);
      const clip = response.ok ? await response.blob() : new Blob([], { type: 'video/webm' });
      const wall = item.screenshotUrl ? await fetchDataUrl(item.screenshotUrl).catch(() => undefined) : undefined;
      return {
        id: newId('sample'),
        name: `Spray #${i + 1} (${item.video || 'clip'})`,
        clip,
        url: URL.createObjectURL(clip),
        durationSec: 0,
        ...(wall ? { wall } : {}),
      };
    }),
  );
  replaceSamples(samples);
  const first = samples.find((s) => s.wall);
  if (first?.wall) setBackground({ key: first.id, name: first.name, src: first.wall, correct: true });
  return samples.length;
}

/** Adds screenshots from disk to the Screenshots tab; the first one shows when the canvas has none */
export async function addScreenshotFiles(files: File[], source = 'Disk') {
  const items = await Promise.all(
    files.map(async (file) => ({ id: newId('file'), name: file.name, src: await blobToDataUrl(file), source })),
  );
  const result = addToBatch(items);
  showFirstScreenshot();
  return result;
}

/** Adds a library screenshot to the Screenshots tab */
export async function addLibraryScreenshot(screenshot: Screenshot) {
  const { batch } = get();
  if (batch.some((b) => b.name === screenshot.filename || b.url === screenshot.url)) return { added: 0, duplicates: 1 };
  const src = await fetchDataUrl(screenshot.url);
  const result = addToBatch([
    { id: newId('lib'), name: screenshot.filename, src, source: 'Library', url: screenshot.url },
  ]);
  showFirstScreenshot();
  return result;
}

function showFirstScreenshot() {
  const { batch, background, session } = get();
  if (!background && !session && batch[0]) {
    setBackground({ key: `batch:${batch[0].id}`, name: batch[0].name, src: batch[0].src, correct: true });
  }
}

/**
 * Imports recorded clips (with wall screenshots of the same name) into the Live tab, or, when only
 * images are chosen, screenshots into the Screenshots tab
 */
export async function importFiles(files: File[]) {
  const { clips, images } = sortImports(files);
  if (clips.length === 0) {
    return { kind: 'screenshots' as const, ...(await addScreenshotFiles(images, 'Import')) };
  }
  const samples = get().samples;
  const added: Sample[] = [];
  let duplicates = 0;
  for (const clip of clips) {
    if ([...samples, ...added].some((s) => s.name.includes(clip.name))) {
      duplicates++;
      continue;
    }
    const wallName = wallFor(
      clip.name,
      images.map((i) => i.name),
    );
    const wallFile = images.find((i) => i.name === wallName);
    const wall = wallFile ? await blobToDataUrl(wallFile) : undefined;
    added.push({
      id: newId('imported'),
      name: `Spray #${samples.length + added.length + 1} (${clip.name})`,
      clip,
      url: URL.createObjectURL(clip),
      durationSec: 0,
      ...(wall ? { wall } : {}),
    });
  }
  addSamples(added);
  const last = added.at(-1);
  if (last?.wall) setBackground({ key: last.id, name: last.name, src: last.wall, correct: true });
  return { kind: 'clips' as const, added: added.length, duplicates };
}
