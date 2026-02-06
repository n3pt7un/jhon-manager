import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connectionStore';

export function StatusBar() {
  const { wsConnected } = useConnectionStore();

  return (
    <footer className="flex h-8 items-center border-t border-border bg-card px-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            wsConnected
              ? 'bg-green-500'
              : 'bg-red-500'
          )}
        />
        <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </footer>
  );
}
