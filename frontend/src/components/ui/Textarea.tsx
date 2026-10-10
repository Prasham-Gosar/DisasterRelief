import { forwardRef, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ hasError = false, className = '', ...rest }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`
          block w-full rounded-ui border px-3 py-2 text-sm min-h-[88px]
          placeholder:text-gray-400
          transition-colors focus-ring resize-y
          ${hasError
            ? 'border-danger-500 text-danger-900'
            : 'border-gray-300 text-gray-900 hover:border-gray-400'
          }
          disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
          ${className}
        `}
        {...rest}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
