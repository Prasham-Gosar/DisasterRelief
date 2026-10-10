import { Badge } from './Badge';
import {
  incidentStatusLabel,
  teamStatusLabel,
  assignmentStatusLabel,
  memberStatusLabel,
} from '../../lib/format';
import type {
  IncidentStatus,
  TeamStatus,
  AssignmentStatus,
  MemberStatus,
} from '../../lib/types';

type BadgeColor = 'gray' | 'blue' | 'green' | 'amber' | 'orange' | 'red' | 'purple';

// ── Incident status colours ──
const incidentStatusColor: Record<IncidentStatus, BadgeColor> = {
  reported: 'blue',
  verified: 'purple',
  assigned: 'amber',
  in_progress: 'orange',
  resolved: 'green',
  rejected: 'red',
  closed: 'gray',
};

// ── Team status colours ──
const teamStatusColor: Record<TeamStatus, BadgeColor> = {
  available: 'green',
  deployed: 'orange',
};

// ── Assignment status colours ──
const assignmentStatusColor: Record<AssignmentStatus, BadgeColor> = {
  assigned: 'amber',
  en_route: 'blue',
  on_site: 'orange',
  resolved: 'green',
  reassigned: 'purple',
};

// ── Member status colours ──
const memberStatusColor: Record<MemberStatus, BadgeColor> = {
  available: 'green',
  assigned: 'amber',
  en_route: 'blue',
  on_site: 'orange',
};

// ── Overloaded StatusBadge ──
type StatusBadgeProps =
  | { type: 'incident'; status: IncidentStatus; className?: string }
  | { type: 'team'; status: TeamStatus; className?: string }
  | { type: 'assignment'; status: AssignmentStatus; className?: string }
  | { type: 'member'; status: MemberStatus; className?: string };

export function StatusBadge(props: StatusBadgeProps) {
  let color: BadgeColor;
  let label: string;

  switch (props.type) {
    case 'incident':
      color = incidentStatusColor[props.status];
      label = incidentStatusLabel(props.status);
      break;
    case 'team':
      color = teamStatusColor[props.status];
      label = teamStatusLabel(props.status);
      break;
    case 'assignment':
      color = assignmentStatusColor[props.status];
      label = assignmentStatusLabel(props.status);
      break;
    case 'member':
      color = memberStatusColor[props.status];
      label = memberStatusLabel(props.status);
      break;
  }

  return <Badge color={color} className={props.className}>{label}</Badge>;
}
