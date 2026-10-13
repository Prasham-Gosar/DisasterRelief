import { type ReactNode } from 'react';

export interface TimelineItem {
  id?: string | number;
  time: string;
  title: string;
  detail?: ReactNode;
  icon?: ReactNode;
  status?: 'done' | 'current' | 'pending' | 'danger';
}

interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

export function Timeline({ items, className = '' }: TimelineProps) {
  if (items.length === 0) return null;

  return (
    <div className={`relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200 ${className}`}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const dotBg =
          item.status === 'done'
            ? 'bg-green-500 ring-green-100'
            : item.status === 'current'
            ? 'bg-brand-600 ring-brand-100'
            : item.status === 'danger'
            ? 'bg-red-500 ring-red-100'
            : 'bg-gray-300 ring-gray-100';

        return (
          <div key={item.id ?? `${item.title}-${index}`} className="relative group">
            {/* Dot / Icon */}
            <div
              className={`
                absolute -left-6 top-1 w-3 h-3 rounded-full ring-4 transition-transform
                ${dotBg}
              `}
              aria-hidden="true"
            />

            {/* Content */}
            <div className={`space-y-1 ${!isLast ? 'pb-2' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                <time className="text-xs text-gray-500 font-mono">{item.time}</time>
              </div>

              {item.detail && (
                <div className="text-sm text-gray-600 mt-0.5">
                  {typeof item.detail === 'string' ? <p>{item.detail}</p> : item.detail}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
