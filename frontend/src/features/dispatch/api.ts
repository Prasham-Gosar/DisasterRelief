import api from '../../lib/api';
import type {
  IncidentDetail,
  AvailableTeamsResponse,
  AssignResponse,
  ReassignPayload,
  DispatchAssignmentsResponse,
  DispatchSettings,
  DispatchMapResponse,
  TeamListResponse,
  TeamDetail,
  TeamStatus,
  TeamType,
} from '../../lib/types';

export async function fetchIncident(id: number | string): Promise<IncidentDetail> {
  const { data } = await api.get<IncidentDetail>(`/api/incidents/${id}`);
  return data;
}

export async function fetchAvailableTeams(id: number | string): Promise<AvailableTeamsResponse> {
  const { data } = await api.get<AvailableTeamsResponse>(`/api/incidents/${id}/available-teams`);
  return data;
}

export async function assignTeams(
  reportId: number | string,
  teamIds: number[] | null,
): Promise<AssignResponse> {
  const { data } = await api.post<AssignResponse>(`/api/incidents/${reportId}/assign`, {
    team_ids: teamIds,
  });
  return data;
}

export async function reassignTeam(
  reportId: number | string,
  payload: ReassignPayload,
): Promise<AssignResponse> {
  const { data } = await api.post<AssignResponse>(`/api/incidents/${reportId}/reassign`, payload);
  return data;
}

export async function verifyIncident(reportId: number | string): Promise<IncidentDetail> {
  const { data } = await api.post<IncidentDetail>(`/api/incidents/${reportId}/verify`);
  return data;
}

export async function fetchDispatchAssignments(
  scope: 'active' | 'overdue' | 'resolved_today' = 'active',
): Promise<DispatchAssignmentsResponse> {
  const { data } = await api.get<DispatchAssignmentsResponse>('/api/dispatch/assignments', {
    params: { scope },
  });
  return data;
}

export async function fetchDispatchSettings(): Promise<DispatchSettings> {
  const { data } = await api.get<DispatchSettings>('/api/dispatch/settings');
  return data;
}

export async function updateDispatchSettings(overdueMinutes: number): Promise<DispatchSettings> {
  const { data } = await api.put<DispatchSettings>('/api/dispatch/settings', {
    overdue_minutes: overdueMinutes,
  });
  return data;
}

export async function fetchDispatchMap(): Promise<DispatchMapResponse> {
  const { data } = await api.get<DispatchMapResponse>('/api/dispatch/map');
  return data;
}

export interface ListTeamsParams {
  status?: TeamStatus;
  team_type?: TeamType;
  page?: number;
  page_size?: number;
}

export async function fetchTeams(params?: ListTeamsParams): Promise<TeamListResponse> {
  const { data } = await api.get<TeamListResponse>('/api/teams', { params });
  return data;
}

export async function fetchTeam(id: number | string): Promise<TeamDetail> {
  const { data } = await api.get<TeamDetail>(`/api/teams/${id}`);
  return data;
}
