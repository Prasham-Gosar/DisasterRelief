import { useState } from 'react';
import { Users, Navigation, Sparkles, Shield } from 'lucide-react';
import type { AvailableTeam, TeamType } from '../../../lib/types';
import { Card, Button, Badge, ConfirmDialog } from '../../../components/ui';
import { teamTypeLabel } from '../../../lib/format';

function getTeamTypeBadge(type: TeamType) {
  switch (type) {
    case 'fire':
      return <Badge color="red">{teamTypeLabel(type)}</Badge>;
    case 'medical':
      return <Badge color="blue">{teamTypeLabel(type)}</Badge>;
    case 'ndrf':
      return <Badge color="green">{teamTypeLabel(type)}</Badge>;
    case 'local':
      return <Badge color="purple">{teamTypeLabel(type)}</Badge>;
    default:
      return <Badge color="gray">{teamTypeLabel(type)}</Badge>;
  }
}

interface RankedTeamListProps {
  teams: AvailableTeam[];
  selectedIds: number[];
  onToggleSelect: (teamId: number) => void;
  onAssign: (selectedIds: number[]) => void;
  isAssigning: boolean;
  disabled?: boolean;
}

export function RankedTeamList({
  teams,
  selectedIds,
  onToggleSelect,
  onAssign,
  isAssigning,
  disabled = false,
}: RankedTeamListProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Find index of first suitable team
  const firstSuitableIndex = teams.findIndex((t) => t.suitable);

  const selectedTeams = teams.filter((t) => selectedIds.includes(t.team_id));

  const handleConfirmAssign = () => {
    setConfirmOpen(false);
    onAssign(selectedIds);
  };

  return (
    <Card className="h-full flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">Available Teams</h3>
            <p className="text-xs text-gray-500">
              Ranked by suitability and travel distance
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
            {teams.length} found
          </span>
        </div>

        {/* Team Items */}
        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
          {teams.map((team, idx) => {
            const isSelected = selectedIds.includes(team.team_id);
            const isBestMatch = idx === firstSuitableIndex;

            return (
              <div
                key={team.team_id}
                onClick={() => !disabled && onToggleSelect(team.team_id)}
                className={`
                  p-3.5 rounded-ui border transition-all select-none
                  ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200' : 'cursor-pointer'}
                  ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50/50 shadow-sm ring-1 ring-brand-500'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => !disabled && onToggleSelect(team.team_id)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer disabled:cursor-not-allowed"
                      aria-label={`Select ${team.name}`}
                    />
                  </div>

                  {/* Team details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {team.name}
                      </span>
                      {getTeamTypeBadge(team.team_type)}
                      {isBestMatch && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          <Sparkles className="w-3 h-3" />
                          Best match
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Navigation className="w-3.5 h-3.5 text-gray-400" />
                        {team.distance_km !== null && team.distance_km !== undefined
                          ? `${team.distance_km} km`
                          : 'Unknown distance'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {team.member_count} ready
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
        <Button
          variant="primary"
          size="lg"
          onClick={() => setConfirmOpen(true)}
          disabled={disabled || selectedIds.length === 0 || isAssigning}
          loading={isAssigning}
          className="w-full"
        >
          <Shield className="w-4 h-4 mr-2" />
          Assign {selectedIds.length > 0 ? `Selected (${selectedIds.length})` : 'Team'}
        </Button>

        {selectedIds.length > 0 && (
          <p className="text-center text-xs text-gray-500">
            {selectedIds.length} team{selectedIds.length > 1 ? 's' : ''} will be notified immediately upon dispatch
          </p>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmAssign}
        title="Confirm Emergency Dispatch"
        message={`Are you sure you want to dispatch ${selectedTeams.map((t) => t.name).join(', ')} to this incident? Team members and coordinators will be alerted.`}
        confirmLabel="Confirm & Dispatch"
        loading={isAssigning}
      />
    </Card>
  );
}
