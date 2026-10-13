import api from '../../lib/api';
import type { NotificationListResponse, NotificationItem } from '../../lib/types';

export interface NotificationQueryParams {
  unread_only?: boolean;
  page?: number;
  page_size?: number;
}

export async function fetchNotifications(
  params: NotificationQueryParams = {},
): Promise<NotificationListResponse> {
  const { data } = await api.get<NotificationListResponse>('/api/notifications', {
    params,
  });
  return data;
}

export async function markNotificationRead(id: number): Promise<NotificationItem> {
  const { data } = await api.post<NotificationItem>(`/api/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const { data } = await api.post<{ updated: number }>('/api/notifications/read-all');
  return data;
}
