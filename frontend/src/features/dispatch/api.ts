import api from '../../lib/api';
import type {
  IncidentDetail,
  AvailableTeamsResponse,
  AssignResponse,
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

export async function verifyIncident(reportId: number | string): Promise<IncidentDetail> {
  const { data } = await api.post<IncidentDetail>(`/api/incidents/${reportId}/verify`);
  return data;
}
