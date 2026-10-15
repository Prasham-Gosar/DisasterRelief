import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Filter, RefreshCw, ExternalLink } from 'lucide-react';
import {
  DataTable,
  Badge,
  StatusBadge,
  Button,
  Pagination,
  ErrorBanner,
  Select,
} from '../../../components/ui';
import type { Column } from '../../../components/ui/DataTable';
import { fetchTeams } from '../api';
import { dispatchKeys } from '../queryKeys';
import { teamTypeLabel } from '../../../lib/format';
import type { TeamListItem, TeamStatus, TeamType } from '../../../lib/types';

export function TeamsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  const queryParams = {
    status: statusFilter !== 'all' ? (statusFilter as TeamStatus) : undefined,
    team_type: typeFilter !== 'all' ? (typeFilter as TeamType) : undefined,
    page,
    page_size: pageSize,
  };

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: dispatchKeys.teams(queryParams),
    queryFn: () => fetchTeams(queryParams),
    refetchInterval: 15_000,
  });

  const teams = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<TeamListItem>[] = [
    {
      header: 'Team Name',
      cell: (row: TeamListItem) => (
        <div>
          <Link
            to={`/coordinator/teams/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-bold text-gray-900 hover:text-brand-600 focus-ring"
          >
            {row.name}
          </Link>
          {row.public_code && (
            <span className="block text-xs text-gray-400 font-mono">
              {row.public_code}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (row: TeamListItem) => (
        <Badge color="blue">
          {teamTypeLabel(row.team_type)}
        </Badge>
      ),
    },
    {
      header: 'Status',
      cell: (row: TeamListItem) => (
        <StatusBadge type="team" status={row.status} />
      ),
    },
    {
      header: 'Members',
      cell: (row: TeamListItem) => (
        <span className="font-semibold text-gray-700">
          {row.member_count} member{row.member_count === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      header: 'Current Incident',
      cell: (row: TeamListItem) => {
        if (!row.current_report_id) {
          return <span className="text-gray-400 text-xs">—</span>;
        }
        return (
          <Link
            to={`/coordinator/incidents/${row.current_report_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-brand-600 hover:text-brand-800 underline focus-ring"
          >
            Incident #{row.current_report_id}
            <ExternalLink className="w-3 h-3" />
          </Link>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Rescue Teams</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of rescue units, capability specializations, readiness status, and deployments.
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
          Refresh
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-ui border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-semibold text-gray-700 text-xs uppercase tracking-wider">
            Filters:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-status" className="text-xs text-gray-500">
              Status:
            </label>
            <Select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs py-1"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="deployed">Dispatched</option>
            </Select>
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-type" className="text-xs text-gray-500">
              Type:
            </label>
            <Select
              id="filter-type"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs py-1"
            >
              <option value="all">All Types</option>
              <option value="fire">Fire</option>
              <option value="medical">Medical</option>
              <option value="ndrf">NDRF</option>
              <option value="local">Local</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="space-y-3">
          <ErrorBanner
            message={error instanceof Error ? error.message : 'Failed to load rescue teams'}
          />
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={teams}
        loading={isLoading}
        onRowClick={(row) => navigate(`/coordinator/teams/${row.id}`)}
        emptyMessage="No rescue teams found matching the selected filters"
      />

      {/* Pagination */}
      {total > pageSize && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={(p: number) => setPage(p)}
        />
      )}
    </div>
  );
}
