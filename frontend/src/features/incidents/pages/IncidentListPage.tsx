import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, Search, Copy as DuplicateIcon } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBanner, Select, SeverityBadge, Skeleton, StatusBadge } from '../../../components/ui';
import { INCIDENT_STATUSES, INCIDENT_TYPES, SEVERITIES } from '../../../lib/types';
import type { IncidentStatus, IncidentType, Severity } from '../../../lib/types';
import { incidentStatusLabel, incidentTypeLabel, severityLabel } from '../../../lib/format';
import { errorMessage, useIncidents, useIncidentStats } from '../api';
import { formatAge, isOverdueForVerification } from '../labels';
import type { IncidentFilters, IncidentListItem } from '../types';
import { IncidentTypeIcon } from '../components/IncidentTypeIcon';
import { SimplePagination } from '../components/SimplePagination';

const REFRESH_MS = 10_000; // PE-3: the queue refreshes every 10 seconds
const PAGE_SIZE = 20;

const DEFAULT_FILTERS: IncidentFilters = {
  status: '',
  severity: '',
  incident_type: '',
  q: '',
  possible_duplicate: false,
  page: 1,
  page_size: PAGE_SIZE,
};

const STATUS_TABS: { value: IncidentStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  ...INCIDENT_STATUSES.map((s) => ({ value: s, label: incidentStatusLabel(s) })),
];

/** Row colour by severity (left bar + soft background) */
const ROW_TONE: Record<Severity, string> = {
  critical: 'border-l-red-500 bg-red-50 hover:bg-red-100',
  high: 'border-l-orange-500 bg-orange-50/60 hover:bg-orange-100/70',
  medium: 'border-l-amber-400 bg-white hover:bg-amber-50',
  low: 'border-l-green-500 bg-white hover:bg-green-50',
};

/** Age text: red when a reported item has waited too long, amber when getting there */
function ageClass(item: IncidentListItem): string {
  if (isOverdueForVerification(item.status, item.age_minutes)) return 'font-semibold text-danger-600';
  if (item.status === 'reported' && item.age_minutes > 10) return 'font-medium text-amber-700';
  return 'text-gray-600';
}

