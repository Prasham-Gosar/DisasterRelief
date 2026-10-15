import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
  AlertTriangle,
  X,
  Clock,
  UserCheck,
} from 'lucide-react';
import {
  Tabs,
  Badge,
  SeverityBadge,
  StatusBadge,
  Stepper,
  Button,
  EmptyState,
  ErrorBanner,
  Skeleton,
} from '../../../components/ui';
import { fetchDispatchAssignments } from '../api';
import { dispatchKeys } from '../queryKeys';
import { ReassignModal } from '../components/ReassignModal';
import { OverdueSettingsModal } from '../components/OverdueSettingsModal';
import { incidentTypeLabel, teamTypeLabel, formatDateTime } from '../../../lib/format';
import type { DispatchAssignment, AssignmentStatus } from '../../../lib/types';

type ScopeTab = 'active' | 'overdue' | 'resolved_today';

const STEPPER_STEPS = ['Assigned', 'En route', 'On site', 'Resolved'];

function getStepIndex(status: string): number {
  switch (status) {
    case 'assigned':
      return 0;
    case 'en_route':
      return 1;
    case 'on_site':
      return 2;
    case 'resolved':
      return 3;
    default:
      return 0;
  }
}

export function OperationsBoardPage() {
  const [activeTab, setActiveTab] = useState<ScopeTab>('active');
  const [selectedForReassign, setSelectedForReassign] = useState<DispatchAssignment | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Overdue banner state
  const [bannerOverdueCount, setBannerOverdueCount] = useState<number | null>(null);
  const prevOverdueCountRef = useRef<number | null>(null);

  // Main board query for current scope
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    dataUpdatedAt,
    isFetching,
  } = useQuery({
    queryKey: dispatchKeys.assignments(activeTab),
    queryFn: () => fetchDispatchAssignments(activeTab),
    refetchInterval: 10_000,
  });

  // Background query to monitor total overdue count regardless of active tab
  const { data: overdueData } = useQuery({
    queryKey: dispatchKeys.assignments('overdue'),
    queryFn: () => fetchDispatchAssignments('overdue'),
    refetchInterval: 10_000,
  });

  // Detect increase in overdue count between polls
  useEffect(() => {
    if (overdueData) {
      const currentCount = overdueData.total;
      if (prevOverdueCountRef.current !== null && currentCount > prevOverdueCountRef.current) {
        setBannerOverdueCount(currentCount);
      }
      prevOverdueCountRef.current = currentCount;
    }
  }, [overdueData]);

  // "Updated X s ago" ticker
  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    const updateTicker = () => {
      if (dataUpdatedAt) {
        setSecondsAgo(Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 1000)));
      }
    };
    updateTicker();
    const interval = setInterval(updateTicker, 1000);
    return () => clearInterval(interval);
  }, [dataUpdatedAt]);

  const assignments = data?.items ?? [];
  const overdueTotal = overdueData?.total ?? 0;

  const tabsConfig = [
    { id: 'active', label: 'Active', count: activeTab === 'active' ? assignments.length : undefined },
    { id: 'overdue', label: 'Overdue', count: overdueTotal },
    { id: 'resolved_today', label: 'Resolved today' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner when overdue count increases */}
      {bannerOverdueCount !== null && bannerOverdueCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="bg-red-600 text-white px-4 py-3 rounded-ui shadow-md flex items-center justify-between animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span className="font-semibold text-sm">
              {bannerOverdueCount} assignment(s) overdue
            </span>
          </div>
          <button
            onClick={() => setBannerOverdueCount(null)}
            className="p-1 rounded hover:bg-red-700 focus-ring"
            aria-label="Dismiss overdue alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Operations Board
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time tracking of active dispatches, rescue progression, and response SLA.
          </p>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-mono hidden sm:inline">
            Updated {secondsAgo}s ago
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh board data"
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Overdue Limit
          </Button>
        </div>
      </div>

      {/* Scope Tabs */}
      <Tabs
        tabs={tabsConfig}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as ScopeTab)}
        ariaLabel="Dispatch scope tabs"
      />

      {/* Error state */}
      {isError && (
        <div className="space-y-3">
          <ErrorBanner
            message={error instanceof Error ? error.message : 'Failed to load dispatch assignments'}
          />
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white p-5 rounded-ui border border-gray-200 shadow-sm space-y-4 animate-pulse"
            >
              <div className="flex justify-between items-center">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && assignments.length === 0 && (
        <div className="bg-white rounded-ui border border-gray-200 p-12 text-center">
          <EmptyState
            title={
              activeTab === 'overdue'
                ? 'No overdue assignments'
                : activeTab === 'resolved_today'
                ? 'No assignments resolved today'
                : 'No active dispatches'
            }
            description={
              activeTab === 'overdue'
                ? 'All deployed rescue teams are currently within the expected response time.'
                : 'Any new tasks dispatched by coordinators will appear here automatically.'
            }
          />
        </div>
      )}

      {/* Assignments List */}
      {!isLoading && !isError && assignments.length > 0 && (
        <div className="space-y-4">
          {assignments.map((assignment) => {
            const { report, team } = assignment;
            const currentStep = getStepIndex(assignment.status);

            return (
              <div
                key={assignment.assignment_id}
                className={`bg-white rounded-ui border p-5 shadow-sm transition-all hover:shadow-md ${
                  assignment.overdue ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'
                }`}
              >
                {/* Card Top Row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Link
                      to={`/coordinator/incidents/${report.id}`}
                      className="text-base font-bold text-brand-700 hover:text-brand-900 focus-ring font-mono"
                    >
                      {report.tracking_ref ?? `INC-${report.id}`}
                    </Link>
                    <span className="text-gray-300">|</span>
                    <span className="text-sm font-semibold text-gray-800">
                      {incidentTypeLabel(report.incident_type)}
                    </span>
                    <SeverityBadge severity={report.severity} />

                    {/* Team Name and Type Chip */}
                    <div className="inline-flex items-center gap-1.5 ml-1">
                      <span className="text-xs text-gray-400">Unit:</span>
                      <span className="text-xs font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                        {team.name}
                      </span>
                      <Badge color="blue">
                        {teamTypeLabel(team.team_type)}
                      </Badge>
                    </div>
                  </div>

                  {/* Overdue Badge (Text + Color) */}
                  <div className="flex items-center gap-2">
                    {assignment.overdue && (
                      <Badge color="red" className="font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        Overdue +{assignment.overdue_minutes} min
                      </Badge>
                    )}
                    <StatusBadge
                      type="assignment"
                      status={assignment.status as AssignmentStatus}
                    />
                  </div>
                </div>

                {/* Card Middle: Location & Timing */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-3.5 text-sm">
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Location</span>
                    <span className="font-medium text-gray-800">{report.location}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Assigned Time</span>
                    <span className="text-gray-700 font-mono text-xs">
                      {formatDateTime(assignment.assigned_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Elapsed Time</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-gray-800">
                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                      {assignment.elapsed_minutes} min elapsed
                    </span>
                  </div>
                </div>

                {/* Card Progress Stepper */}
                <div className="py-3 px-2 bg-gray-50/70 rounded-ui border border-gray-100 my-2">
                  <Stepper steps={STEPPER_STEPS} currentStep={currentStep} />
                </div>

                {/* Card Bottom: Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <Link
                    to={`/coordinator/incidents/${report.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-brand-700 rounded-ui border border-gray-200 hover:bg-gray-50 transition-colors focus-ring"
                  >
                    Open report
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                  </Link>

                  {assignment.status !== 'resolved' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedForReassign(assignment)}
                      className="text-xs font-semibold"
                    >
                      <UserCheck className="w-3.5 h-3.5 mr-1" />
                      Reassign
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reassign Modal */}
      <ReassignModal
        open={Boolean(selectedForReassign)}
        onClose={() => setSelectedForReassign(null)}
        assignment={selectedForReassign}
      />

      {/* Overdue Settings Modal */}
      <OverdueSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
