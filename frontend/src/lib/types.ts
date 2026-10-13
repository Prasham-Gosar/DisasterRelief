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

// ── Incident Models ──

export interface IncidentDetail {
  id: number;
  tracking_ref?: string | null;
  incident_type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  description: string;
  reporter_name?: string | null;
  reporter_phone?: string | null;
  photos?: string[];
  type_specific?: Record<string, unknown>;
  remark?: string | null;
  closing_note?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  possible_duplicate?: boolean;
  duplicate_of_id?: number | null;
  age_minutes?: number;
  citizen_subscribed?: boolean;
}

// ── Dispatch Models ──

export interface AvailableTeam {
  team_id: number;
  name: string;
  team_type: TeamType;
  distance_km?: number | null;
  member_count: number;
  suitable: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AvailableTeamsResponse {
  report_id: number;
  items: AvailableTeam[];
}

export interface AssignmentResult {
  assignment_id: number;
  team: {
    id: number;
    name: string;
    status: string;
  };
  members_acknowledged: number;
  current_location: {
    latitude?: number | null;
    longitude?: number | null;
  };
}

export interface AssignResponse {
  report_id: number;
  report_status: string;
  assignments: AssignmentResult[];
}

// ── Notification Models ──

export interface NotificationItem {
  id: number;
  message: string;
  channel: Channel;
  alert_type: AlertType;
  recipient_user_id?: number | null;
  recipient_phone?: string | null;
  related_report_id?: number | null;
  is_read: boolean;
  delivery_status?: string;
  sent_at?: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  page: number;
  page_size: number;
  unread_count?: number;
}

// ── Rescue Team Models ──

export interface TaskTeam {
  id: number;
  name: string;
}

export interface TaskReport {
  id: number;
  tracking_ref?: string | null;
  incident_type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  description: string;
  reporter_phone?: string | null;
}

export interface RescueTask {
  assignment_id: number;
  status: AssignmentStatus;
  assigned_at?: string | null;
  en_route_at?: string | null;
  on_site_at?: string | null;
  team: TaskTeam;
  report: TaskReport;
}
