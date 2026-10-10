import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

interface ErrorBannerProps {
  message: string;
  dismissible?: boolean;
  className?: string;
}

export function ErrorBanner({ message, dismissible = true, className = '' }: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className={`
        flex items-start gap-3 rounded-ui border border-danger-200 bg-danger-50 p-4
        ${className}
      `}
      role="alert"
    >
      <AlertTriangle className="h-5 w-5 text-danger-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-sm text-danger-700 flex-1">{message}</p>
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          className="p-0.5 rounded hover:bg-danger-100 focus-ring flex-shrink-0"
          aria-label="Dismiss error"
        >
          <X className="h-4 w-4 text-danger-500" />
        </button>
      )}
    </div>
  );
}
