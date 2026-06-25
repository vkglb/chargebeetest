import { useEffect, useRef } from "react";
import { realtimeUrl } from "../api/client";

export interface LiveEvent {
  type: string;
  mode: string;
  created_at: string;
  data: Record<string, unknown>;
}

// Subscribes to the live event stream (WebSocket) and invokes onEvent for each
// message. Auto-reconnects with a short backoff. No-op in guest/demo mode.
export function useRealtime(onEvent: (e: LiveEvent) => void) {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    const url = realtimeUrl();
    if (!url) return;

    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(url!);
      ws.onmessage = (ev) => {
        try {
          cb.current(JSON.parse(ev.data));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    }
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);
}
