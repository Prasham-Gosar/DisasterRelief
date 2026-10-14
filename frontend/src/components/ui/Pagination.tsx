import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface PaginationProps {
  page: number;
  totalPages?: number;
  total?: number;
  pageSize?: number;
  onPageChange: (newPage: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages: propTotalPages,
  total,
  pageSize = 10,
  onPageChange,
  className = '',
}: PaginationProps) {
  const totalPages = propTotalPages ?? (total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : 1);

  if (totalPages <= 1 && total === undefined) return null;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const startItem = total !== undefined ? (page - 1) * pageSize + 1 : undefined;
  const endItem = total !== undefined ? Math.min(page * pageSize, total) : undefined;

  return (
    <nav
      aria-label="Pagination Navigation"
      className={`flex items-center justify-between px-2 py-3 border-t border-gray-200 bg-white sm:px-4 ${className}`}
    >
      {/* Item summary */}
      <div className="text-xs text-gray-500 sm:text-sm">
        {total !== undefined && startItem !== undefined && endItem !== undefined ? (
          <span>
            Showing <strong className="font-semibold text-gray-800">{startItem}</strong> to{' '}
            <strong className="font-semibold text-gray-800">{endItem}</strong> of{' '}
            <strong className="font-semibold text-gray-800">{total}</strong> results
          </span>
        ) : (
          <span>
            Page <strong className="font-semibold text-gray-800">{page}</strong> of{' '}
            <strong className="font-semibold text-gray-800">{totalPages}</strong>
          </span>
        )}
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="w-4 h-4 mr-1" aria-hidden="true" />
          Previous
        </Button>

        <span className="text-xs font-medium text-gray-600 sm:text-sm px-1">
          {page} / {totalPages}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Go to next page"
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
