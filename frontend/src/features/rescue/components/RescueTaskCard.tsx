import { ExternalLink, Phone, Navigation, CheckCircle2, MapPin, Flame, Droplets, Stethoscope, AlertTriangle, RefreshCw } from 'lucide-react';
import type { RescueTask, IncidentType, AssignmentStatus } from '../../../lib/types';
import { Card, Button, Stepper, SeverityBadge, StatusBadge } from '../../../components/ui';
import { MapView, type MapMarker } from '../../../components/map/MapView';
import { incidentTypeLabel } from '../../../lib/format';

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

interface RescueTaskCardProps {
  task: RescueTask;
  effectiveStatus?: AssignmentStatus | string;
  hasPendingSync?: boolean;
  onUpdateStatus: (nextStatus: 'en_route' | 'on_site' | 'resolved') => void;
  isLoading: boolean;
}

export function RescueTaskCard({
  task,
  effectiveStatus,
  hasPendingSync = false,
  onUpdateStatus,
  isLoading,
}: RescueTaskCardProps) {
  const { report } = task;
  const currentStatus = effectiveStatus ?? task.status;
  const currentStep = getStepIndex(currentStatus);

  const hasCoords =
    report.latitude !== null &&
    report.latitude !== undefined &&
    report.longitude !== null &&
    report.longitude !== undefined;

  const mapMarkers: MapMarker[] = hasCoords
    ? [
        {
          id: 'incident',
          lat: report.latitude!,
          lng: report.longitude!,
          color: '#ef4444',
          label: report.tracking_ref ?? `Report #${report.id}`,
          popup: report.location,
        },
      ]
    : [];

  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(report.location)}`;

  return (
    <Card className="p-4 sm:p-6 space-y-6 shadow-sm border-gray-200">
      {/* Top Header & Status */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gray-50 rounded-ui border border-gray-100">
              {getTypeIcon(report.incident_type)}
            </div>
            <div>
              <span className="text-xs font-mono font-medium text-gray-400">
                {report.tracking_ref ?? `INC-${report.id}`}
              </span>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">
                {incidentTypeLabel(report.incident_type)} Emergency
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {hasPendingSync && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Pending sync
              </span>
            )}
            <SeverityBadge severity={report.severity} />
          </div>
        </div>

        {/* Current status indicator */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-500">Current Phase:</span>
          <StatusBadge type="assignment" status={currentStatus as AssignmentStatus} />
        </div>

        {/* Stepper Progress */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Stepper steps={STEPPER_STEPS} currentStep={currentStep} />
        </div>
      </div>

      {/* Location & Quick Action Links */}
      <div className="bg-gray-50 rounded-ui p-3.5 space-y-3 border border-gray-100">
        <div className="flex items-start gap-2 text-sm text-gray-800">
          <MapPin className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
          <span className="font-medium leading-snug">{report.location}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-200/60">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ui bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-brand-700 transition-colors focus-ring"
          >
            <Navigation className="w-3.5 h-3.5 text-brand-600" />
            Open in Google Maps
            <ExternalLink className="w-3 h-3 text-gray-400 ml-0.5" />
          </a>

          {report.reporter_phone && (
            <a
              href={`tel:${report.reporter_phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ui bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-brand-700 transition-colors focus-ring"
            >
              <Phone className="w-3.5 h-3.5 text-green-600" />
              Call reporter ({report.reporter_phone})
            </a>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Incident Briefing
        </h3>
        <p className="text-sm text-gray-700 bg-white p-3 rounded-ui border border-gray-100 leading-relaxed">
          {report.description}
        </p>
      </div>

      {/* Mini Map */}
      {hasCoords && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Target Location Pin
            </span>
          </div>
          <MapView
            markers={mapMarkers}
            center={[report.latitude!, report.longitude!]}
            zoom={14}
            className="h-[180px] sm:h-[220px]"
          />
        </div>
      )}

      {/* Action Buttons (Touch target >= 56px: min-h-[56px] h-14) */}
      <div className="pt-2">
        {currentStatus === 'assigned' && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => onUpdateStatus('en_route')}
            loading={isLoading}
            className="w-full min-h-[56px] h-14 text-base font-semibold shadow-md"
          >
            <Navigation className="w-5 h-5 mr-2" />
            I am en route
          </Button>
        )}

        {currentStatus === 'en_route' && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => onUpdateStatus('on_site')}
            loading={isLoading}
            className="w-full min-h-[56px] h-14 text-base font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-md"
          >
            <MapPin className="w-5 h-5 mr-2" />
            I am on site
          </Button>
        )}

        {currentStatus === 'on_site' && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => onUpdateStatus('resolved')}
            loading={isLoading}
            className="w-full min-h-[56px] h-14 text-base font-semibold bg-green-600 hover:bg-green-700 text-white shadow-md"
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            Mark resolved
          </Button>
        )}

        {currentStatus === 'resolved' && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-ui text-center text-sm font-semibold text-green-800">
            {hasPendingSync ? (
              <span>Resolved (Offline update queued for sync)</span>
            ) : (
              <span>Task completed successfully</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
