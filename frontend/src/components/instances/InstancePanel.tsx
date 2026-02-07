import { useQuery } from '@tanstack/react-query';
import { Cpu, Loader2, Activity } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InstanceControls } from '@/components/instances/InstanceControls';
import { TaskEditor } from '@/components/tasks/TaskEditor';
import { TaskQueue } from '@/components/tasks/TaskQueue';
import type { Instance, InstanceHealth } from '@/types';

interface InstancePanelProps {
  instance: Instance;
  className?: string;
}

export function InstancePanel({ instance, className }: InstancePanelProps) {
  const { data: health } = useQuery<InstanceHealth>({
    queryKey: ['instanceHealth', instance.id],
    queryFn: async () => {
      const response = await api.get(`/instances/${instance.id}/health`);
      return response.data;
    },
    refetchInterval: 5000,
  });

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Instance header */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
            <Cpu className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{instance.name}</h2>
            <p className="text-xs text-muted-foreground">
              Model: {instance.model} | Max turns: {instance.max_turns}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={instance.status} />
          <InstanceControls instanceId={instance.id} status={instance.status} />
        </div>
      </div>

      {/* Health stats */}
      {health && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Queue</span>
            </div>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {health.queue_length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Loader2 className={cn(
                'h-4 w-4',
                health.active_task_id ? 'animate-spin text-green-500' : 'text-muted-foreground'
              )} />
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {health.active_task_id ? 'Yes' : 'No'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Clients</span>
            </div>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {health.connected_clients}
            </p>
          </div>
        </div>
      )}

      {/* Task editor */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">New Task</h3>
        <TaskEditor instanceId={instance.id} />
      </div>

      {/* Task queue */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Task Queue</h3>
        <TaskQueue instanceId={instance.id} />
      </div>
    </div>
  );
}
