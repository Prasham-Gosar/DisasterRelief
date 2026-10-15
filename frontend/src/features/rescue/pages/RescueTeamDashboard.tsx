import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wifi, WifiOff, MapPin, Radio, Shield, CheckCircle2, Clock } from 'lucide-react';
import { fetchMyTask, updateTaskStatus, updateTeamLocation } from '../api';
import { rescueKeys } from '../queryKeys';
import { useAuth } from '../../../lib/auth';
import { RescueTaskCard } from '../components/RescueTaskCard';
import { ResolveTaskModal } from '../components/ResolveTaskModal';
import { Card, Spinner, ErrorBanner, Button, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import { enqueue, listQueue, flushQueue, type QueueItem } from '../../../lib/offlineQueue';

export function RescueTeamDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Online / offline state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueItems, setQueueItems] = useState<QueueItem[]>(() => listQueue());

  // Modal state
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Success banner after resolve
  const [justResolved, setJustResolved] = useState(false);

  // Poll task every 10s
  const {
    data: task,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: rescueKeys.myTask(),
    queryFn: fetchMyTask,
    refetchInterval: isOnline ? 10_000 : false,
  });

  // Compute effective status from server task + local pending offline queue
  const taskQueue = queueItems.filter((q) => q.assignment_id === task?.assignment_id);
  const pendingStatus = taskQueue.length > 0 ? taskQueue[taskQueue.length - 1].status : null;
  const effectiveStatus = pendingStatus ?? task?.status;
  const hasPendingSync = taskQueue.length > 0;

  // Flush handler
  const triggerFlush = useCallback(async () => {
    if (listQueue().length === 0) return;
    try {
      const result = await flushQueue();
      setQueueItems(listQueue());
      if (result.processed > 0) {
        toast('success', `Synced ${result.processed} update(s) to server`);
        queryClient.invalidateQueries({ queryKey: rescueKeys.all });
      }
    } catch (err) {
      console.warn('[RescueTeamDashboard] Flush error:', err);
    }
  }, [queryClient, toast]);

  // Online/offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerFlush();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerFlush]);

  // Flush every 15s while queue is non-empty
  useEffect(() => {
    if (queueItems.length === 0) return;
    const interval = setInterval(() => {
      triggerFlush();
    }, 15_000);
    return () => clearInterval(interval);
  }, [queueItems.length, triggerFlush]);

  // Location tracking state
  const [locationStatus, setLocationStatus] = useState<
    'idle' | 'sharing' | 'denied' | 'error'
  >('idle');
  const lastLocationSentRef = useRef<number>(0);

  // Location tracking effect while task is active
  useEffect(() => {
    if (!task || task.status === 'resolved' || !navigator.geolocation || !isOnline) {
      if (locationStatus !== 'denied') setLocationStatus('idle');
      return;
    }

    const sendLocation = (position: GeolocationPosition) => {
      const now = Date.now();
      // At most every 30 seconds
      if (now - lastLocationSentRef.current < 30_000) return;

      lastLocationSentRef.current = now;
      updateTeamLocation(position.coords.latitude, position.coords.longitude)
        .then(() => setLocationStatus('sharing'))
        .catch(() => setLocationStatus('error'));
    };

    const handleError = (geoError: GeolocationPositionError) => {
      if (geoError.code === geoError.PERMISSION_DENIED) {
        setLocationStatus('denied');
      } else {
        setLocationStatus('error');
      }
    };

    // Immediate initial check
    navigator.geolocation.getCurrentPosition(sendLocation, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
    });

    const watchId = navigator.geolocation.watchPosition(sendLocation, handleError, {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 10000,
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [task, isOnline, locationStatus]);

  // Update status mutation
  const statusMutation = useMutation({
    mutationFn: async ({
      nextStatus,
      note,
    }: {
      nextStatus: 'en_route' | 'on_site' | 'resolved';
      note?: string | null;
    }) => {
      if (!task) throw new Error('No active task');

      // If navigator is explicitly offline, enqueue immediately without failing request
      if (!navigator.onLine) {
        enqueue({
          assignment_id: task.assignment_id,
          status: nextStatus,
          closing_note: note,
        });
        setQueueItems(listQueue());
        return { isOfflineQueued: true, nextStatus };
      }

      try {
        const data = await updateTaskStatus(task.assignment_id, nextStatus, note);
        return { isOfflineQueued: false, nextStatus, data };
      } catch (err: unknown) {
        // Check if network error (e.g. status === 0 or no response from server)
        const isNetworkErr =
          err instanceof ApiError
            ? err.status === 0
            : (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ERR_NETWORK') ||
              !navigator.onLine;

        if (isNetworkErr) {
          enqueue({
            assignment_id: task.assignment_id,
            status: nextStatus,
            closing_note: note,
          });
          setQueueItems(listQueue());
          return { isOfflineQueued: true, nextStatus };
        }
        throw err;
      }
    },
    onSuccess: (res) => {
      setServerError(null);
      if (res.isOfflineQueued) {
        if (res.nextStatus === 'resolved') {
          setResolveModalOpen(false);
          setJustResolved(true);
          toast('info', 'Offline: Resolved update queued. Will sync automatically when online.');
        } else {
          toast('info', `Offline: Status updated to ${res.nextStatus.replace('_', ' ')} (queued)`);
        }
        return;
      }

      const updated = res.data!;
      if (updated.status === 'resolved') {
        setResolveModalOpen(false);
        setJustResolved(true);
        toast('success', 'Incident successfully marked as resolved');
        setTimeout(() => setJustResolved(false), 5000);
      } else {
        toast('success', `Status updated to ${updated.status.replace('_', ' ')}`);
      }
      queryClient.setQueryData(rescueKeys.myTask(), updated.status === 'resolved' ? null : updated);
      queryClient.invalidateQueries({ queryKey: rescueKeys.all });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === 'REMARK_REQUIRED') {
          setServerError('A closing note of at least 5 characters is required');
          return;
        }
        toast('error', err.message);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      toast('error', msg);
    },
  });

  const handleNextStatus = (nextStatus: 'en_route' | 'on_site' | 'resolved') => {
    if (nextStatus === 'resolved') {
      setServerError(null);
      setResolveModalOpen(true);
      return;
    }
    statusMutation.mutate({ nextStatus });
  };

  const handleResolveSubmit = (closingNote: string) => {
    statusMutation.mutate({ nextStatus: 'resolved', note: closingNote });
  };

  const teamName = task?.team.name ?? user?.name ?? 'Rescue Unit';

  return (
    <div className="max-w-md mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* Offline Banner when disconnected */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 bg-amber-600 text-white rounded-ui shadow-sm text-sm font-medium flex items-center gap-2 animate-in fade-in"
        >
          <WifiOff className="w-5 h-5 flex-shrink-0" />
          <span>You are offline. Your updates will be sent automatically.</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="flex items-center justify-between p-3.5 bg-white rounded-ui border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">
              {teamName}
            </h1>
            <span className="text-xs text-gray-500 font-mono">
              {user?.public_code ?? 'RESCUE'}
            </span>
          </div>
        </div>

        {/* Connection & GPS Indicators */}
        <div className="flex items-center gap-2">
          {/* Location indicator */}
          {locationStatus === 'sharing' && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full border border-green-200"
              title="Sharing live GPS location"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
              GPS active
            </span>
          )}

          {/* Connection state */}
          <span
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold border ${
              isOnline
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-green-600" />
                Online
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-600" />
                Offline
              </>
            )}
          </span>
        </div>
      </div>

      {/* Geolocation permission denied notification (non-blocking) */}
      {locationStatus === 'denied' && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-ui text-xs text-amber-800 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>Location permission is disabled. Enable GPS for live coordinator dispatch tracking.</span>
        </div>
      )}

      {/* Success banner after resolving */}
      {justResolved && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-ui text-sm text-green-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span>Incident marked resolved. Team returned to standby.</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="space-y-3">
          <ErrorBanner
            message={error instanceof Error ? error.message : 'Unable to connect to dispatch server'}
          />
          <Button variant="secondary" size="sm" onClick={() => refetch()} className="w-full">
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <Card className="py-16 text-center text-gray-500">
          <Spinner size="lg" />
          <p className="mt-3 text-sm font-medium">Checking task status...</p>
        </Card>
      )}

      {/* Standby Empty State */}
      {!isLoading && !isError && !task && (
        <Card className="py-14 px-6 text-center space-y-4 shadow-sm border-dashed border-2 border-gray-200">
          <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-brand-50/50">
            <Radio className="w-8 h-8 text-brand-600 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              You are on standby
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-xs mx-auto">
              Ready for immediate dispatch. New emergency assignments will appear on this screen automatically.
            </p>
          </div>
          <div className="pt-2 text-xs text-gray-400 font-mono flex items-center justify-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Polling server every 10s
          </div>
        </Card>
      )}

      {/* Active Task Card */}
      {!isLoading && !isError && task && (
        <RescueTaskCard
          task={task}
          effectiveStatus={effectiveStatus}
          hasPendingSync={hasPendingSync}
          onUpdateStatus={handleNextStatus}
          isLoading={statusMutation.isPending}
        />
      )}

      {/* Resolve Modal with Closing Note */}
      <ResolveTaskModal
        open={resolveModalOpen}
        onClose={() => setResolveModalOpen(false)}
        onSubmit={handleResolveSubmit}
        loading={statusMutation.isPending}
        serverError={serverError}
      />
    </div>
  );
}
