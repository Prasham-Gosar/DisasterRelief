import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Modal, Button, Textarea, Select, Spinner, useToast } from '../../../components/ui';
import { fetchAvailableTeams, reassignTeam } from '../api';
import { dispatchKeys } from '../queryKeys';
import { ApiError } from '../../../lib/api';
import { teamTypeLabel } from '../../../lib/format';
import type { DispatchAssignment } from '../../../lib/types';

interface ReassignModalProps {
  open: boolean;
  onClose: () => void;
  assignment: DispatchAssignment | null;
}

export function ReassignModal({ open, onClose, assignment }: ReassignModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [touched, setTouched] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reportId = assignment?.report.id;
  const currentTeamId = assignment?.team.id;

  // Fetch available teams when opened
  const {
    data: availableData,
    isLoading: loadingTeams,
    isError: teamsError,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: reportId ? dispatchKeys.availableTeams(reportId) : ['dispatch', 'availableTeams'],
    queryFn: () => fetchAvailableTeams(reportId!),
    enabled: open && Boolean(reportId),
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedTeamId('');
      setReason('');
      setTouched(false);
      setErrorMessage(null);
    }
  }, [open]);

  // Exclude current assigned team
  const filteredTeams = (availableData?.items ?? []).filter(
    (t) => t.team_id !== currentTeamId,
  );

  const trimmedReason = reason.trim();
  const isReasonTooShort = trimmedReason.length < 5;
  const reasonError = touched && isReasonTooShort ? 'Reason must be at least 5 characters' : null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!reportId || !currentTeamId) throw new Error('Missing assignment details');
      return reassignTeam(reportId, {
        from_team_id: currentTeamId,
        to_team_id: selectedTeamId ? Number(selectedTeamId) : null,
        reason: trimmedReason,
      });
    },
    onSuccess: () => {
      toast('success', 'Incident successfully reassigned');
      // Invalidate board queries, map, teams, and available teams
      queryClient.invalidateQueries({ queryKey: dispatchKeys.all });
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === 'NO_TEAM_AVAILABLE') {
          setErrorMessage('No other team is available');
          return;
        }
        if (err.code === 'TEAM_NOT_AVAILABLE') {
          toast('error', 'Selected team is no longer available. Refreshing available list...');
          refetchTeams();
          return;
        }
        if (err.code === 'REMARK_REQUIRED') {
          setErrorMessage('A reason of at least 5 characters is required');
          return;
        }
        setErrorMessage(err.message);
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : 'Failed to reassign team');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (isReasonTooShort) return;
    setErrorMessage(null);
    mutation.mutate();
  };

  if (!assignment) return null;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      title={`Reassign Team for ${assignment.report.tracking_ref ?? `Report #${assignment.report.id}`}`}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isReasonTooShort || mutation.isPending}
            loading={mutation.isPending}
          >
            Confirm Reassignment
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current assignment info */}
        <div className="bg-gray-50 p-3 rounded-ui border border-gray-200 text-sm">
          <p className="text-gray-500 text-xs">Currently Assigned:</p>
          <p className="font-semibold text-gray-800">
            {assignment.team.name} ({teamTypeLabel(assignment.team.team_type)})
          </p>
        </div>

        {/* Available team selector */}
        <div>
          <label
            htmlFor="reassign-team-select"
            className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
          >
            Target Team
          </label>

          {loadingTeams ? (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
              <Spinner size="sm" />
              <span>Loading available teams...</span>
            </div>
          ) : teamsError ? (
            <div className="text-sm text-red-600 flex items-center justify-between">
              <span>Failed to load available teams.</span>
              <Button size="sm" variant="secondary" onClick={() => refetchTeams()}>
                Retry
              </Button>
            </div>
          ) : (
            <Select
              id="reassign-team-select"
              value={selectedTeamId}
              onChange={(e) => {
                setSelectedTeamId(e.target.value);
                setErrorMessage(null);
              }}
              disabled={mutation.isPending}
              className="w-full"
            >
              <option value="">Best available (system auto-rank)</option>
              {filteredTeams.map((team) => (
                <option key={team.team_id} value={team.team_id}>
                  {team.name} ({teamTypeLabel(team.team_type)}) — {team.member_count} members
                  {team.distance_km != null ? ` • ${team.distance_km.toFixed(1)} km` : ''}
                </option>
              ))}
            </Select>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Choose a replacement unit or keep &quot;Best available&quot; to auto-rank by proximity and type.
          </p>
        </div>

        {/* Reason for reassign (Required, min 5 chars) */}
        <div>
          <label
            htmlFor="reassign-reason"
            className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
          >
            Reason for Reassignment <span className="text-red-500">*</span>
          </label>
          <Textarea
            id="reassign-reason"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setErrorMessage(null);
            }}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Current team delayed due to road blockage; medical urgency escalating."
            hasError={Boolean(reasonError || errorMessage)}
            disabled={mutation.isPending}
            className="w-full"
          />

          <div className="flex items-center justify-between mt-1 text-xs">
            <span>
              {reasonError ? (
                <span className="text-red-600 font-medium">{reasonError}</span>
              ) : (
                <span className="text-gray-500">Minimum 5 characters required</span>
              )}
            </span>
            <span
              className={`font-mono ${
                trimmedReason.length < 5 ? 'text-amber-600' : 'text-green-600'
              }`}
            >
              {trimmedReason.length} / 5 min
            </span>
          </div>
        </div>

        {/* Friendly Error Banner */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-ui text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
