import { Check } from 'lucide-react';

interface FormStepsProps {
  steps: string[];
  current: number; // 1-based
}

/** "1 Type  — 2 Location — 3 Details" progress bar for the report form */
export function FormSteps({ steps, current }: FormStepsProps) {
  return (
    <ol className="flex items-center" aria-label="Progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold
                  ${done ? 'bg-brand-600 text-white' : active ? 'border-2 border-brand-600 text-brand-700' : 'border border-gray-300 text-gray-400'}`}
              >
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
              </span>
              <span className={`text-sm ${active ? 'font-semibold text-gray-900' : 'text-gray-500'} hidden xs:inline`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && <div className={`mx-3 h-0.5 flex-1 ${done ? 'bg-brand-600' : 'bg-gray-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
