import api from '../../lib/api';
import type { RescueTask } from '../../lib/types';

export async function fetchMyTask(): Promise<RescueTask | null> {
  const { data } = await api.get<RescueTask | null>('/api/team/my-task');
  return data;
}

export async function updateTaskStatus(
  assignmentId: number,
  status: 'en_route' | 'on_site' | 'resolved' | string,
  closingNote?: string | null,
  clientUpdateId?: string | null,
): Promise<RescueTask> {
  const { data } = await api.post<RescueTask>(`/api/team/tasks/${assignmentId}/status`, {
    status,
    closing_note: closingNote ?? null,
    client_update_id: clientUpdateId ?? null,
  });
  return data;
}

export async function updateTeamLocation(
  latitude: number,
  longitude: number,
): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>('/api/team/location', {
    latitude,
    longitude,
  });
  return data;
}
