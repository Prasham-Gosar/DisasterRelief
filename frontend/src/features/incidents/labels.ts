import type { IncidentStatus, Severity } from '../../lib/types';

/** Friendly wording for audit-log actions (shown on the citizen's tracking page) */
const ACTION_LABELS: Record<string, string> = {
  create: 'Report received',
  verify: 'Verified by a coordinator',
  reject: 'Report rejected',
  assign: 'Rescue team assigned',
  reassign: 'Rescue team changed',
  en_route: 'Rescue team is on the way',
  on_site: 'Rescue team reached the location',
  resolve: 'Incident resolved',
  close: 'Report closed',
  edit: 'Report details edited',
};
export const timelineActionLabel = (action: string): string => ACTION_LABELS[action] ?? action;

/** Short explanation under each severity card on the report form */
export const SEVERITY_HELP: Record<Severity, string> = {
  low: 'No one is in danger right now',
  medium: 'Needs attention soon',
  high: 'People or property at serious risk',
  critical: 'Life is in immediate danger',
};

/** Hex colours that match tailwind.config.ts (used for map markers) */
export const SEVERITY_HEX: Record<Severity, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

/** Labels for the type-specific field returned by the backend */
export const TYPE_SPECIFIC_LABELS: Record<string, string> = {
  water_level: 'Water level',
  structure_type: 'Structure type',
  casualty_count: 'People hurt',
};

/** "42 min", "3 h 5 min", "2 days" */
export function formatAge(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }
  const d = Math.floor(minutes / 1440);
  return `${d} day${d > 1 ? 's' : ''}`;
}

/** A report that is still waiting for a coordinator and has been for a while */
export const isOverdueForVerification = (status: IncidentStatus, ageMinutes: number): boolean =>
  status === 'reported' && ageMinutes > 30;
