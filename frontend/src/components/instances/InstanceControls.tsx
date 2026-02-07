import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import type { InstanceStatus } from '@/types';

interface InstanceControlsProps {
  instanceId: string;
  status: InstanceStatus;
  className?: string;
}

export function InstanceControls({ instanceId, status, className }: InstanceControlsProps) {
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: () => {
      setActiveAction('start');
      return api.post(`/instances/${instanceId}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instance', instanceId] });
      queryClient.invalidateQueries({ queryKey: ['instanceHealth', instanceId] });
      toast.success('Instance started');
    },
    onSettled: () => setActiveAction(null),
  });

  const stopMutation = useMutation({
    mutationFn: () => {
      setActiveAction('stop');
      return api.post(`/instances/${instanceId}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instance', instanceId] });
      queryClient.invalidateQueries({ queryKey: ['instanceHealth', instanceId] });
      toast.success('Instance stopped');
    },
    onSettled: () => setActiveAction(null),
  });

  const restartMutation = useMutation({
    mutationFn: () => {
      setActiveAction('restart');
      return api.post(`/instances/${instanceId}/restart`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instance', instanceId] });
      queryClient.invalidateQueries({ queryKey: ['instanceHealth', instanceId] });
      toast.success('Instance restarted');
    },
    onSettled: () => setActiveAction(null),
  });

  const isLoading = activeAction !== null;
  const isRunning = status === 'running';
  const isIdle = status === 'idle' || status === 'stopped';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {isIdle && (
        <button
          onClick={() => startMutation.mutate()}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {activeAction === 'start' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Start
        </button>
      )}

      {isRunning && (
        <button
          onClick={() => stopMutation.mutate()}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {activeAction === 'stop' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
          Stop
        </button>
      )}

      <button
        onClick={() => restartMutation.mutate()}
        disabled={isLoading || isIdle}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
      >
        {activeAction === 'restart' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" />
        )}
        Restart
      </button>
    </div>
  );
}
