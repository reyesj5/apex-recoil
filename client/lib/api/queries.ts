import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { submitAnalysis, type Upload } from './analysis';
import { apiRequest } from './client';
import {
  cancelledJob,
  discoveryStatus,
  jobResponse,
  savedSpec,
  screenshotList,
  sessionList,
  specHistory,
  specList,
  type AnalysisParams,
  type SaveSpecRequest,
} from './schemas';

// TanStack Query hooks for the API: specs and their history, saved capture sessions and screenshots,
// analysis jobs. A mutation refreshes the queries it changes.

export const queryKeys = {
  specs: ['specs'] as const,
  specHistory: (weapon: string) => ['specs', weapon, 'history'] as const,
  sessions: ['captures', 'sessions'] as const,
  screenshots: ['captures', 'screenshots'] as const,
  job: (id: string) => ['jobs', id] as const,
  status: ['discovery', 'status'] as const,
};

/** The app's query client: data counts as fresh for 30 s, and failed reads are tried once more */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
  });
}

/** Every weapon's spec, as the trainer and the Studio load them */
export function useSpecs() {
  return useQuery({ queryKey: queryKeys.specs, queryFn: () => apiRequest('/api/specs', specList) });
}

/** A weapon's saved versions, newest first */
export function useSpecHistory(weapon: string | undefined) {
  return useQuery({
    queryKey: queryKeys.specHistory(weapon ?? ''),
    queryFn: () => apiRequest(`/api/specs/history/${encodeURIComponent(weapon!)}`, specHistory),
    select: (data) => data.history,
    enabled: Boolean(weapon),
  });
}

/** Saves one weapon's spec as a new version (none when nothing changed) */
export function useSaveSpec() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SaveSpecRequest) => apiRequest('/api/specs', savedSpec, { method: 'POST', body: request }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.specs, exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.specHistory(saved.weapon) });
    },
  });
}

/** Saved capture sessions, newest first */
export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => apiRequest('/api/discovery/sessions', sessionList),
    select: (data) => data.sessions,
  });
}

/** Wall screenshots: the library and the ones saved with sessions, newest first */
export function useScreenshots() {
  return useQuery({
    queryKey: queryKeys.screenshots,
    queryFn: () => apiRequest('/api/discovery/screenshots', screenshotList),
    select: (data) => data.screenshots,
  });
}

function useAnalysis(path: Parameters<typeof submitAnalysis>[0]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ params, uploads }: { params: AnalysisParams; uploads: Upload[] }) =>
      submitAnalysis(path, params, uploads),
    // A saved capture shows up in the lists once its files are filed
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['captures'] }),
  });
}

/** Starts the analysis of recorded clips (with their wall screenshots); answers with the queued job */
export function useAnalyzeSession() {
  return useAnalysis('/api/discovery/process-session');
}

/** Starts the analysis of wall screenshots; answers with the queued job */
export function useAnalyzeScreenshots() {
  return useAnalysis('/api/discovery/process-static-image');
}

/** A job's state, read once; useJobEvents follows a running job */
export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.job(id ?? ''),
    queryFn: () => apiRequest(`/api/discovery/jobs/${encodeURIComponent(id!)}`, jobResponse),
    select: (data) => data.job,
    enabled: Boolean(id),
  });
}

/** Where the server keeps captures and how it runs analyses (the Studio's status bar) */
export function useDiscoveryStatus() {
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: () => apiRequest('/api/discovery/status', discoveryStatus),
    staleTime: Infinity,
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/discovery/jobs/${encodeURIComponent(id)}/cancel`, cancelledJob, { method: 'POST' }),
    onSuccess: (_cancelled, id) => void queryClient.invalidateQueries({ queryKey: queryKeys.job(id) }),
  });
}
