import { useId, type ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

export function FormField({ label, hint, error, required, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-danger-500 ml-0.5" aria-hidden="true">*</span>}
      </label>

      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}

      {hint && !error && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
