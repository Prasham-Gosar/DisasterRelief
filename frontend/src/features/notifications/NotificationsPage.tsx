import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Radio,
  Clock,
} from 'lucide-react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from './api';
import { notificationKeys } from './queryKeys';
import { useAuth } from '../../lib/auth';
import { timeAgo, formatDateTime } from '../../lib/format';
import type { AlertType, NotificationItem } from '../../lib/types';
import {
  Card,
  Button,
  Pagination,
  Spinner,
  EmptyState,
  ErrorBanner,
} from '../../components/ui';

function getAlertIcon(type: AlertType) {
  switch (type) {
    case 'new_report':
    case 'no_team_available':
    case 'overdue':
      return (
        <div className="p-2 bg-amber-50 rounded-ui text-amber-600">
          <AlertTriangle className="w-5 h-5" />
        </div>
      );
    case 'verification':
    case 'incident_resolved':
      return (
        <div className="p-2 bg-green-50 rounded-ui text-green-600">
          <CheckCircle className="w-5 h-5" />
        </div>
      );
    case 'rejection':
      return (
        <div className="p-2 bg-red-50 rounded-ui text-red-600">
          <XCircle className="w-5 h-5" />
        </div>
      );
    case 'team_deployed':
      return (
        <div className="p-2 bg-purple-50 rounded-ui text-purple-600">
          <Radio className="w-5 h-5" />
        </div>
      );
    default:
      return (
        <div className="p-2 bg-blue-50 rounded-ui text-blue-600">
          <Info className="w-5 h-5" />
        </div>
      );
  }
}

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: notificationKeys.list({ page, page_size: pageSize }),
    queryFn: () => fetchNotifications({ page, page_size: pageSize }),
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const notifications = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unread_count ?? notifications.filter((n) => !n.is_read).length;

  const handleItemClick = (item: NotificationItem) => {
    if (!item.is_read) {
      markReadMutation.mutate(item.id);
    }

    if (user?.role === 'coordinator') {
      if (item.related_report_id) {
        navigate(`/coordinator/incidents/${item.related_report_id}`);
      } else {
        navigate('/coordinator/incidents');
      }
    } else if (user?.role === 'rescue_team_member') {
      navigate('/team');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Real-time emergency alerts and platform activity updates
          </p>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAllMutation.mutate()}
            loading={markAllMutation.isPending}
            className="self-start sm:self-auto"
          >
            <CheckCheck className="w-4 h-4 mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div className="space-y-3">
          <ErrorBanner
            message={error instanceof Error ? error.message : 'Failed to load notifications'}
          />
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <Card className="py-16 flex flex-col items-center justify-center text-gray-500">
          <Spinner size="lg" />
          <p className="mt-4 text-sm font-medium">Loading notifications...</p>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !isError && notifications.length === 0 && (
        <Card>
          <EmptyState
            icon={<Bell className="h-12 w-12 text-gray-300" aria-hidden="true" />}
            title="No notifications yet"
            description="You're all caught up! Emergency alerts and task dispatches will appear here."
          />
        </Card>
      )}

      {/* Notifications list */}
      {!isLoading && !isError && notifications.length > 0 && (
        <Card className="p-0 overflow-hidden divide-y divide-gray-100 shadow-sm">
          {notifications.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleItemClick(item);
                }
              }}
              className={`
                flex items-start gap-4 p-4 sm:p-5 transition-colors cursor-pointer text-left focus:outline-none focus:bg-gray-50
                ${!item.is_read ? 'bg-brand-50/40 hover:bg-brand-50/70' : 'bg-white hover:bg-gray-50/80'}
              `}
            >
              {/* Type icon */}
              {getAlertIcon(item.alert_type)}

              {/* Text content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={`text-sm ${
                      !item.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'
                    }`}
                  >
                    {item.message}
                  </p>
                  <time
                    className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1 font-mono"
                    title={formatDateTime(item.created_at)}
                  >
                    <Clock className="w-3 h-3 text-gray-300 inline" />
                    {timeAgo(item.created_at)}
                  </time>
                </div>

                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                  <span className="capitalize">{item.alert_type.replace('_', ' ')}</span>
                  <span>•</span>
                  <span className="uppercase">{item.channel}</span>
                </div>
              </div>

              {/* Unread dot */}
              {!item.is_read && (
                <div className="flex items-center self-center pl-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-brand-600 ring-4 ring-brand-100"
                    aria-label="Unread notification"
                  />
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
          />
        </Card>
      )}
    </div>
  );
}
