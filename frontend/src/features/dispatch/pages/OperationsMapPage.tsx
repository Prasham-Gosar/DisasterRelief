import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import {
  RefreshCw,
  Filter,
  Users,
  ExternalLink,
} from 'lucide-react';
import { MapView, type MapMarker } from '../../../components/map/MapView';
import { fetchDispatchMap } from '../api';
import { dispatchKeys } from '../queryKeys';
import { Button, ErrorBanner, Spinner } from '../../../components/ui';
import {
  severityLabel,
  teamTypeLabel,
  teamStatusLabel,
  incidentTypeLabel,
  timeAgo,
  formatDateTime,
} from '../../../lib/format';
import type { Severity, TeamStatus, TeamType } from '../../../lib/types';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#eab308',
  low: '#16a34a',
};

const TEAM_TYPE_COLORS: Record<string, string> = {
  fire: '#e11d48',
  medical: '#059669',
  ndrf: '#2563eb',
  local: '#7c3aed',
};

function createTeamIcon(type: string, status: string): L.DivIcon {
  const bgColor = TEAM_TYPE_COLORS[type] ?? '#4b5563';
  const isAvailable = status === 'available';
  const ringColor = isAvailable ? '#22c55e' : '#f97316';

  return L.divIcon({
    className: 'custom-team-marker',
    html: `
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        background-color: ${bgColor};
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid ${ringColor};
        box-shadow: 0 2px 6px rgba(0,0,0,0.35);
        font-weight: bold;
        font-size: 11px;
      ">
        <span>${type.charAt(0).toUpperCase()}</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

export function OperationsMapPage() {
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedTeamStatus, setSelectedTeamStatus] = useState<string>('all');

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: dispatchKeys.map(),
    queryFn: fetchDispatchMap,
    refetchInterval: 10_000,
  });

  const incidents = data?.incidents ?? [];
  const teams = data?.teams ?? [];

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (selectedSeverity !== 'all' && inc.severity !== selectedSeverity) return false;
      return inc.latitude != null && inc.longitude != null;
    });
  }, [incidents, selectedSeverity]);

  // Filtered teams
  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      if (selectedTeamStatus !== 'all' && t.status !== selectedTeamStatus) return false;
      return t.latitude != null && t.longitude != null;
    });
  }, [teams, selectedTeamStatus]);

  // Combined markers for MapView
  const markers: MapMarker[] = useMemo(() => {
    const incidentMarkers: MapMarker[] = filteredIncidents.map((inc) => ({
      id: `incident-${inc.id}`,
      lat: inc.latitude,
      lng: inc.longitude,
      color: SEVERITY_COLORS[inc.severity] ?? '#6b7280',
      customPopup: (
        <div className="p-1 min-w-[200px] space-y-1.5 text-xs">
          <div className="flex items-center justify-between border-b pb-1">
            <span className="font-mono font-bold text-sm text-gray-900">
              {inc.tracking_ref ?? `INC-${inc.id}`}
            </span>
            <span
              className="px-1.5 py-0.5 rounded font-bold uppercase text-[10px] text-white"
              style={{ backgroundColor: SEVERITY_COLORS[inc.severity] ?? '#6b7280' }}
            >
              {severityLabel(inc.severity as Severity)}
            </span>
          </div>

          <div>
            <span className="text-gray-400 block text-[10px]">Type & Status</span>
            <span className="font-semibold text-gray-800">
              {incidentTypeLabel(inc.incident_type as any)} • {inc.status}
            </span>
          </div>

          <div>
            <span className="text-gray-400 block text-[10px]">Location</span>
            <span className="text-gray-700">{inc.location}</span>
          </div>

          <div className="pt-1.5 border-t mt-1">
            <Link
              to={`/coordinator/incidents/${inc.id}`}
              className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800"
            >
              View incident details
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      ),
    }));

    const teamMarkers: MapMarker[] = filteredTeams.map((team) => ({
      id: `team-${team.id}`,
      lat: team.latitude!,
      lng: team.longitude!,
      customIcon: createTeamIcon(team.team_type, team.status),
      customPopup: (
        <div className="p-1 min-w-[190px] space-y-1.5 text-xs">
          <div className="flex items-center justify-between border-b pb-1">
            <span className="font-bold text-sm text-gray-900">{team.name}</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                team.status === 'available'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-orange-100 text-orange-800'
              }`}
            >
              {teamStatusLabel(team.status as TeamStatus)}
            </span>
          </div>

          <div>
            <span className="text-gray-400 block text-[10px]">Team Unit</span>
            <span className="font-medium text-gray-800">
              {teamTypeLabel(team.team_type as TeamType)} Response Team
            </span>
          </div>

          <div>
            <span className="text-gray-400 block text-[10px]">Last Location Ping</span>
            <span className="text-gray-600 font-mono">
              {team.last_location_at
                ? `${timeAgo(team.last_location_at)} (${formatDateTime(team.last_location_at)})`
                : 'No recent GPS ping'}
            </span>
          </div>
        </div>
      ),
    }));

    return [...incidentMarkers, ...teamMarkers];
  }, [filteredIncidents, filteredTeams]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Operations Map</h1>
          <p className="text-sm text-gray-500 mt-1">
            Live geographic overview of reported incidents and active field rescue teams.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh Map
        </Button>
      </div>

      {/* Filter Chips Bar */}
      <div className="bg-white p-3.5 rounded-ui border border-gray-200 shadow-sm flex flex-wrap items-center gap-4 text-xs">
        {/* Severity Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-600 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            Severity:
          </span>
          {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSelectedSeverity(sev)}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors focus-ring ${
                selectedSeverity === sev
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {sev === 'all' ? 'All' : severityLabel(sev as Severity)}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-200 hidden md:block" />

        {/* Team Status Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-600 mr-1 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            Team Status:
          </span>
          {[
            { id: 'all', label: 'All' },
            { id: 'available', label: 'Available' },
            { id: 'deployed', label: 'Dispatched' },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedTeamStatus(st.id)}
              className={`px-2.5 py-1 rounded-full font-medium transition-colors focus-ring ${
                selectedTeamStatus === st.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {isError && (
        <div className="space-y-3">
          <ErrorBanner
            message={error instanceof Error ? error.message : 'Failed to load map data'}
          />
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="h-[450px] md:h-[550px] bg-white rounded-ui border border-gray-200 flex flex-col items-center justify-center">
          <Spinner size="lg" />
          <p className="mt-3 text-sm text-gray-500 font-medium">Loading geospatial data...</p>
        </div>
      )}

      {/* Map View */}
      {!isLoading && !isError && (
        <div className="space-y-3">
          <MapView
            markers={markers}
            fitBoundsOnce={true}
            className="h-[500px] md:h-[600px] shadow-sm"
          />

          {/* Empty Note if no markers */}
          {markers.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-ui text-xs text-amber-800 text-center font-medium">
              No incidents or teams currently match the active filters or contain GPS coordinates.
            </div>
          )}

          {/* Map Legend */}
          <div className="bg-white p-4 rounded-ui border border-gray-200 shadow-sm space-y-3 text-xs">
            <div className="font-semibold text-gray-700 uppercase tracking-wider text-[11px]">
              Map Symbols & Legend
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Incident Pins */}
              <div className="space-y-1.5">
                <span className="font-medium text-gray-500 block">Incident Severity (Pins)</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-red-600" />
                    Critical
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-orange-500" />
                    High
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    Medium
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-green-600" />
                    Low
                  </span>
                </div>
              </div>

              {/* Team Units */}
              <div className="space-y-1.5">
                <span className="font-medium text-gray-500 block">Team Units (Circle Initials)</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-bold">F</span>
                    Fire
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white text-[9px] flex items-center justify-center font-bold">M</span>
                    Medical
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold">N</span>
                    NDRF
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full bg-purple-600 text-white text-[9px] flex items-center justify-center font-bold">L</span>
                    Local
                  </span>
                </div>
              </div>

              {/* Team Status Rings */}
              <div className="space-y-1.5">
                <span className="font-medium text-gray-500 block">Team Status Ring</span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-green-500 bg-white" />
                    Available
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-orange-500 bg-white" />
                    Dispatched
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
