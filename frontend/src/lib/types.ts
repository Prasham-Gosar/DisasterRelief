// ── Enum arrays + union types (mirrors backend exactly) ──

export const ROLES = ['citizen', 'coordinator', 'rescue_team_member', 'system_administrator', 'volunteer'] as const;
export type Role = (typeof ROLES)[number];

export const INCIDENT_TYPES = ['flood', 'fire', 'medical'] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INCIDENT_STATUSES = ['reported', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected', 'closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const TEAM_TYPES = ['fire', 'medical', 'ndrf', 'local'] as const;
export type TeamType = (typeof TEAM_TYPES)[number];

export const TEAM_STATUSES = ['available', 'deployed'] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const MEMBER_STATUSES = ['available', 'assigned', 'en_route', 'on_site'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ['assigned', 'en_route', 'on_site', 'resolved', 'reassigned'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const CHANNELS = ['sms', 'push', 'email', 'in_app'] as const;
export type Channel = (typeof CHANNELS)[number];

export const ALERT_TYPES = [
  'new_report',
  'verification',
  'rejection',
  'status_update',
  'team_deployed',
  'no_team_available',
  'task_assigned',
  'overdue',
  'incident_resolved',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

// ── Domain models ──

export interface User {
  id: number;
  name: string;
  role: Role;
  public_code: string;
  email: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
