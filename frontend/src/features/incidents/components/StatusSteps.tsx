import { Check } from 'lucide-react';
import type { IncidentStatus } from '../../../lib/types';

// Simple version for the citizen's tracking page.
// (Person B's Stepper from UI kit v2 can replace this later.)
const STEPS: { status: IncidentStatus; label: string }[] = [
  { status: 'reported', label: 'Reported' },
  { status: 'verified', label: 'Verified' },
  { status: 'assigned', label: 'Team assigned' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'resolved', label: 'Resolved' },
];

export function StatusSteps({ status }: { status: IncidentStatus }) {
  // closed is the end of the line, so every step counts as done
  const currentIndex = status === 'closed' ? STEPS.length : STEPS.findIndex((s) => s.status === status);

  return (
    <ol className="flex items-start" aria-label="Report progress">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step.status} className="flex flex-1 flex-col items-center text-center" aria-current={active ? 'step' : undefined}>
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : done || active ? 'bg-brand-600' : 'bg-gray-200'}`} />
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold
                  ${done ? 'bg-brand-600 text-white' : active ? 'border-2 border-brand-600 bg-white text-brand-700' : 'border border-gray-300 bg-white text-gray-400'}`}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </span>
              <div className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'invisible' : done ? 'bg-brand-600' : 'bg-gray-200'}`} />
            </div>
            <span className={`mt-1.5 px-0.5 text-[11px] leading-tight sm:text-xs ${active ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
