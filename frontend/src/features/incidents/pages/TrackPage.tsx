import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { Button, Card, ErrorBanner, FormField, Input, SeverityBadge, Skeleton, StatusBadge } from '../../../components/ui';
import { formatDateTime, incidentTypeLabel } from '../../../lib/format';
import { ApiError } from '../../../lib/api';
import { errorMessage, useTrack } from '../api';
import { timelineActionLabel } from '../labels';
import { normalizePhone } from '../schemas';
import { IncidentTypeIcon } from '../components/IncidentTypeIcon';
import { StatusSteps } from '../components/StatusSteps';

export function TrackPage() {
  const [params] = useSearchParams();
  const [ref, setRef] = useState(params.get('ref') ?? '');
  const [phone, setPhone] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  // what was actually submitted (the query only runs after the person presses "Check status")
  const [submitted, setSubmitted] = useState<{ ref: string; phone: string } | null>(null);

  const query = useTrack(submitted?.ref ?? '', submitted?.phone ?? '', submitted !== null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRef = ref.trim().toUpperCase();
    const cleanPhone = normalizePhone(phone);
    if (!cleanRef) return setFieldError('Enter your tracking number, for example DRR-2026-000017.');
    if (!cleanPhone) return setFieldError('Enter the 10-digit mobile number you used when reporting.');
    setFieldError(null);
    setSubmitted({ ref: cleanRef, phone: cleanPhone });
  };

  const notFound = query.error instanceof ApiError && query.error.status === 404;
  const data = query.data;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Track my report</h1>
        <p className="mt-1 text-sm text-gray-600">Enter your tracking number and the phone number you reported with.</p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Tracking number" required>
            {(p) => <Input {...p} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="DRR-2026-000017" autoCapitalize="characters" />}
          </FormField>
          <FormField label="Phone number" required>
            {(p) => <Input {...p} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" />}
          </FormField>
          {fieldError && <p className="text-sm text-danger-600" role="alert">{fieldError}</p>}
          <Button type="submit" loading={query.isFetching && !data} className="w-full sm:w-auto">
            <Search className="h-4 w-4" aria-hidden="true" /> Check status
          </Button>
        </form>
      </Card>

      {query.isLoading && <Card><Skeleton lines={4} /></Card>}

      {query.isError && (
        notFound ? (
          // SE-3: the server answers 404 for a wrong ref OR a wrong phone, so we say the same thing
          <ErrorBanner dismissible={false} message="We could not find a report with that tracking number and phone number. Please check both and try again." />
        ) : (
          <ErrorBanner dismissible={false} message={errorMessage(query.error)} />
        )
      )}

      {data && (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-gray-500">Tracking number</p>
              <p className="text-xl font-bold text-gray-900">{data.tracking_ref}</p>
            </div>
            <div className="flex items-center gap-2">
              <SeverityBadge severity={data.severity} />
              <StatusBadge type="incident" status={data.status} />
            </div>
          </div>

          {data.status === 'rejected' ? (
            <div className="rounded-ui border border-danger-200 bg-danger-50 p-4" role="status">
              <p className="font-semibold text-danger-800">This report was rejected</p>
              <p className="mt-1 text-sm text-danger-700">{data.remark ?? 'No reason was given.'}</p>
              <p className="mt-2 text-sm text-gray-600">If this is a real emergency, please submit a new report or call 112.</p>
            </div>
          ) : (
            <StatusSteps status={data.status} />
          )}

          <div className="space-y-1 text-sm text-gray-700">
            <p className="flex items-center gap-2 font-medium text-gray-900">
              <IncidentTypeIcon type={data.incident_type} className="h-4 w-4 text-gray-500" />
              {incidentTypeLabel(data.incident_type)}: {data.location}
            </p>
            <p className="text-gray-600">{data.description}</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Updates</h2>
              <Button variant="ghost" size="sm" onClick={() => void query.refetch()} loading={query.isFetching}>
                {!query.isFetching && <RefreshCw className="h-4 w-4" aria-hidden="true" />} Refresh
              </Button>
            </div>
            <ul className="space-y-3 border-l-2 border-gray-200 pl-4">
              {[...data.timeline].reverse().map((item, i) => (
                <li key={`${item.created_at}-${i}`} className="relative">
                  <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600" aria-hidden="true" />
                  <p className="text-sm font-medium text-gray-900">{timelineActionLabel(item.action)}</p>
                  {item.remark && <p className="text-sm text-gray-600">{item.remark}</p>}
                  <p className="text-xs text-gray-500">{formatDateTime(item.created_at)}</p>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}
