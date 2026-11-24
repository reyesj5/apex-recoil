import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/msw';
import { useJobEvents, watchJob, type JobProgress } from './job-events';

// A stand-in for the browser's EventSource (jsdom has none): the test sends the server's events
class FakeEventSource extends EventTarget {
  static last: FakeEventSource | undefined;
  readonly CLOSED = 2;
  readyState = 1;
  constructor(readonly url: string) {
    super();
    FakeEventSource.last = this;
  }
  send(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
  close() {
    this.readyState = this.CLOSED;
  }
}

const job = (status: string, extra: object = {}) => ({
  success: true,
  job: {
    id: 'job_1',
    type: 'session_video',
    status,
    progress: 0,
    stage: status,
    details: null,
    result: null,
    error: null,
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
    metadata: {},
    ...extra,
  },
});

describe('watchJob', () => {
  it('follows the event stream until the job completes', () => {
    const seen: JobProgress[] = [];
    watchJob('job_1', (state) => seen.push(state), {
      EventSource: FakeEventSource as unknown as typeof EventSource,
      pollMs: 60_000,
    });
    const source = FakeEventSource.last!;
    expect(source.url).toBe('/api/discovery/jobs/job_1/events');
    source.send('state', job('queued').job);
    source.send('progress', {
      status: 'running',
      stage: 'tracking',
      progress: 40,
      details: { clip_index: 1, total_clips: 3 },
    });
    source.send('complete', { status: 'completed', result: { spec: { name: 'r301' } } });
    source.send('progress', { status: 'running', progress: 50 });

    expect(seen.map((s) => [s.status, s.progress, s.stage])).toEqual([
      ['queued', 0, 'queued'],
      ['running', 40, 'tracking'],
      ['completed', 100, 'tracking'],
    ]);
    expect(seen[1].details).toEqual({ clip_index: 1, total_clips: 3 });
    expect(seen[2].result).toEqual({ spec: { name: 'r301' } });
    expect(source.readyState).toBe(source.CLOSED);
  });

  it('reports a failed or cancelled job with its reason', () => {
    const seen: JobProgress[] = [];
    watchJob('job_1', (state) => seen.push(state), {
      EventSource: FakeEventSource as unknown as typeof EventSource,
      pollMs: 60_000,
    });
    FakeEventSource.last!.send('failed', { status: 'cancelled', error: 'Job cancelled by user' });
    expect(seen.at(-1)).toMatchObject({ status: 'cancelled', error: 'Job cancelled by user' });
  });

  it('polls the job when there is no event stream', async () => {
    let polls = 0;
    server.use(
      http.get('/api/discovery/jobs/job_1', () => {
        polls++;
        return HttpResponse.json(
          polls < 2
            ? job('running', { progress: 30, stage: 'detecting' })
            : job('completed', { progress: 100, result: { ok: true } }),
        );
      }),
    );
    const seen: JobProgress[] = [];
    watchJob('job_1', (state) => seen.push(state), { EventSource: undefined, pollMs: 5 });
    await waitFor(() => expect(seen.at(-1)?.status).toBe('completed'));
    expect(seen.map((s) => s.status)).toEqual(['running', 'completed']);
    expect(seen.at(-1)?.result).toEqual({ ok: true });
  });

  it('gives up on a job the server no longer knows', async () => {
    server.use(
      http.get('/api/discovery/jobs/job_1', () =>
        HttpResponse.json({ success: false, error: 'Job not found' }, { status: 404 }),
      ),
    );
    const seen: JobProgress[] = [];
    watchJob('job_1', (state) => seen.push(state), { EventSource: undefined, pollMs: 5 });
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/no longer knows this job/) });
  });
});

describe('useJobEvents', () => {
  it('keeps a component up to date with the job', async () => {
    let polls = 0;
    server.use(
      http.get('/api/discovery/jobs/job_1', () => {
        polls++;
        return HttpResponse.json(polls < 2 ? job('running', { progress: 60 }) : job('completed'));
      }),
    );
    const { result, rerender } = renderHook(({ id }) => useJobEvents(id), {
      initialProps: { id: undefined as string | undefined },
    });
    expect(result.current).toBeUndefined();
    rerender({ id: 'job_1' });
    await waitFor(() => expect(result.current?.status).toBe('completed'), { timeout: 5000 });
  });
});
