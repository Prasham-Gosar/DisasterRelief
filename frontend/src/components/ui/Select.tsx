import { forwardRef, type SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ hasError = false, className = '', children, ...rest }, ref) => {
    return (
      <select
        ref={ref}
        className={`
          block w-full rounded-ui border px-3 py-2 text-sm min-h-[44px]
          bg-white appearance-none
          transition-colors focus-ring
          ${hasError
            ? 'border-danger-500 text-danger-900'
            : 'border-gray-300 text-gray-900 hover:border-gray-400'
          }
          disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
          ${className}
        `}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

Select.displayName = 'Select';
