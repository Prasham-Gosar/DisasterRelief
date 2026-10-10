import { formatDistanceToNow, format, isValid, parseISO } from 'date-fns';
import type {
  IncidentStatus,
  IncidentType,
  TeamStatus,
  TeamType,
  MemberStatus,
  AssignmentStatus,
  Severity,
  Role,
  Channel,
} from './types';

// ── Role labels ──
const ROLE_LABELS: Record<Role, string> = {
  citizen: 'Citizen',
  coordinator: 'Coordinator',
  rescue_team_member: 'Rescue Team Member',
  system_administrator: 'System Administrator',
  volunteer: 'Volunteer',
};
export const roleLabel = (r: Role): string => ROLE_LABELS[r] ?? r;

// ── Incident type labels ──
const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  flood: 'Flood',
  fire: 'Fire',
  medical: 'Medical',
};
export const incidentTypeLabel = (t: IncidentType): string => INCIDENT_TYPE_LABELS[t] ?? t;

// ── Severity labels ──
const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};
export const severityLabel = (s: Severity): string => SEVERITY_LABELS[s] ?? s;

// ── Incident status labels ──
const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  reported: 'Reported',
  verified: 'Verified',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
  closed: 'Closed',
};
export const incidentStatusLabel = (s: IncidentStatus): string => INCIDENT_STATUS_LABELS[s] ?? s;

// ── Team type labels ──
const TEAM_TYPE_LABELS: Record<TeamType, string> = {
  fire: 'Fire',
  medical: 'Medical',
  ndrf: 'NDRF',
  local: 'Local',
};
export const teamTypeLabel = (t: TeamType): string => TEAM_TYPE_LABELS[t] ?? t;

// ── Team status labels (deployed → Dispatched) ──
const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  available: 'Available',
  deployed: 'Dispatched',
};
export const teamStatusLabel = (s: TeamStatus): string => TEAM_STATUS_LABELS[s] ?? s;

// ── Member status labels ──
const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  available: 'Available',
  assigned: 'Assigned',
  en_route: 'En Route',
  on_site: 'On Site',
};
export const memberStatusLabel = (s: MemberStatus): string => MEMBER_STATUS_LABELS[s] ?? s;

// ── Assignment status labels ──
const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  assigned: 'Assigned',
  en_route: 'En Route',
  on_site: 'On Site',
  resolved: 'Resolved',
  reassigned: 'Reassigned',
};
export const assignmentStatusLabel = (s: AssignmentStatus): string =>
  ASSIGNMENT_STATUS_LABELS[s] ?? s;

// ── Channel labels ──
const CHANNEL_LABELS: Record<Channel, string> = {
  sms: 'SMS',
  push: 'Push',
  email: 'Email',
  in_app: 'In-App',
};
export const channelLabel = (c: Channel): string => CHANNEL_LABELS[c] ?? c;

// ── Date / time helpers ──

/** Parse an ISO-8601 string to a Date, return null if invalid */
export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}

/** "3 hours ago" style */
export function timeAgo(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return '—';
  return formatDistanceToNow(d, { addSuffix: true });
}

/** "11 Oct 2026, 14:30" */
export function formatDateTime(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return '—';
  return format(d, 'd MMM yyyy, HH:mm');
}

/** "11 Oct 2026" */
export function formatDateOnly(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return '—';
  return format(d, 'd MMM yyyy');
}

// ── Distance formatter ──
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}