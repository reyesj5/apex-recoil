import { useEffect, useState } from 'react';
import { jobDetails, jobResponse, jobStatus, type Job } from './schemas';

// Follows an analysis job as it runs. The server streams its progress as Server-Sent Events (state,
// progress, complete, failed); the job is also polled, which covers a dropped stream and browsers or
// proxies without one. Jobs live in the server's memory unless it runs the Redis queue, so a job the
// server no longer knows (404) has failed.

export type JobProgress = Pick<Job, 'status' | 'progress' | 'stage' | 'details' | 'result' | 'error'>;

const finished = (status: JobProgress['status']) =>
  status === 'completed' || status === 'failed' || status === 'cancelled';

const lost = 'The server no longer knows this job (was it restarted?). Run the analysis again.';

function pick(data: Record<string, unknown>): Partial<JobProgress> {
  const update: Partial<JobProgress> = {};
  const status = jobStatus.safeParse(data.status);
  if (status.success) update.status = status.data;
  if (typeof data.progress === 'number') update.progress = data.progress;
  if (typeof data.stage === 'string') update.stage = data.stage;
  const details = jobDetails.nullable().safeParse(data.details);
  if (details.success && data.details !== undefined) update.details = details.data;
  if ('result' in data) update.result = data.result;
  if (typeof data.error === 'string') update.error = data.error;
  return update;
}

function parse(event: Event): Record<string, unknown> {
  try {
    const data: unknown = JSON.parse((event as MessageEvent<string>).data);
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Calls `onChange` with the job's state until it completes, fails or is cancelled. Returns a function
 * that stops following it.
 */
export function watchJob(
  id: string,
  onChange: (job: JobProgress) => void,
  {
    EventSource: Source = globalThis.EventSource,
    pollMs,
  }: { EventSource?: typeof globalThis.EventSource; pollMs?: number } = {},
) {
  let job: JobProgress = { status: 'queued', progress: 0, stage: 'queued', details: null, result: null, error: null };
  let stopped = false;
  const path = `/api/discovery/jobs/${encodeURIComponent(id)}`;

  const source = Source ? new Source(`${path}/events`) : undefined;
  const timer = setInterval(() => void poll(), pollMs ?? (source ? 2500 : 1000));

  function stop() {
    stopped = true;
    clearInterval(timer);
    source?.close();
  }

  function update(change: Partial<JobProgress>) {
    if (stopped) return;
    job = { ...job, ...change };
    if (job.status === 'completed') job.progress = 100;
    if ((job.status === 'failed' || job.status === 'cancelled') && !job.error) job.error = `Job ${job.status}`;
    onChange(job);
    if (finished(job.status)) stop();
  }

  async function poll() {
    try {
      const response = await fetch(path);
      if (response.status === 404) return update({ status: 'failed', error: lost });
      if (!response.ok) return;
      const data = jobResponse.safeParse(await response.json());
      if (data.success) update(pick(data.data.job));
    } catch {
      // the next poll tries again
    }
  }

  if (source) {
    source.addEventListener('state', (event) => update(pick(parse(event))));
    source.addEventListener('progress', (event) => update(pick(parse(event))));
    source.addEventListener('complete', (event) => update({ ...pick(parse(event)), status: 'completed' }));
    source.addEventListener('failed', (event) => {
      const data = pick(parse(event));
      update({ ...data, status: data.status ?? 'failed' });
    });
    // The browser reconnects by itself; once it gives up, polling carries on
    source.addEventListener('error', () => {
      if (source.readyState === source.CLOSED) source.close();
    });
  }
  return stop;
}

/** The state of a running job, kept up to date; undefined until the first news of it */
export function useJobEvents(id: string | undefined): JobProgress | undefined {
  const [latest, setLatest] = useState<{ id: string; job: JobProgress }>();
  useEffect(() => {
    if (!id) return;
    return watchJob(id, (job) => setLatest({ id, job }));
  }, [id]);
  return id && latest?.id === id ? latest.job : undefined;
}
