import { Droplets, Flame, HeartPulse } from 'lucide-react';
import type { IncidentType } from '../../../lib/types';

const ICONS = { flood: Droplets, fire: Flame, medical: HeartPulse } as const;

export function IncidentTypeIcon({ type, className = 'h-5 w-5' }: { type: IncidentType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className} aria-hidden="true" />;
}
