import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ExternalLink, AlertTriangle, CheckCircle, XCircle, Info, Radio } from 'lucide-react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../api';
import { notificationKeys } from '../queryKeys';
import { useAuth } from '../../../lib/auth';
import { timeAgo } from '../../../lib/format';
import type { AlertType, NotificationItem } from '../../../lib/types';
import { Spinner } from '../../../components/ui';

function getAlertIcon(type: AlertType) {
  switch (type) {
    case 'new_report':
    case 'no_team_available':
    case 'overdue':
      return <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />;
    case 'verification':
    case 'incident_resolved':
      return <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />;
    case 'rejection':
      return <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />;
    case 'team_deployed':
      return <Radio className="w-4 h-4 text-purple-600 flex-shrink-0" />;
    default:
      return <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />;
  }
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Poll notifications every 15 seconds
  const { data, isLoading } = useQuery({
    queryKey: notificationKeys.list({ page_size: 10 }),
    queryFn: () => fetchNotifications({ page_size: 10 }),
    refetchInterval: 15_000,
    staleTime: 10_000,
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

  // Calculate unread count
  const unreadCount = data?.unread_count ?? data?.items.filter((n) => !n.is_read).length ?? 0;
  const notifications = data?.items.slice(0, 10) ?? [];

  // Close dropdown on click outside or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleItemClick = (item: NotificationItem) => {
    if (!item.is_read) {
      markReadMutation.mutate(item.id);
    }
    setIsOpen(false);

    // Role-based navigation
    if (user?.role === 'coordinator') {
      if (item.related_report_id) {
        navigate(`/coordinator/incidents/${item.related_report_id}`);
      } else {
        navigate('/coordinator/incidents');
      }
    } else if (user?.role === 'rescue_team_member') {
      navigate('/team');
    } else {
      navigate('/notifications');
    }
  };

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllMutation.mutate();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-ui text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-ring"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-600 rounded-full ring-2 ring-white animate-in zoom-in">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 sm:w-96 bg-white rounded-ui border border-gray-200 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markAllMutation.isPending}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 disabled:opacity-50 focus-ring rounded"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {isLoading ? (
              <div className="py-8 flex justify-center items-center text-gray-400">
                <Spinner size="md" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">
                No notifications yet.
              </div>
            ) : (
              notifications.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`
                    w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none
                    ${!item.is_read ? 'bg-brand-50/40' : ''}
                  `}
                >
                  <div className="mt-0.5">{getAlertIcon(item.alert_type)}</div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs sm:text-sm leading-snug line-clamp-2 ${
                        !item.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      {item.message}
                    </p>
                    <span className="block mt-1 text-[11px] text-gray-400 font-mono">
                      {timeAgo(item.created_at)}
                    </span>
                  </div>
                  {!item.is_read && (
                    <span
                      className="w-2 h-2 rounded-full bg-brand-600 flex-shrink-0 mt-1.5"
                      aria-label="Unread"
                    />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-gray-50 border-t border-gray-200 text-center">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/notifications');
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 focus-ring rounded px-2 py-1"
            >
              View all notifications
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
