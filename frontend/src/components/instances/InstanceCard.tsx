import { useNavigate } from 'react-router-dom';
import { Cpu, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Instance } from '@/types';

interface InstanceCardProps {
  instance: Instance;
  onEdit: (instance: Instance) => void;
  onDelete: (instance: Instance) => void;
  className?: string;
}

export function InstanceCard({
  instance,
  onEdit,
  onDelete,
  className,
}: InstanceCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50',
        className
      )}
    >
      <div
        className="flex items-center gap-4 cursor-pointer flex-1 min-w-0"
        onClick={() => navigate(`/instances/${instance.id}`)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
          <Cpu className="h-4 w-4 text-secondary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{instance.name}</p>
          <p className="text-xs text-muted-foreground">
            Model: {instance.model} | Max turns: {instance.max_turns}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <StatusBadge status={instance.status} />

        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(`/instances/${instance.id}`)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Open instance"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            onClick={() => onEdit(instance)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Edit instance"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(instance)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors"
            title="Delete instance"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
