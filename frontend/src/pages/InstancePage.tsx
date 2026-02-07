import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import type { Instance } from '@/types';
import { InstancePanel } from '@/components/instances/InstancePanel';
import { InstanceTerminal } from '@/components/terminal/InstanceTerminal';

export function InstancePage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();

  const {
    data: instance,
    isLoading,
    isError,
  } = useQuery<Instance>({
    queryKey: ['instance', instanceId],
    queryFn: async () => {
      const response = await api.get(`/instances/${instanceId}`);
      return response.data;
    },
    enabled: !!instanceId,
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !instance) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load instance. It may have been deleted or is inaccessible.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Back navigation */}
      <button
        onClick={() => navigate(`/projects/${instance.project_id}`)}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors self-start"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </button>

      {/* Main layout: panel on left, terminal on right */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Left panel: controls + tasks */}
        <div className="w-[400px] shrink-0 overflow-y-auto">
          <InstancePanel instance={instance} />
        </div>

        {/* Right panel: terminal */}
        <div className="flex-1 min-w-0 rounded-lg border border-border overflow-hidden">
          <InstanceTerminal instanceId={instance.id} className="h-full" />
        </div>
      </div>
    </div>
  );
}
