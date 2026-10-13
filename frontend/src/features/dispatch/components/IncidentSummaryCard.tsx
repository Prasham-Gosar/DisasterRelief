import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, Flame, Droplets, Stethoscope, AlertTriangle } from 'lucide-react';
import type { IncidentDetail, IncidentType } from '../../../lib/types';
import { Card, SeverityBadge, StatusBadge } from '../../../components/ui';
import { timeAgo, incidentTypeLabel } from '../../../lib/format';

function getTypeIcon(type: IncidentType) {
  switch (type) {
    case 'flood':
      return <Droplets className="w-5 h-5 text-blue-600" aria-hidden="true" />;
    case 'fire':
      return <Flame className="w-5 h-5 text-red-600" aria-hidden="true" />;
    case 'medical':
      return <Stethoscope className="w-5 h-5 text-green-600" aria-hidden="true" />;
    default:
      return <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden="true" />;
  }
}

interface IncidentSummaryCardProps {
  incident: IncidentDetail;
}

export function IncidentSummaryCard({ incident }: IncidentSummaryCardProps) {
  return (
    <Card className="h-full flex flex-col justify-between">
      <div className="space-y-5">
        {/* Back Link */}
        <Link
          to={`/coordinator/incidents/${incident.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-brand-600 transition-colors focus-ring rounded"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to report
        </Link>

        {/* Title and Badges */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-gray-50 rounded-ui border border-gray-100">
              {getTypeIcon(incident.incident_type)}
            </div>
            <div>
              <span className="text-xs font-mono font-medium text-gray-500">
                {incident.tracking_ref ?? `INC-${incident.id}`}
              </span>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">
                {incidentTypeLabel(incident.incident_type)} Incident
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge type="incident" status={incident.status} />
          </div>
        </div>

        {/* Location & Time */}
        <div className="space-y-2 text-sm text-gray-600 border-t border-b border-gray-100 py-3">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <span className="font-medium text-gray-800">{incident.location}</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span>Reported {timeAgo(incident.created_at)}</span>
          </div>
        </div>

        {/* Description */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Description
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed bg-gray-50/70 p-3 rounded-ui border border-gray-100">
            {incident.description}
          </p>
        </div>

        {/* Reporter info if present */}
        {incident.reporter_phone && (
          <div className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">Reporter: </span>
            {incident.reporter_name ?? 'Anonymous'} ({incident.reporter_phone})
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-gray-100 text-[11px] text-gray-400">
        Coordinates: {incident.latitude?.toFixed(4) ?? '—'}, {incident.longitude?.toFixed(4) ?? '—'}
      </div>
    </Card>
  );
}
