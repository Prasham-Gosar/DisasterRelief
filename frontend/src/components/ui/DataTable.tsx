import { type ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  header: string;
  accessor?: keyof T | ((row: T) => ReactNode);
  cell?: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  skeletonRows?: number;
  emptyMessage?: string;
  emptyState?: ReactNode;
  keyExtractor?: (row: T, index: number) => string | number;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  loading = false,
  skeletonRows = 5,
  emptyMessage = 'No records found',
  emptyState,
  keyExtractor,
  className = '',
}: DataTableProps<T>) {
  const getKey = (row: T, index: number): string | number => {
    if (keyExtractor) return keyExtractor(row, index);
    if (row && typeof row === 'object' && 'id' in row) {
      return String((row as { id: unknown }).id);
    }
    return index;
  };

  const renderCell = (column: Column<T>, row: T): ReactNode => {
    if (column.cell) {
      return column.cell(row);
    }
    if (typeof column.accessor === 'function') {
      return column.accessor(row);
    }
    if (column.accessor) {
      const val = row[column.accessor];
      return val !== null && val !== undefined ? String(val) : '—';
    }
    return '—';
  };

  return (
    <div className={`w-full overflow-x-auto rounded-ui border border-gray-200 bg-white ${className}`}>
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/75 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {columns.map((col, idx) => (
              <th
                key={idx}
                scope="col"
                className={`px-4 py-3.5 ${col.headerClassName ?? ''} ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, rIdx) => (
              <tr key={rIdx} className="animate-pulse">
                {columns.map((col, cIdx) => (
                  <td key={cIdx} className={`px-4 py-4 ${col.className ?? ''}`}>
                    <Skeleton className="h-4 w-3/4" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center">
                {emptyState ?? <EmptyState title={emptyMessage} />}
              </td>
            </tr>
          ) : (
            data.map((row, rIdx) => {
              const isClickable = Boolean(onRowClick);
              return (
                <tr
                  key={getKey(row, rIdx)}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={(e) => {
                    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onRowClick?.(row);
                    }
                  }}
                  tabIndex={isClickable ? 0 : undefined}
                  role={isClickable ? 'button' : undefined}
                  className={`
                    transition-colors
                    ${isClickable ? 'cursor-pointer hover:bg-gray-50/80 focus:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-brand-500' : ''}
                  `}
                >
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} className={`px-4 py-3.5 text-gray-700 ${col.className ?? ''}`}>
                      {renderCell(col, row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
