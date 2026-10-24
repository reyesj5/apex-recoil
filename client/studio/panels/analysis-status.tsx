import { SaveIcon, ScaleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { JobProgress } from '@/lib/api';
import { requestSave } from '../actions';
import { StatusBadge } from '../canvas/overlays';
import { Notice } from '../fields';
import { describeIntegration } from '../model/analysis';
import { fireModeName, plural, weaponName } from '../names';
import { setComparing, useStudio, type AnalysisKind } from '../store';

// An analysis' progress and outcome, under the button that started it: the job's stage while it
// runs, then what it measured and how it compares with the saved spec, with Save and Compare.

/** The job's stage in words: "Processing clip 1 of 2", "Aggregating" */
export function describeProgress(progress: JobProgress) {
  const stage = progress.stage.replace(/_/g, ' ');
  const words = stage.charAt(0).toUpperCase() + stage.slice(1);
  const d = progress.details;
  // The pipeline names a file's stage with its count (processing_clip_1_of_2): the details repeat it
  if (/ \d+ of \d+$/.test(stage)) return words;
  if (d?.clip_index && d.total_clips) return `${words}, clip ${d.clip_index} of ${d.total_clips}`;
  if (d?.image_index && d.total_images) return `${words}, image ${d.image_index} of ${d.total_images}`;
  return words;
}

export function AnalysisStatus({ kind }: { kind: AnalysisKind }) {
  const record = useStudio((s) => s.analyses[kind]);
  const job = useStudio((s) => (s.job?.kind === kind ? s.job : null));
  if (!record) return null;

  if (record.state === 'sending') return <Notice>Sending the files…</Notice>;
  if (record.state === 'running') {
    const progress = job?.progress;
    const pct = Math.round(progress?.progress ?? 0);
    return (
      <Notice>
        <span className="flex items-center justify-between gap-2">
          <span>{progress ? describeProgress(progress) : 'Queued'}</span>
          <span className="font-mono text-text">{pct}%</span>
        </span>
        <Progress value={pct} aria-label="Analysis progress" className="mt-2" />
      </Notice>
    );
  }
  if (record.state === 'failed') {
    return (
      <Notice tone="danger">
        <strong className="block">The analysis failed</strong>
        {record.error}
      </Notice>
    );
  }

  const { outcome, weapon, mode } = record;
  const { report, session } = outcome;
  const short = outcome.shortTrials.length;
  const found = outcome.shots > 0;
  return (
    <Notice tone={!found || short > 0 || report.status === 'danger' ? 'warning' : 'positive'}>
      <strong className="block text-13">Analysis complete</strong>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-secondary">Weapon</dt>
        <dd className="m-0">
          {weaponName(weapon)} ({fireModeName(mode)})
        </dd>
        <dt className="text-text-secondary">{kind === 'session' ? 'Sprays' : 'Screenshots'}</dt>
        <dd className="m-0">{outcome.trials} analyzed</dd>
        <dt className="text-text-secondary">Shots</dt>
        <dd className="m-0">
          {outcome.shots} found
          {outcome.expected > 0 && ` (a full magazine has ${outcome.expected})`}
        </dd>
        {/* Screenshots can't measure a fire rate: the server reports the one it was sent */}
        {kind === 'session' && outcome.measuredRpm !== undefined && (
          <>
            <dt className="text-text-secondary">Fire rate</dt>
            <dd className="m-0">{Math.round(outcome.measuredRpm * 10) / 10} RPM measured</dd>
          </>
        )}
        {outcome.convergence !== undefined && (
          <>
            <dt className="text-text-secondary">Convergence</dt>
            <dd className="m-0">{outcome.convergence} / 100</dd>
          </>
        )}
        <dt className="text-text-secondary">Spec</dt>
        <dd className="m-0">{describeIntegration(session)}</dd>
        <dt className="text-text-secondary">Files</dt>
        <dd className="m-0">{outcome.savedToDisk ? 'Kept in the captures' : 'Analyzed without keeping them'}</dd>
      </dl>
      {!found && (
        <p className="m-0 mt-2 text-text">
          No shots were found, so the spec stays as it was. Check the setup (distance, optic) and the screenshots.
        </p>
      )}
      {found && (
        <>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={report.status} />
            <span className="text-text-secondary">
              {report.meanPx.toFixed(1)} px average stray
              {!report.shotCountMatches && `, ${plural(Math.abs(report.shotCountDelta), 'shot')} off`}
            </span>
          </div>
          {short > 0 && (
            <p className="m-0 mt-2 text-text">
              {plural(short, 'spray')} found fewer shots than a full magazine. Use Correct shots (C) on the canvas to
              add the missing ones.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={requestSave}>
              <SaveIcon aria-hidden="true" />
              Save spec
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setComparing(true)}>
              <ScaleIcon aria-hidden="true" />
              Compare
            </Button>
          </div>
        </>
      )}
    </Notice>
  );
}
