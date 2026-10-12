import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../../components/ui';

interface SimplePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

// Basic version. (Person B's Pagination from UI kit v2 can replace this later.)
export function SimplePagination({ page, pageSize, total, onPageChange }: SimplePaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="flex items-center justify-between gap-3 px-1 py-3" aria-label="Pagination">
      <p className="text-sm text-gray-500">
        {total === 0 ? 'No reports' : `Showing ${from}-${to} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Prev
        </Button>
        <span className="text-sm text-gray-600">Page {page} of {pages}</span>
        <Button variant="secondary" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next page">
          Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
