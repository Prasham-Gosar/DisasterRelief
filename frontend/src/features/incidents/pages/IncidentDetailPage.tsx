import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Lock, Phone, Send, XCircle, Copy as DuplicateIcon } from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorBanner, Modal, SeverityBadge, Skeleton, StatusBadge, Timeline, useToast,
} from '../../../components/ui';
import { MapView } from '../../../components/map/MapView';
import { ApiError } from '../../../lib/api';
import { formatDateTime, incidentStatusLabel, incidentTypeLabel } from '../../../lib/format';
import { errorMessage, useClose, useHistory, useIncident, useNearby, useReject, useVerify } from '../api';
import { timelineActionLabel } from '../labels';
import { formatAge, SEVERITY_HEX, TYPE_SPECIFIC_LABELS } from '../labels';
import { IncidentTypeIcon } from '../components/IncidentTypeIcon';
import { RejectModal } from '../components/RejectModal';

/** A button that stays visible but disabled, with a tooltip that says why */
function ActionButton({ reason, children, ...rest }: { reason: string | null; children: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <span title={reason ?? undefined} className="inline-flex">
      <Button {...rest} disabled={rest.disabled || reason !== null} aria-disabled={reason !== null || rest.disabled}>
        {children}
      </Button>
    </span>
  );
}

