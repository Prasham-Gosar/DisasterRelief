export const dispatchKeys = {
  all: ['dispatch'] as const,
  incident: (id: string | number) => [...dispatchKeys.all, 'incident', String(id)] as const,
  availableTeams: (id: string | number) => [...dispatchKeys.all, 'availableTeams', String(id)] as const,
};
