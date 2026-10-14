import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { ApiError } from '../../lib/api';
import type { Paginated } from '../../lib/types';
import type {
  IncidentCreated,
  IncidentDetail,
  IncidentFilters,
  HistoryItem,
  IncidentListItem,
  IncidentStats,
  NearbyItem,
  ReportPayload,
  TrackEditPayload,
  TrackNotification,
  TrackView,
} from './types';

export const incidentKeys = {
  all: ['incidents'] as const,
  list: (filters: IncidentFilters) => ['incidents', 'list', filters] as const,
  detail: (id: number) => ['incidents', 'detail', id] as const,
  track: (ref: string, phone: string) => ['incidents', 'track', ref, phone] as const,
  trackNotes: (ref: string, phone: string) => ['incidents', 'track-notifications', ref, phone] as const,
  history: (id: number) => ['incidents', 'history', id] as const,
  nearby: (id: number) => ['incidents', 'nearby', id] as const,
  stats: ['incidents', 'stats'] as const,
};

/** Turn any error into a sentence a person can understand */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Could not reach the server. Check your internet connection and try again.';
    if (err.code === 'VALIDATION_ERROR') {
      const list = (err.details as { errors?: { field: string; message: string }[] }).errors;
      if (list && list.length > 0) return list.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join('. ');
    }
    if (err.code === 'INVALID_TRANSITION') return 'This report was just updated by someone else. The page has been refreshed.';
    if (err.code === 'REMARK_REQUIRED') return 'Please write a short reason (at least 5 characters).';
    if (err.code === 'REPORT_NOT_EDITABLE') return 'This report has already been reviewed, so it can no longer be edited. If something urgent changed, call 112.';
    if (err.code === 'FORBIDDEN') return 'You do not have permission to do that.';
    if (err.code === 'INTERNAL_ERROR') return 'Something went wrong on our side. Please try again in a moment.';
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

// ─────────────────────────── Citizen (public) ───────────────────────────

/** SD <<create>>: POST /api/incidents as multipart (data = JSON string, photos = files) */
export function useCreateIncident() {
  return useMutation({
    mutationFn: async ({ payload, photos }: { payload: ReportPayload; photos: File[] }) => {
      const form = new FormData();
      form.append('data', JSON.stringify(payload));
      photos.forEach((file) => form.append('photos', file));
      const res = await api.post<IncidentCreated>('/api/incidents', form);
      return res.data;
    },
  });
}

export async function fetchTrack(ref: string, phone: string): Promise<TrackView> {
  const res = await api.get<TrackView>(`/api/incidents/track/${encodeURIComponent(ref)}`, { params: { phone } });
  return res.data;
}

export function useTrack(ref: string, phone: string, enabled: boolean) {
  return useQuery({
    queryKey: incidentKeys.track(ref, phone),
    queryFn: () => fetchTrack(ref, phone),
    enabled,
    retry: false, // a 404 means "wrong ref/phone": no point retrying
    refetchInterval: 15_000, // keeps the status fresh while the page is open
  });
}

// ─────────────────────────── Coordinator ───────────────────────────

export function useIncidents(filters: IncidentFilters, refetchInterval?: number) {
  return useQuery({
    queryKey: incidentKeys.list(filters),
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = { page: filters.page, page_size: filters.page_size };
      if (filters.status) params.status = filters.status;
      if (filters.severity) params.severity = filters.severity;
      if (filters.incident_type) params.incident_type = filters.incident_type;
      if (filters.q.trim()) params.q = filters.q.trim();
      if (filters.possible_duplicate) params.possible_duplicate = true;
      const res = await api.get<Paginated<IncidentListItem>>('/api/incidents', { params });
      return res.data;
    },
    refetchInterval,
    placeholderData: keepPreviousData, // keep old rows on screen while the next page loads
  });
}

export function useIncident(id: number) {
  return useQuery({
    queryKey: incidentKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<IncidentDetail>(`/api/incidents/${id}`);
      return res.data;
    },
    enabled: Number.isFinite(id),
    retry: false,
  });
}

/** Shared by verify / reject / close: all return the updated IncidentDetail */
function useIncidentAction<TVars>(id: number, call: (vars: TVars) => Promise<IncidentDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (updated) => {
      qc.setQueryData(incidentKeys.detail(id), updated);
      void qc.invalidateQueries({ queryKey: ['incidents', 'list'] });
      void qc.invalidateQueries({ queryKey: incidentKeys.history(id) });
      void qc.invalidateQueries({ queryKey: incidentKeys.stats });
    },
    onError: () => {
      // e.g. 409 INVALID_TRANSITION: someone else changed it, so reload the truth
      void qc.invalidateQueries({ queryKey: incidentKeys.detail(id) });
    },
  });
}

/** SD msg 6 */
export function useVerify(id: number) {
  return useIncidentAction<void>(id, async () => (await api.post<IncidentDetail>(`/api/incidents/${id}/verify`)).data);
}

/** SD msg 8 (remark is mandatory) */
export function useReject(id: number) {
  return useIncidentAction<string>(
    id,
    async (remark) => (await api.post<IncidentDetail>(`/api/incidents/${id}/reject`, { remark })).data,
  );
}

export function useClose(id: number) {
  return useIncidentAction<void>(id, async () => (await api.post<IncidentDetail>(`/api/incidents/${id}/close`, {})).data);
}

// ─────────────────────────── A10/A11 additions ───────────────────────────

/** Messages the citizen has been sent about this report */
export function useTrackNotifications(ref: string, phone: string, enabled: boolean) {
  return useQuery({
    queryKey: incidentKeys.trackNotes(ref, phone),
    queryFn: async () =>
      (await api.get<TrackNotification[]>(`/api/incidents/track/${encodeURIComponent(ref)}/notifications`, { params: { phone } })).data,
    enabled,
    retry: false,
    refetchInterval: 15_000,
  });
}

/** SD opt [citizen subscribed]: turn status updates on or off */
export function useSubscription(ref: string, phone: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subscribed: boolean) =>
      (await api.post<TrackView>(`/api/incidents/track/${encodeURIComponent(ref)}/subscription`, { subscribed }, { params: { phone } })).data,
    onSuccess: (view) => qc.setQueryData(incidentKeys.track(ref, phone), view),
  });
}

/** Citizen edit (only while "reported"; otherwise 409 REPORT_NOT_EDITABLE) */
export function useEditReport(ref: string, phone: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TrackEditPayload) =>
      (await api.patch<TrackView>(`/api/incidents/track/${encodeURIComponent(ref)}`, payload, { params: { phone } })).data,
    onSuccess: (view) => qc.setQueryData(incidentKeys.track(ref, phone), view),
    onError: () => void qc.invalidateQueries({ queryKey: incidentKeys.track(ref, phone) }), // status may have moved on
  });
}

export function useHistory(id: number) {
  return useQuery({
    queryKey: incidentKeys.history(id),
    queryFn: async () => (await api.get<HistoryItem[]>(`/api/incidents/${id}/history`)).data,
    enabled: Number.isFinite(id),
  });
}

export function useNearby(id: number) {
  return useQuery({
    queryKey: incidentKeys.nearby(id),
    queryFn: async () => (await api.get<NearbyItem[]>(`/api/incidents/${id}/nearby`)).data,
    enabled: Number.isFinite(id),
  });
}

export function useIncidentStats(refetchInterval?: number) {
  return useQuery({
    queryKey: incidentKeys.stats,
    queryFn: async () => (await api.get<IncidentStats>('/api/stats/incidents')).data,
    refetchInterval,
  });
}
