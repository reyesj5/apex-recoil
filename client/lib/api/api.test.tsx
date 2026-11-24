import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import specs from '../../specs.json';
import { server } from '../../test/msw';
import { ApiError, apiRequest } from './client';
import { submitAnalysis } from './analysis';
import { useSaveSpec, useSessions, useSpecHistory, useSpecs } from './queries';
import { specList, weaponSpec } from './schemas';

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/**
 * Answers multipart posts here and keeps their forms; everything else goes on to MSW, which can't read
 * jsdom's FormData under Node (its handler lookup fails and the request reaches the network).
 */
function captureMultipart(answer: () => Response) {
  const forms: FormData[] = [];
  const next = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (!(init?.body instanceof FormData)) return next(input, init);
    forms.push(init.body);
    return Promise.resolve(answer());
  });
  return forms;
}

const accepted = (id: string) =>
  HttpResponse.json(
    {
      success: true,
      job_id: id,
      status: 'queued',
      events_url: `/api/discovery/jobs/${id}/events`,
      status_url: `/api/discovery/jobs/${id}`,
    },
    { status: 202 },
  );

describe('schemas', () => {
  it('accept every weapon in client/specs.json', () => {
    expect(specList.safeParse(specs).success).toBe(true);
  });

  it('keep the fields they do not list, so a saved spec loses nothing', () => {
    const havoc = specs.find((spec) => spec.name === 'havoc_tc')!;
    expect(weaponSpec.parse(havoc)).toHaveProperty('raw_1x_x');
  });

  it('reject a pattern whose lists differ in length', () => {
    const [first] = specs;
    expect(weaponSpec.safeParse({ ...first, y: first.y.slice(1) }).success).toBe(false);
  });
});

describe('apiRequest', () => {
  it('reports the API’s own error message', async () => {
    server.use(
      http.get('/api/discovery/jobs/job_x', () =>
        HttpResponse.json({ success: false, error: 'Job not found' }, { status: 404 }),
      ),
    );
    const failure = apiRequest('/api/discovery/jobs/job_x', specList);
    await expect(failure).rejects.toThrow(new ApiError('Job not found', 404));
  });

  it('fails clearly when an answer has an unexpected shape', async () => {
    server.use(http.get('/api/specs', () => HttpResponse.json({ specs: [] })));
    await expect(apiRequest('/api/specs', specList)).rejects.toThrow(/^Unexpected answer from \/api\/specs/);
  });
});

describe('query hooks', () => {
  it('load the specs', async () => {
    server.use(http.get('/api/specs', () => HttpResponse.json(specs.slice(0, 2))));
    const { result } = renderHook(() => useSpecs(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((spec) => spec.name)).toEqual([specs[0].name, specs[1].name]);
  });

  it('load a weapon’s history, and only once there is a weapon', async () => {
    let requests = 0;
    server.use(
      http.get('/api/specs/history/:weapon', ({ params }) => {
        requests++;
        return HttpResponse.json({
          success: true,
          weapon: params.weapon,
          history: [
            {
              id: 2,
              version: 1,
              rpm: 810,
              multiplier: 0.73,
              sample_count: 1,
              is_active: true,
              created_at: '2026-10-23T07:55:59.272Z',
              author: 'system_seed',
              notes: 'Initial seed from client/specs.json',
              diff: {},
            },
          ],
        });
      }),
    );
    const { result, rerender } = renderHook(({ weapon }) => useSpecHistory(weapon), {
      wrapper: wrapper(),
      initialProps: { weapon: undefined as string | undefined },
    });
    expect(result.current.fetchStatus).toBe('idle');
    rerender({ weapon: 'r301' });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0]).toMatchObject({ version: 1, author: 'system_seed' });
    expect(requests).toBe(1);
  });

  it('save a spec and load the specs again', async () => {
    let loads = 0;
    let saved: unknown;
    server.use(
      http.get('/api/specs', () => {
        loads++;
        return HttpResponse.json(specs.slice(0, 1));
      }),
      http.post('/api/specs', async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json({
          success: true,
          message: 'Weapon spec saved and versioned successfully in SQLite',
          version: 2,
          weapon: specs[0].name,
          unchanged: false,
        });
      }),
    );
    const { result } = renderHook(() => ({ specs: useSpecs(), save: useSaveSpec() }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.specs.isSuccess).toBe(true));
    const answer = await result.current.save.mutateAsync({
      weapon: weaponSpec.parse(specs[0]),
      notes: 'Tuned the first shots',
    });
    expect(answer).toMatchObject({ version: 2, unchanged: false });
    expect(saved).toMatchObject({ weapon: { name: specs[0].name }, notes: 'Tuned the first shots' });
    await waitFor(() => expect(loads).toBe(2));
  });

  it('list saved sessions', async () => {
    server.use(
      http.get('/api/discovery/sessions', () =>
        HttpResponse.json({
          success: true,
          sessions: [
            {
              id: 'session_r301_auto_1761200000000',
              weapon: 'r301',
              mode: 'auto',
              timestamp: 1761200000000,
              date: '2025-10-23 08:13',
              samplesCount: 1,
              samples: [
                {
                  video: 'spray_01.webm',
                  videoUrl: '/captures/session_r301_auto_1761200000000/spray_01.webm',
                  screenshot: null,
                  screenshotUrl: null,
                },
              ],
              label: 'R301 (AUTO) • 1 spray(s) • 2025-10-23 08:13',
              shot_count: 28,
            },
          ],
        }),
      ),
    );
    const { result } = renderHook(() => useSessions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0]).toMatchObject({ weapon: 'r301', shot_count: 28 });
  });
});

