import { cn } from '@/lib/utils';
import type { InstanceStatus } from '@/types';

interface StatusBadgeProps {
  status: InstanceStatus;
  className?: string;
}

const statusConfig: Record<InstanceStatus, { label: string; classes: string }> = {
  idle: {
    label: 'Idle',
    classes: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
  running: {
    label: 'Running',
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  paused: {
    label: 'Paused',
    classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  error: {
    label: 'Error',
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  stopped: {
    label: 'Stopped',
    classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.idle;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.classes,
        className
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', {
          'bg-gray-400': status === 'idle' || status === 'stopped',
          'bg-green-500 animate-pulse': status === 'running',
          'bg-yellow-500': status === 'paused',
          'bg-red-500': status === 'error',
        })}
      />
      {config.label}
    </span>
  );
}
