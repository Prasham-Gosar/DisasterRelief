import { Badge } from './Badge';
import { severityLabel } from '../../lib/format';
import type { Severity } from '../../lib/types';

const severityColorMap: Record<Severity, 'green' | 'amber' | 'orange' | 'red'> = {
  low: 'green',
  medium: 'amber',
  high: 'orange',
  critical: 'red',
};

const severityDot: Record<Severity, string> = {
  low: 'bg-green-500',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

/** Badge that always shows text + a coloured dot so colour is never the only signal */
export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <Badge color={severityColorMap[severity]} className={className}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${severityDot[severity]}`} aria-hidden="true" />
      {severityLabel(severity)}
    </Badge>
  );
}