describe('submitAnalysis', () => {
  const clip = { field: 'videos', blob: new Blob(['clip'], { type: 'video/webm' }), name: 'spray_01.webm' } as const;
  const wall = {
    field: 'screenshots',
    blob: new Blob(['wall'], { type: 'image/jpeg' }),
    name: 'spray_01_wall.jpg',
  } as const;

  it('posts the files with the request when the server stores them itself', async () => {
    server.use(http.post('/api/discovery/uploads', () => HttpResponse.json({ success: true, direct: false })));
    const forms = captureMultipart(() => accepted('job_1'));
    const job = await submitAnalysis(
      '/api/discovery/process-session',
      { weapon: 'r301', mode: 'auto', save_capture: true, distance: 20 },
      [clip, wall],
    );
    expect(job.job_id).toBe('job_1');
    expect(forms).toHaveLength(1);
    const [form] = forms;
    expect(form.get('weapon')).toBe('r301');
    expect(form.get('save_capture')).toBe('true');
    expect(form.get('distance')).toBe('20');
    expect((form.get('videos') as File).name).toBe('spray_01.webm');
    expect((form.get('screenshots') as File).name).toBe('spray_01_wall.jpg');
  });

  it('uploads straight to storage and sends only the token', async () => {
    const stored: string[] = [];
    let body: unknown;
    server.use(
      http.post('/api/discovery/uploads', () =>
        HttpResponse.json({
          success: true,
          direct: true,
          prefix: 'tmp/abc/',
          token: 'signed-grant',
          files: [
            {
              name: 'spray_01_wall.jpg',
              url: 'https://bucket.example/tmp/abc/spray_01_wall.jpg',
              method: 'PUT',
              headers: { 'Content-Type': 'image/jpeg' },
            },
          ],
        }),
      ),
      http.put('https://bucket.example/tmp/abc/:name', async ({ params, request }) => {
        stored.push(`${String(params.name)}: ${await request.text()}`);
        return new HttpResponse(null, { status: 200 });
      }),
      http.post('/api/discovery/process-static-image', async ({ request }) => {
        body = await request.json();
        return accepted('job_2');
      }),
    );
    const job = await submitAnalysis('/api/discovery/process-static-image', { weapon: 'r301' }, [
      { ...wall, field: 'images' },
    ]);
    expect(job.job_id).toBe('job_2');
    expect(stored).toEqual(['spray_01_wall.jpg: wall']);
    expect(body).toEqual({ weapon: 'r301', upload: { token: 'signed-grant' } });
  });

  it('falls back to posting the files when the direct upload fails', async () => {
    server.use(
      http.post('/api/discovery/uploads', () =>
        HttpResponse.json({
          success: true,
          direct: true,
          prefix: 'tmp/abc/',
          token: 'signed-grant',
          files: [
            { name: 'spray_01.webm', url: 'https://bucket.example/tmp/abc/spray_01.webm', method: 'PUT', headers: {} },
          ],
        }),
      ),
      http.put('https://bucket.example/tmp/abc/:name', () => new HttpResponse(null, { status: 403 })),
    );
    const forms = captureMultipart(() => accepted('job_3'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const job = await submitAnalysis('/api/discovery/process-session', { weapon: 'r301' }, [clip]);
    expect(job.job_id).toBe('job_3');
    expect(warn).toHaveBeenCalledOnce();
    expect((forms[0].get('videos') as File).name).toBe('spray_01.webm');
  });

  it('refuses a weapon name the server would rewrite', async () => {
    await expect(
      submitAnalysis('/api/discovery/process-session', { weapon: 'r-301 (gold)' }, [clip]),
    ).rejects.toThrow();
  });
});
