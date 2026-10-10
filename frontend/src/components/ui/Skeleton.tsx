interface SkeletonProps {
  className?: string;
  /** Number of lines to render */
  lines?: number;
}

export function Skeleton({ className = '', lines = 1 }: SkeletonProps) {
  return (
    <div className="animate-pulse space-y-2" role="status" aria-label="Loading content">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`bg-gray-200 rounded-ui h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'} ${className}`}
        />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
