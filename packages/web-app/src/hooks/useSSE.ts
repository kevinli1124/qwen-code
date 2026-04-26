import { useEffect, useRef } from 'react';
import type { StreamEvent } from '../types/message';
import { API_BASE } from '../api/client';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export function useSSE(
  sessionId: string | null,
  onEvent: (event: StreamEvent) => void,
  onError?: (err: string) => void,
) {
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const unmountedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    unmountedRef.current = false;
    if (!sessionId) return;

    function connect() {
      if (unmountedRef.current) return;
      const es = new EventSource(`${API_BASE}/api/stream/${sessionId}`);
      esRef.current = es;

      es.onmessage = (e) => {
        retriesRef.current = 0;
        try {
          const event = JSON.parse(e.data as string) as StreamEvent;
          onEvent(event);
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        es.close();
        if (unmountedRef.current) return;
        if (retriesRef.current < MAX_RETRIES) {
          retriesRef.current++;
          retryTimerRef.current = setTimeout(connect, RETRY_DELAY_MS);
        } else {
          onError?.('Connection lost. Please reload the page.');
        }
      };
    }

    connect();
    return () => {
      unmountedRef.current = true;
      esRef.current?.close();
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
}
