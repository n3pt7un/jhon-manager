import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import '@xterm/xterm/css/xterm.css';

interface InstanceTerminalProps {
  instanceId: string;
  className?: string;
}

export function InstanceTerminal({ instanceId, className }: InstanceTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const autoScrollRef = useRef(true);

  const handleOutput = useCallback((line: string, _stream: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(line);
      if (autoScrollRef.current) {
        xtermRef.current.scrollToBottom();
      }
    }
  }, []);

  const { connected } = useWebSocket({
    instanceId,
    onOutput: handleOutput,
    enabled: !!instanceId,
  });

  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      scrollback: 10000,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        selectionBackground: '#3f3f46',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
      },
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    terminal.writeln('\x1b[90m--- Terminal connected ---\x1b[0m');

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
    };
  }, []);

  return (
    <div className={cn('relative flex flex-col', className)}>
      {/* Terminal toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-[#0a0a0a] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className={cn(
            'h-2 w-2 rounded-full',
            connected ? 'bg-green-500' : 'bg-red-500'
          )} />
          <span className="text-xs text-gray-400">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => xtermRef.current?.clear()}
            className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            Clear
          </button>
          <button
            onClick={() => xtermRef.current?.scrollToBottom()}
            className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            Scroll to bottom
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div ref={terminalRef} className="flex-1 min-h-0" />
    </div>
  );
}
