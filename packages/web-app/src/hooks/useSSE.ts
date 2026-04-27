import { useEffect, useRef } from 'react';
import type { StreamEvent } from '../types/message';
import { API_BASE } from '../api/client';

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 32_000;
const MAX_RETRIES = 10;

export function useSSE(
  sessionId: string | null,
  onEvent: (event: StreamEvent) => void,
  onError?: (err: string) => void,
  onRetry?: (delayMs: number, attempt: number) => void,
) {
  const esRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const retryDelayRef = useRef(INITIAL_RETRY_MS);
  const unmountedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    unmountedRef.current = false;
    retriesRef.current = 0;
    retryDelayRef.current = INITIAL_RETRY_MS;
    if (!sessionId) return;

    function connect() {
      if (unmountedRef.current) return;
      const es = new EventSource(`${API_BASE}/api/stream/${sessionId}`);
      esRef.current = es;

      es.onmessage = (e) => {
        // Successful message — reset retry state
        retriesRef.current = 0;
        retryDelayRef.current = INITIAL_RETRY_MS;
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
          const delay = retryDelayRef.current;
          retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_MS);
          onRetry?.(delay, retriesRef.current);
          retryTimerRef.current = setTimeout(connect, delay);
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
      retryDelayRef.current = INITIAL_RETRY_MS;
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
}
