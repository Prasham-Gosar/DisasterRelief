import type { TeamStatus, TeamType } from '../../lib/types';

export const dispatchKeys = {
  all: ['dispatch'] as const,
  incident: (id: string | number) => [...dispatchKeys.all, 'incident', String(id)] as const,
  availableTeams: (id: string | number) => [...dispatchKeys.all, 'availableTeams', String(id)] as const,
  assignments: (scope: string) => [...dispatchKeys.all, 'assignments', scope] as const,
  settings: () => [...dispatchKeys.all, 'settings'] as const,
  map: () => [...dispatchKeys.all, 'map'] as const,
  teams: (filters?: { status?: TeamStatus; team_type?: TeamType; page?: number; page_size?: number }) =>
    [...dispatchKeys.all, 'teams', filters] as const,
  team: (id: string | number) => [...dispatchKeys.all, 'team', String(id)] as const,
};
