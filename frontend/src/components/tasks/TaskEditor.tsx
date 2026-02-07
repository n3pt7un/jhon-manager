import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface TaskEditorProps {
  instanceId: string;
  className?: string;
}

export function TaskEditor({ instanceId, className }: TaskEditorProps) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [priority, setPriority] = useState(0);

  const createMutation = useMutation({
    mutationFn: (data: { prompt: string; priority: number }) =>
      api.post(`/instances/${instanceId}/tasks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', instanceId] });
      toast.success('Task created');
      setPrompt('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    createMutation.mutate({ prompt: trimmed, priority });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('flex flex-col gap-2', className)}>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter a prompt for Claude..."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="task-priority" className="text-xs text-muted-foreground">
            Priority:
          </label>
          <select
            id="task-priority"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value={0}>Low</option>
            <option value={25}>Normal</option>
            <option value={50}>High</option>
            <option value={75}>Urgent</option>
          </select>
          <span className="text-xs text-muted-foreground/60">
            Ctrl+Enter to submit
          </span>
        </div>
        <button
          type="submit"
          disabled={!prompt.trim() || createMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Submit Task
        </button>
      </div>
    </form>
  );
}
