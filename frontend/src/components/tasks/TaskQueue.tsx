import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  XCircle,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import type { Task, TaskStatus } from '@/types';

interface TaskQueueProps {
  instanceId: string;
  className?: string;
}

const taskStatusConfig: Record<TaskStatus, { label: string; icon: React.ElementType; classes: string }> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    classes: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  },
  queued: {
    label: 'Queued',
    icon: Clock,
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  running: {
    label: 'Running',
    icon: Play,
    classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  failed: {
    label: 'Failed',
    icon: AlertCircle,
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  cancelled: {
    label: 'Cancelled',
    icon: Ban,
    classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  },
};

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = taskStatusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        config.classes
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {config.label}
    </span>
  );
}

function truncatePrompt(prompt: string, maxLength = 80): string {
  if (prompt.length <= maxLength) return prompt;
  return prompt.slice(0, maxLength) + '...';
}

function priorityLabel(priority: number): string {
  if (priority >= 75) return 'Urgent';
  if (priority >= 50) return 'High';
  if (priority >= 25) return 'Normal';
  return 'Low';
}

function priorityClasses(priority: number): string {
  if (priority >= 75) return 'text-red-600 dark:text-red-400';
  if (priority >= 50) return 'text-orange-600 dark:text-orange-400';
  if (priority >= 25) return 'text-foreground';
  return 'text-muted-foreground';
}

interface TaskItemProps {
  task: Task;
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  cancellingId: string | null;
  retryingId: string | null;
}

function TaskItem({ task, onCancel, onRetry, cancellingId, retryingId }: TaskItemProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground" title={task.prompt}>
          {truncatePrompt(task.prompt)}
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <TaskStatusBadge status={task.status} />
          <span className={priorityClasses(task.priority)}>
            {priorityLabel(task.priority)}
          </span>
          {task.duration_seconds !== null && (
            <span>{task.duration_seconds.toFixed(1)}s</span>
          )}
          <span>{formatRelativeTime(task.created_at)}</span>
        </div>
        {task.error_message && (
          <p className="mt-1 text-xs text-red-500 dark:text-red-400 truncate" title={task.error_message}>
            {task.error_message}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {(task.status === 'running' || task.status === 'queued' || task.status === 'pending') && (
          <button
            onClick={() => onCancel(task.id)}
            disabled={cancellingId === task.id}
            className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            title="Cancel task"
          >
            {cancellingId === task.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
          </button>
        )}
        {task.status === 'failed' && (
          <button
            onClick={() => onRetry(task.id)}
            disabled={retryingId === task.id}
            className="rounded p-1 text-muted-foreground hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
            title="Retry task"
          >
            {retryingId === task.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function TaskQueue({ instanceId, className }: TaskQueueProps) {
  const queryClient = useQueryClient();
  const [showCompleted, setShowCompleted] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', instanceId],
    queryFn: async () => {
      const response = await api.get(`/instances/${instanceId}/tasks`);
      return response.data;
    },
    enabled: !!instanceId,
    refetchInterval: 5000,
  });

  const cancelMutation = useMutation({
    mutationFn: async (taskId: string) => {
      setCancellingId(taskId);
      await api.post(`/instances/${instanceId}/tasks/${taskId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', instanceId] });
      toast.success('Task cancelled');
    },
    onSettled: () => setCancellingId(null),
  });

  const retryMutation = useMutation({
    mutationFn: async (taskId: string) => {
      setRetryingId(taskId);
      await api.post(`/instances/${instanceId}/tasks/${taskId}/retry`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', instanceId] });
      toast.success('Task queued for retry');
    },
    onSettled: () => setRetryingId(null),
  });

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const runningTasks = tasks?.filter((t) => t.status === 'running') ?? [];
  const queuedTasks = tasks?.filter((t) => t.status === 'queued' || t.status === 'pending') ?? [];
  const completedTasks = tasks?.filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') ?? [];

  return (
    <div className={cn('flex flex-col gap-3 overflow-y-auto', className)}>
      {/* Running Tasks */}
      {runningTasks.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Running ({runningTasks.length})
          </h4>
          <div className="space-y-1.5">
            {runningTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onCancel={(id) => cancelMutation.mutate(id)}
                onRetry={(id) => retryMutation.mutate(id)}
                cancellingId={cancellingId}
                retryingId={retryingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Queued Tasks */}
      {queuedTasks.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Queued ({queuedTasks.length})
          </h4>
          <div className="space-y-1.5">
            {queuedTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onCancel={(id) => cancelMutation.mutate(id)}
                onRetry={(id) => retryMutation.mutate(id)}
                cancellingId={cancellingId}
                retryingId={retryingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {runningTasks.length === 0 && queuedTasks.length === 0 && completedTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No tasks yet</p>
          <p className="text-xs text-muted-foreground/70">
            Submit a prompt above to create a task
          </p>
        </div>
      )}

      {/* Completed/Failed Tasks */}
      {completedTasks.length > 0 && (
        <div className="space-y-1.5">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCompleted ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Completed ({completedTasks.length})
          </button>
          {showCompleted && (
            <div className="space-y-1.5">
              {completedTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onCancel={(id) => cancelMutation.mutate(id)}
                  onRetry={(id) => retryMutation.mutate(id)}
                  cancellingId={cancellingId}
                  retryingId={retryingId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