export function IncidentDetailPage() {
  const { id } = useParams();
  const incidentId = Number(id);
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: report, isPending, isError, error, refetch } = useIncident(incidentId);
  const verify = useVerify(incidentId);
  const reject = useReject(incidentId);
  const close = useClose(incidentId);
  const nearby = useNearby(incidentId);
  const history = useHistory(incidentId);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const back = (
    <Link to="/coordinator/incidents" className="inline-flex items-center gap-1 rounded text-sm font-medium text-brand-700 hover:underline focus-ring">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to queue
    </Link>
  );

  if (!Number.isFinite(incidentId)) {
    return <EmptyState title="That report link is not valid" action={back} />;
  }
  if (isPending) {
    return <div className="space-y-4 py-2">{back}<Card><Skeleton lines={6} /></Card></div>;
  }
  if (isError || !report) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-4 py-2">
        {back}
        {missing ? (
          <EmptyState title="Report not found" description="It may have been removed, or the link is wrong." />
        ) : (
          <>
            <ErrorBanner dismissible={false} message={errorMessage(error)} />
            <Button variant="secondary" onClick={() => void refetch()}>Try again</Button>
          </>
        )}
      </div>
    );
  }

  const { status } = report;
  const hasPin = report.latitude !== null && report.longitude !== null;

  // Which buttons are allowed right now? (null = allowed, text = the reason it is disabled)
  const verifyReason = status === 'reported' ? null : `Only reports that are still "Reported" can be verified (this one is ${incidentStatusLabel(status)}).`;
  const rejectReason = status === 'reported' || status === 'verified' ? null : `A report that is ${incidentStatusLabel(status)} can no longer be rejected.`;
  const dispatchReason =
    status === 'verified' ? null : status === 'reported' ? 'Verify the report first, then you can dispatch a team.' : status === 'rejected' || status === 'closed' ? `This report is ${incidentStatusLabel(status)}.` : 'A team has already been assigned. Use the Operations page for changes.';

  const onVerify = () =>
    verify.mutate(undefined, {
      onSuccess: () => toast('success', 'Report verified. The citizen has been notified.'),
      onError: (err) => toast('error', errorMessage(err)),
    });

  const onReject = (remark: string) =>
    reject.mutate(remark, {
      onSuccess: () => {
        setRejectOpen(false);
        toast('success', 'Report rejected. The citizen has been told why.');
      },
      onError: (err) => toast('error', errorMessage(err)),
    });

  const onClose = () =>
    close.mutate(undefined, {
      onSuccess: () => {
        setCloseOpen(false);
        toast('success', 'Report closed.');
      },
      onError: (err) => {
        setCloseOpen(false);
        toast('error', errorMessage(err));
      },
    });

  return (
    <div className="space-y-4 py-2">
      {back}

      {/* ───────── header + actions ───────── */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-gray-500">
              <IncidentTypeIcon type={report.incident_type} className="h-5 w-5" />
              <span className="text-sm font-medium">{incidentTypeLabel(report.incident_type)} report</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{report.tracking_ref ?? `Report #${report.id}`}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={report.severity} />
              <StatusBadge type="incident" status={status} />
              {report.possible_duplicate && <Badge color="purple"><DuplicateIcon className="h-3 w-3" aria-hidden="true" /> Possible duplicate</Badge>}
              <span className="text-xs text-gray-500">Waiting {formatAge(report.age_minutes)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Report actions">
            <ActionButton reason={verifyReason} onClick={onVerify} loading={verify.isPending}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Verify
            </ActionButton>
            <ActionButton reason={rejectReason} variant="danger" onClick={() => setRejectOpen(true)}>
              <XCircle className="h-4 w-4" aria-hidden="true" /> Reject
            </ActionButton>
            <ActionButton reason={dispatchReason} variant="secondary" onClick={() => navigate(`/coordinator/dispatch/${report.id}`)}>
              <Send className="h-4 w-4" aria-hidden="true" /> Dispatch
            </ActionButton>
            {status === 'resolved' && (
              <Button variant="secondary" onClick={() => setCloseOpen(true)}>
                <Lock className="h-4 w-4" aria-hidden="true" /> Close report
              </Button>
            )}
          </div>
        </div>

        {report.possible_duplicate && (
          <p className="rounded-ui bg-purple-50 px-3 py-2 text-sm text-purple-900">
            This looks like another report filed nearby recently
            {report.duplicate_of_id ? (
              <> (<Link to={`/coordinator/incidents/${report.duplicate_of_id}`} className="font-medium underline">open report #{report.duplicate_of_id}</Link>)</>
            ) : null}
            . Compare them before verifying.
          </p>
        )}

        {status === 'rejected' && report.remark && (
          <p className="rounded-ui border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
            <span className="font-semibold">Rejected: </span>{report.remark}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ───────── left: facts ───────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="What was reported" />
            <dl className="space-y-3 text-sm">
              <Row label="Description" value={report.description} />
              <Row label="Location" value={report.location} />
              {Object.entries(report.type_specific).map(([key, value]) => (
                <Row key={key} label={TYPE_SPECIFIC_LABELS[key] ?? key} value={value === null ? '-' : String(value)} />
              ))}
              <Row label="Reported" value={formatDateTime(report.created_at)} />
              {report.verified_at && <Row label="Verified" value={`${formatDateTime(report.verified_at)}${report.verified_by ? ` by ${report.verified_by}` : ''}`} />}
              {report.resolved_at && <Row label="Resolved" value={formatDateTime(report.resolved_at)} />}
              {report.closing_note && <Row label="Closing note" value={report.closing_note} />}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Reporter" />
            <dl className="space-y-3 text-sm">
              <Row label="Name" value={report.reporter_name || 'Not given'} />
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-gray-500">Phone</dt>
                <dd>
                  {report.reporter_phone ? (
                    <a href={`tel:${report.reporter_phone}`} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline focus-ring rounded">
                      <Phone className="h-4 w-4" aria-hidden="true" /> {report.reporter_phone}
                    </a>
                  ) : '-'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Similar reports nearby" description="Same type, within 200 m and 2 hours" />
            {nearby.isPending ? (
              <Skeleton lines={2} />
            ) : nearby.isError ? (
              <p className="text-sm text-danger-700">Could not load nearby reports.</p>
            ) : (nearby.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No similar reports nearby.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {(nearby.data ?? []).map((n) => (
                  <li key={n.id}>
                    <Link to={`/coordinator/incidents/${n.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded py-2 hover:bg-gray-50 focus-ring">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{n.tracking_ref ?? `#${n.id}`} · {n.location}</span>
                        <span className="block text-xs text-gray-500">{n.distance_m} m away · {formatAge(n.minutes_apart)} apart</span>
                      </span>
                      <span className="flex items-center gap-1.5"><SeverityBadge severity={n.severity} /><StatusBadge type="incident" status={n.status} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="History" description="Who did what, and when" />
            {history.isPending ? (
              <Skeleton lines={3} />
            ) : history.isError ? (
              <p className="text-sm text-danger-700">Could not load the history.</p>
            ) : (
              <Timeline
                items={(history.data ?? []).map((h, i, all) => ({
                  id: h.id,
                  title: timelineActionLabel(h.action),
                  time: formatDateTime(h.created_at),
                  status: i === all.length - 1 ? 'current' : 'done',
                  detail: (
                    <>
                      <span className="text-xs text-gray-500">by {h.actor}</span>
                      {h.remark && <p>{h.remark}</p>}
                    </>
                  ),
                }))}
              />
            )}
          </Card>
        </div>

        {/* ───────── right: map + photos ───────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Map" />
            {hasPin ? (
              <MapView
                key={report.id}
                className="!h-[280px] md:!h-[320px]"
                center={[report.latitude as number, report.longitude as number]}
                zoom={16}
                markers={[{ id: report.id, lat: report.latitude as number, lng: report.longitude as number, color: SEVERITY_HEX[report.severity], label: report.tracking_ref ?? `#${report.id}`, popup: report.location }]}
              />
            ) : (
              <p className="text-sm text-gray-500">The reporter did not drop a map pin. Use the address above.</p>
            )}
          </Card>

          <Card>
            <CardHeader title={`Photos (${report.photos.length})`} />
            {report.photos.length === 0 ? (
              <p className="text-sm text-gray-500">No photos were attached.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {report.photos.map((src, i) => (
                  <button key={src} type="button" onClick={() => setLightbox(i)} className="aspect-square overflow-hidden rounded-ui border border-gray-200 focus-ring" aria-label={`Open photo ${i + 1}`}>
                    <img src={src} alt={`Report photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ───────── dialogs ───────── */}
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={onReject}
        loading={reject.isPending}
        serverError={reject.isError ? errorMessage(reject.error) : null}
      />

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onConfirm={onClose}
        loading={close.isPending}
        title="Close this report?"
        message="The incident is resolved. Closing it removes it from the active queue."
        confirmLabel="Close report"
      />

      <Modal open={lightbox !== null} onClose={() => setLightbox(null)} title={lightbox !== null ? `Photo ${lightbox + 1} of ${report.photos.length}` : 'Photo'}>
        {lightbox !== null && <img src={report.photos[lightbox]} alt={`Report photo ${lightbox + 1}`} className="max-h-[70vh] w-full rounded-ui object-contain" />}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{value}</dd>
    </div>
  );
}