export function IncidentListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<IncidentFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const query = useIncidents(filters, REFRESH_MS);
  const stats = useIncidentStats(REFRESH_MS);
  const { data, isPending, isError, error, isFetching, dataUpdatedAt, refetch } = query;

  // wait 400 ms after the last keystroke before searching (so we do not call the API on every letter)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 1 }));
    }, 400);
    return () => window.clearTimeout(t);
  }, [search]);

  // tick every second so "updated x s ago" stays honest
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const update = (patch: Partial<IncidentFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const clearFilters = () => {
    setSearch('');
    setFilters(DEFAULT_FILTERS);
  };
  const hasFilters = filters.status || filters.severity || filters.incident_type || filters.q || filters.possible_duplicate;

  const secondsAgo = dataUpdatedAt ? Math.max(0, Math.floor((now - dataUpdatedAt) / 1000)) : null;

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incident queue</h1>
          <p className="text-sm text-gray-600">Critical reports first, then the longest waiting.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {secondsAgo !== null && <span>Updated {secondsAgo} s ago</span>}
          <Button variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh now">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </Button>
        </div>
      </div>

      {/* ───────── stat cards (click to filter) ───────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        {[
          { label: 'Reported', value: stats.data?.by_status.reported, tone: 'text-blue-700', onClick: () => update({ status: 'reported' }) },
          { label: 'Verified', value: stats.data?.by_status.verified, tone: 'text-purple-700', onClick: () => update({ status: 'verified' }) },
          {
            label: 'In progress',
            value: stats.data?.by_status.in_progress,
            tone: 'text-orange-700',
            onClick: () => update({ status: 'in_progress' }),
          },
          { label: 'Critical open', value: stats.data?.critical_open, tone: 'text-danger-700', onClick: () => update({ severity: 'critical', status: '' }) },
        ].map((c) => (
          <button key={c.label} type="button" onClick={c.onClick} className="rounded-ui border border-gray-200 bg-white p-3 text-left shadow-sm hover:bg-gray-50 focus-ring sm:p-4">
            <span className="block text-xs font-medium uppercase text-gray-500">{c.label}</span>
            <span className={`block text-2xl font-bold ${c.tone}`}>{stats.isError ? '–' : (c.value ?? '…')}</span>
          </button>
        ))}
      </div>

      {/* ───────── filter bar ───────── */}
      <Card className="space-y-3" padding={false}>
        <div className="space-y-3 p-3 sm:p-4">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => {
              const active = filters.status === tab.value;
              return (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => update({ status: tab.value })}
                  className={`min-h-[36px] shrink-0 rounded-full px-3 text-sm font-medium focus-ring ${active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ref, location, text"
                aria-label="Search reports"
                className="block min-h-[44px] w-full rounded-ui border border-gray-300 py-2 pl-9 pr-3 text-sm hover:border-gray-400 focus-ring"
              />
            </div>
            <Select aria-label="Filter by severity" value={filters.severity} onChange={(e) => update({ severity: e.target.value as Severity | '' })}>
              <option value="">All severities</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{severityLabel(s)}</option>)}
            </Select>
            <Select aria-label="Filter by type" value={filters.incident_type} onChange={(e) => update({ incident_type: e.target.value as IncidentType | '' })}>
              <option value="">All types</option>
              {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{incidentTypeLabel(t)}</option>)}
            </Select>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={filters.possible_duplicate}
                onChange={(e) => update({ possible_duplicate: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              Possible duplicates only
            </label>
          </div>
        </div>
      </Card>

      {/* ───────── results ───────── */}
      {isError && !data && (
        <div className="space-y-3">
          <ErrorBanner dismissible={false} message={errorMessage(error)} />
          <Button variant="secondary" onClick={() => void refetch()}>Try again</Button>
        </div>
      )}
      {isError && data && <ErrorBanner dismissible={false} message="Could not refresh. Showing the last data we received." />}

      {isPending && !isError && (
        <Card><Skeleton lines={8} /></Card>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <EmptyState
            title={hasFilters ? 'No reports match these filters' : 'No reports yet'}
            description={hasFilters ? 'Try removing a filter or searching for something else.' : 'New reports will appear here automatically.'}
            action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                  <th scope="col" className="px-4 py-3 font-medium">Type</th>
                  <th scope="col" className="px-4 py-3 font-medium">Severity</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Location</th>
                  <th scope="col" className="px-4 py-3 font-medium">Waiting</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/coordinator/incidents/${item.id}`)}
                    className={`cursor-pointer border-l-4 transition-colors ${ROW_TONE[item.severity]}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/coordinator/incidents/${item.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-brand-700 hover:underline focus-ring rounded"
                      >
                        {item.tracking_ref ?? `#${item.id}`}
                      </Link>
                      {item.possible_duplicate && (
                        <div className="mt-1">
                          <Badge color="purple"><DuplicateIcon className="h-3 w-3" aria-hidden="true" /> Possible duplicate</Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-gray-800">
                        <IncidentTypeIcon type={item.incident_type} className="h-4 w-4 text-gray-500" />
                        {incidentTypeLabel(item.incident_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3"><SeverityBadge severity={item.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge type="incident" status={item.status} /></td>
                    <td className="max-w-[260px] px-4 py-3 text-gray-700">
                      <span className="line-clamp-2">{item.location}</span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 ${ageClass(item)}`}>
                      <span className="inline-flex items-center gap-1">
                        {isOverdueForVerification(item.status, item.age_minutes) && <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                        {formatAge(item.age_minutes)}
                        {isOverdueForVerification(item.status, item.age_minutes) && <span className="sr-only"> (waiting longer than 30 minutes)</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-200 px-3">
            <SimplePagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
          </div>
        </Card>
      )}
    </div>
  );
}
