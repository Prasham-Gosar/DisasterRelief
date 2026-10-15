import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Users,
  MapPin,
  Clock,
  Shield,
} from 'lucide-react';
import {
  Card,
  Badge,
  StatusBadge,
  Timeline,
  Spinner,
  ErrorBanner,
  Button,
} from '../../../components/ui';
import type { TimelineItem } from '../../../components/ui/Timeline';
import { MapView, type MapMarker } from '../../../components/map/MapView';
import { fetchTeam } from '../api';
import { dispatchKeys } from '../queryKeys';
import {
  teamTypeLabel,
  formatDateTime,
} from '../../../lib/format';
import type { AssignmentStatus, MemberStatus } from '../../../lib/types';

export function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: team,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: dispatchKeys.team(id!),
    queryFn: () => fetchTeam(id!),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <Spinner size="lg" />
        <p className="mt-3 text-sm text-gray-500">Loading team details...</p>
      </div>
    );
  }

  if (isError || !team) {
    return (
      <div className="space-y-4">
        <Link
          to="/coordinator/teams"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Teams
        </Link>
        <ErrorBanner
          message={error instanceof Error ? error.message : 'Team not found or failed to load'}
        />
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const hasCoords = team.latitude != null && team.longitude != null;
  const mapMarkers: MapMarker[] = hasCoords
    ? [
        {
          id: `team-${team.id}`,
          lat: team.latitude!,
          lng: team.longitude!,
          color: '#2563eb',
          label: team.name,
          popup: `${team.name} (${teamTypeLabel(team.team_type)})`,
        },
      ]
    : [];

  // Map assignments to Timeline items
  const timelineItems: TimelineItem[] = (team.assignments ?? []).map((a) => {
    const isReassigned = a.status === 'reassigned';
    const isResolved = a.status === 'resolved';

    return {
      id: a.assignment_id,
      time: formatDateTime(a.assigned_at),
      title: a.report_tracking_ref ?? a.tracking_ref ?? `Assignment #${a.assignment_id}`,
      status: isResolved ? 'done' : isReassigned ? 'danger' : 'current',
      detail: (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Status:</span>
            <StatusBadge type="assignment" status={a.status as AssignmentStatus} />
          </div>
          {a.reassign_reason && (
            <div className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-100 font-medium">
              Reassigned: {a.reassign_reason}
            </div>
          )}
          {a.resolved_at && (
            <p className="text-xs text-gray-400">
              Resolved: {formatDateTime(a.resolved_at)}
            </p>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/coordinator/teams"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 focus-ring rounded-ui px-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Teams
        </Link>
      </div>

      {/* Team Header Card */}
      <div className="bg-white p-6 rounded-ui border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-lg shadow-sm flex-shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
              {team.public_code && (
                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  {team.public_code}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5 mt-2 flex-wrap">
              <Badge color="blue">
                {teamTypeLabel(team.team_type)}
              </Badge>
              <StatusBadge type="team" status={team.status} />
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {team.member_count} member{team.member_count === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        {team.current_report_id && (
          <div className="bg-amber-50 border border-amber-200 rounded-ui p-3 text-xs">
            <span className="text-amber-700 font-semibold block">Currently Active Deployment</span>
            <Link
              to={`/coordinator/incidents/${team.current_report_id}`}
              className="text-brand-700 font-mono font-bold hover:underline"
            >
              Report #{team.current_report_id}
            </Link>
          </div>
        )}
      </div>

      {/* Grid: Members & Location */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Members List */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-600" />
              Roster & Member Status
            </h2>
            <span className="text-xs text-gray-400 font-mono">
              {team.members?.length ?? 0} members
            </span>
          </div>

          {!team.members || team.members.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-2">No members registered in this unit.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {team.members.map((member) => (
                <li
                  key={member.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="font-semibold text-gray-800">
                      {member.name ?? `Member #${member.id}`}
                    </span>
                    {member.public_code && (
                      <span className="block text-xs font-mono text-gray-400">
                        {member.public_code}
                      </span>
                    )}
                  </div>

                  <StatusBadge
                    type="member"
                    status={(member.member_status as MemberStatus) ?? 'available'}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Location Card */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand-600" />
              Last Known Location
            </h2>
          </div>

          {hasCoords ? (
            <div className="space-y-2">
              <MapView
                markers={mapMarkers}
                center={[team.latitude!, team.longitude!]}
                zoom={14}
                className="h-[220px]"
              />
              <p className="text-xs text-gray-500 font-mono">
                Coordinates: {team.latitude!.toFixed(5)}, {team.longitude!.toFixed(5)}
              </p>
            </div>
          ) : (
            <div className="p-8 text-center bg-gray-50 rounded-ui border border-dashed border-gray-200 text-xs text-gray-500">
              <MapPin className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              No GPS location coordinates received from this unit yet.
            </div>
          )}
        </Card>
      </div>

      {/* Assignment History with Timeline */}
      <Card className="p-6 space-y-4">
        <div className="border-b pb-3">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600" />
            Deployment & Assignment History
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Historical emergency deployments, reassignments, and clearance records for this unit.
          </p>
        </div>

        {timelineItems.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4">
            No historical assignments recorded for this team.
          </p>
        ) : (
          <div className="pt-2">
            <Timeline items={timelineItems} />
          </div>
        )}
      </Card>
    </div>
  );
}
