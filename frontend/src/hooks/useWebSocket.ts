import { useEffect, useRef, useCallback, useState } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';

interface UseWebSocketOptions {
  instanceId: string;
  onMessage?: (data: any) => void;
  onOutput?: (line: string, stream: string) => void;
  enabled?: boolean;
}

export function useWebSocket({ instanceId, onMessage, onOutput, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [connected, setConnected] = useState(false);
  const attemptRef = useRef(0);
  const { setConnected: storeSetConnected, setDisconnected } = useConnectionStore();

  const connect = useCallback(() => {
    if (!enabled || !instanceId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/stream/${instanceId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      storeSetConnected();
      attemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output' && onOutput) {
          onOutput(msg.data.line, msg.data.stream);
        }
        if (onMessage) {
          onMessage(msg);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setDisconnected();
      wsRef.current = null;

      // Reconnect with exponential backoff
      if (enabled && attemptRef.current < 10) {
        const delay = Math.min(1000 * Math.pow(2, attemptRef.current), 30000);
        const jitter = delay * 0.25 * (Math.random() * 2 - 1);
        attemptRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay + jitter);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    // Heartbeat
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => clearInterval(pingInterval);
  }, [instanceId, enabled, onMessage, onOutput, storeSetConnected, setDisconnected]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, send };
}
