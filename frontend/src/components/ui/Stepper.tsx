import { Check } from 'lucide-react';

export interface StepItem {
  label: string;
  description?: string;
}

interface StepperProps {
  steps: (string | StepItem)[];
  currentStep: number; // 0-indexed
  className?: string;
}

export function Stepper({ steps, currentStep, className = '' }: StepperProps) {
  const normalizedSteps: StepItem[] = steps.map((s) =>
    typeof s === 'string' ? { label: s } : s,
  );

  return (
    <nav aria-label="Progress" className={`w-full ${className}`}>
      <ol className="flex items-center w-full">
        {normalizedSteps.map((step, idx) => {
          const isDone = idx < currentStep;
          const isCurrent = idx === currentStep;
          const isUpcoming = idx > currentStep;
          const isLast = idx === normalizedSteps.length - 1;

          return (
            <li
              key={step.label}
              className={`flex items-center ${isLast ? 'flex-none' : 'flex-1'}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                    ${isDone ? 'bg-brand-600 text-white shadow-sm' : ''}
                    ${isCurrent ? 'border-2 border-brand-600 bg-white text-brand-700 font-bold shadow-sm ring-4 ring-brand-50' : ''}
                    ${isUpcoming ? 'border border-gray-300 bg-gray-50 text-gray-400' : ''}
                  `}
                >
                  {isDone ? (
                    <Check className="w-4 h-4 text-white" aria-hidden="true" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <div className="mt-1.5 text-center px-1">
                  <span
                    className={`
                      block text-xs font-medium whitespace-nowrap
                      ${isDone ? 'text-gray-900 font-medium' : ''}
                      ${isCurrent ? 'text-brand-700 font-semibold' : ''}
                      ${isUpcoming ? 'text-gray-400' : ''}
                    `}
                  >
                    {step.label}
                  </span>
                  {step.description && (
                    <span className="block text-[10px] text-gray-500 whitespace-nowrap">
                      {step.description}
                    </span>
                  )}
                </div>
              </div>

              {!isLast && (
                <div
                  className={`
                    h-0.5 w-full mx-2 -mt-4 transition-colors
                    ${idx < currentStep ? 'bg-brand-600' : 'bg-gray-200'}
                  `}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
