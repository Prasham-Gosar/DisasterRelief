import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ hasError = false, className = '', ...rest }, ref) => {
    return (
      <input
        ref={ref}
        className={`
          block w-full rounded-ui border px-3 py-2 text-sm min-h-[44px]
          placeholder:text-gray-400
          transition-colors focus-ring
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

Input.displayName = 'Input';
