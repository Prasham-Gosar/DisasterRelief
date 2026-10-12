import type { IncidentStatus, IncidentType, Severity } from '../../lib/types';

/** One row of GET /api/incidents */
export interface IncidentListItem {
  id: number;
  tracking_ref: string | null;
  incident_type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  location: string;
  latitude: number | null;
  longitude: number | null;
  description: string;
  possible_duplicate: boolean;
  duplicate_of_id: number | null;
  created_at: string;
  age_minutes: number;
}

/** GET /api/incidents/{id} (also returned by verify / reject / close) */
export interface IncidentDetail extends IncidentListItem {
  reporter_name: string | null;
  reporter_phone: string | null;
  photos: string[];
  type_specific: Record<string, string | number | null>;
  remark: string | null;
  closing_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  resolved_at: string | null;
  updated_at: string | null;
  citizen_subscribed: boolean;
}

/** Response of POST /api/incidents */
export interface IncidentCreated {
  report_id: number;
  tracking_ref: string;
  status: IncidentStatus;
  possible_duplicate: boolean;
}

export interface TimelineItem {
  action: string;
  from_status: IncidentStatus | null;
  to_status: IncidentStatus | null;
  remark: string | null;
  created_at: string;
}

/** GET /api/incidents/track/{ref}?phone= */
export interface TrackView {
  tracking_ref: string;
  incident_type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  location: string;
  description: string;
  remark: string | null;
  editable: boolean;
  citizen_subscribed: boolean;
  created_at: string;
  updated_at: string | null;
  timeline: TimelineItem[];
}

/** The JSON that goes into the "data" field of the multipart request */
export interface ReportPayload {
  incident_type: IncidentType;
  location: string;
  latitude?: number;
  longitude?: number;
  severity: Severity;
  description: string;
  reporter_name?: string;
  reporter_phone: string;
  water_level?: string;
  structure_type?: string;
  casualty_count?: number;
}

export interface IncidentFilters {
  status: IncidentStatus | '';
  severity: Severity | '';
  incident_type: IncidentType | '';
  q: string;
  possible_duplicate: boolean;
  page: number;
  page_size: number;
}

/** What we pass to /report/success through the router state */
export interface ReportSuccessState extends IncidentCreated {
  phone: string;
}
