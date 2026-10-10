import type { ReactNode } from 'react';

const colorMap = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-800',
  orange: 'bg-orange-100 text-orange-700',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
} as const;

type BadgeColor = keyof typeof colorMap;

interface BadgeProps {
  color?: BadgeColor;
  children: ReactNode;
  className?: string;
}

export function Badge({ color = 'gray', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium
        ${colorMap[color]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
