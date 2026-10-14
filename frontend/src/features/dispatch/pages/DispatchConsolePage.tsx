import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ShieldAlert, RefreshCw, ArrowLeft } from 'lucide-react';
import { fetchIncident, fetchAvailableTeams, assignTeams, verifyIncident } from '../api';
import { dispatchKeys } from '../queryKeys';
import { IncidentSummaryCard } from '../components/IncidentSummaryCard';
import { RankedTeamList } from '../components/RankedTeamList';
import { AssignSuccessPanel } from '../components/AssignSuccessPanel';
import { MapView, type MapMarker } from '../../../components/map/MapView';
import { Card, Button, ErrorBanner, Skeleton, useToast } from '../../../components/ui';
import { ApiError } from '../../../lib/api';
import type { AssignResponse } from '../../../lib/types';

const severityColorMap: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#10b981',
};

const teamTypeColorMap: Record<string, string> = {
  fire: '#dc2626',
  medical: '#2563eb',
  ndrf: '#059669',
  local: '#7c3aed',
};

export function DispatchConsolePage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [assignResult, setAssignResult] = useState<AssignResponse | null>(null);

  // 1. Fetch incident detail
  const {
    data: incident,
    isLoading: isIncidentLoading,
    isError: isIncidentError,
    error: incidentError,
    refetch: refetchIncident,
  } = useQuery({
    queryKey: dispatchKeys.incident(incidentId ?? ''),
    queryFn: () => fetchIncident(incidentId!),
    enabled: Boolean(incidentId),
  });

  const isVerified = incident?.status === 'verified';
  const isReported = incident?.status === 'reported';
  const isAlreadyProcessed = incident && !isVerified && !isReported;

  // 2. Fetch available teams (poll every 30s when list is empty)
  const {
    data: availableTeamsData,
    isLoading: isTeamsLoading,
    isError: isTeamsError,
    error: teamsError,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: dispatchKeys.availableTeams(incidentId ?? ''),
    queryFn: () => fetchAvailableTeams(incidentId!),
    enabled: Boolean(incidentId) && isVerified,
    refetchInterval: (query) => {
      // Auto-refetch every 30s if team list is empty
      const items = query.state.data?.items;
      return items && items.length === 0 ? 30_000 : false;
    },
  });

  // Verify mutation
  const verifyMutation = useMutation({
    mutationFn: () => verifyIncident(incidentId!),
    onSuccess: (updated) => {
      toast('success', 'Incident successfully verified');
      queryClient.setQueryData(dispatchKeys.incident(incidentId ?? ''), updated);
      queryClient.invalidateQueries({ queryKey: dispatchKeys.availableTeams(incidentId ?? '') });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      toast('error', msg);
    },
  });

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: (teamIds: number[]) => assignTeams(incidentId!, teamIds),
    onSuccess: (result) => {
      toast('success', 'Team dispatched successfully');
      setAssignResult(result);
      queryClient.invalidateQueries({ queryKey: dispatchKeys.all });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === 'TEAM_NOT_AVAILABLE') {
          toast('error', 'Someone just dispatched that team');
          refetchTeams();
          return;
        }
        if (err.code === 'NO_TEAM_AVAILABLE') {
          toast('error', 'No rescue team is available right now');
          refetchTeams();
          return;
        }
      }
      const msg = err instanceof Error ? err.message : 'Dispatch failed';
      toast('error', msg);
    },
  });

  const toggleSelectTeam = (teamId: number) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    );
  };

  const handleAssign = (ids: number[]) => {
    assignMutation.mutate(ids);
  };

  // Map markers
  const availableTeams = availableTeamsData?.items ?? [];

  const markers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = [];

    // Incident Marker
    if (incident?.latitude && incident?.longitude) {
      list.push({
        id: 'incident',
        lat: incident.latitude,
        lng: incident.longitude,
        color: severityColorMap[incident.severity] ?? '#ef4444',
        label: `Incident: ${incident.tracking_ref ?? incident.id}`,
        popup: `${incident.location} • Severity: ${incident.severity.toUpperCase()}`,
      });
    }

    // Available Team Markers
    for (const team of availableTeams) {
      if (team.latitude && team.longitude) {
        const isSelected = selectedTeamIds.includes(team.team_id);
        list.push({
          id: `team-${team.team_id}`,
          lat: team.latitude,
          lng: team.longitude,
          color: isSelected ? '#1d4ed8' : teamTypeColorMap[team.team_type] ?? '#4b5563',
          label: team.name,
          popup: `${team.name} (${team.team_type.toUpperCase()}) • ${
            team.distance_km !== null && team.distance_km !== undefined
              ? `${team.distance_km} km away`
              : 'Distance unknown'
          }`,
        });
      }
    }

    return list;
  }, [incident, availableTeams, selectedTeamIds]);

  const mapCenter: [number, number] | undefined = useMemo(() => {
    if (incident?.latitude && incident?.longitude) {
      return [incident.latitude, incident.longitude];
    }
    return undefined;
  }, [incident]);

  // Loading skeleton state
  if (isIncidentLoading) {
    return (
      <div className="py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="lg:col-span-5">
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="lg:col-span-3">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (isIncidentError || !incident) {
    return (
      <div className="py-12 max-w-xl mx-auto space-y-4">
        <ErrorBanner
          message={incidentError instanceof Error ? incidentError.message : 'Incident not found'}
        />
        <div className="flex items-center justify-center gap-4">
          <Button variant="secondary" size="sm" onClick={() => refetchIncident()}>
            Retry
          </Button>
          <Link
            to="/coordinator/incidents"
            className="inline-flex items-center gap-2 text-sm text-brand-600 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to incidents list
          </Link>
        </div>
      </div>
    );
  }

  // Success dispatch state
  if (assignResult) {
    return (
      <div className="py-8">
        <AssignSuccessPanel result={assignResult} />
      </div>
    );
  }

  return (
    <div className="py-6 space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">
              Dispatch Console
            </h1>
            <span className="font-mono text-sm px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded-md font-semibold">
              {incident.tracking_ref ?? `INC-${incident.id}`}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Assign and deploy nearest rescue units to the emergency location
          </p>
        </div>

        <Link
          to={`/coordinator/incidents/${incident.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 focus-ring rounded"
        >
          <ArrowLeft className="w-4 h-4" />
          View incident details
        </Link>
      </div>

      {/* Warning banner: unverified incident */}
      {isReported && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-ui text-amber-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-medium">
              This report is not verified yet. Verification is required before rescue teams can be dispatched.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => verifyMutation.mutate()}
            loading={verifyMutation.isPending}
            className="self-start sm:self-auto"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Verify now
          </Button>
        </div>
      )}

      {/* Info banner: already dispatched/resolved */}
      {isAlreadyProcessed && (
        <div className="flex items-center gap-2.5 p-4 bg-blue-50 border border-blue-200 rounded-ui text-blue-800">
          <ShieldAlert className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <p className="text-sm">
            This incident report is currently <strong>{incident.status}</strong>. Rescue teams have already been assigned or this incident has finished processing.
          </p>
        </div>
      )}

      {/* Main 3-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Incident Summary (4 cols) */}
        <div className="lg:col-span-4 h-full">
          <IncidentSummaryCard incident={incident} />
        </div>

        {/* Centre Panel: MapView (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <Card className="p-2 sm:p-3">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Live Incident & Team Map
              </span>
              <span className="text-[11px] text-gray-500">
                Click a team marker to select
              </span>
            </div>

            <MapView
              markers={markers}
              center={mapCenter}
              zoom={13}
              fitBounds={true}
              onMarkerClick={(m) => {
                const idStr = String(m.id);
                if (idStr.startsWith('team-')) {
                  const tid = Number(idStr.replace('team-', ''));
                  if (!isNaN(tid)) {
                    toggleSelectTeam(tid);
                  }
                }
              }}
              className="h-[380px] md:h-[480px]"
            />
          </Card>
        </div>

        {/* Right Panel: Ranked Team List (3 cols) */}
        <div className="lg:col-span-3 h-full">
          {isTeamsLoading ? (
            <Card className="p-6 space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ) : isTeamsError ? (
            <Card className="p-4 space-y-3">
              <ErrorBanner
                message={teamsError instanceof Error ? teamsError.message : 'Failed to load available teams'}
              />
              <Button variant="secondary" size="sm" onClick={() => refetchTeams()} className="w-full">
                Retry
              </Button>
            </Card>
          ) : availableTeams.length === 0 ? (
            <Card className="py-12 px-4 text-center space-y-4">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-gray-900">
                  No Rescue Team Available
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  No rescue team is available right now. Coordinators have been alerted.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refetchTeams()}
                className="w-full"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Check again
              </Button>
            </Card>
          ) : (
            <RankedTeamList
              teams={availableTeams}
              selectedIds={selectedTeamIds}
              onToggleSelect={toggleSelectTeam}
              onAssign={handleAssign}
              isAssigning={assignMutation.isPending}
              disabled={!isVerified}
            />
          )}
        </div>
      </div>
    </div>
  );
}
