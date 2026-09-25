import { useEffect, useRef, useState } from "react";
import { env } from "@/shared/config/environment";
import { tokenStore } from "@/shared/lib/apiClient";
import { logger } from "@/shared/services/logger";

export interface StreamEvent {
  type: string;
  issueId: string;
  departmentIds: string[];
  payload: Record<string, unknown>;
  at: string;
}

/**
 * Subscribes to a backend SSE endpoint with the native EventSource, which
 * reconnects on its own (the server sends a retry hint). EventSource can't
 * set headers, so the access token travels as a query param.
 *
 * Pass `path: null` to stay disconnected — e.g. before auth resolves.
 */
export function useEventStream(path: string | null, onEvent: (event: StreamEvent) => void) {
  const [connected, setConnected] = useState(false);
  // Keep the latest handler without tearing down the connection on every render.
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!path) {
      setConnected(false);
      return;
    }

    const token = tokenStore.getAccessToken();
    if (!token) {
      setConnected(false);
      return;
    }

    const url = `${env.apiBaseUrl}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);

    const handleMessage = (e: MessageEvent) => {
      try {
        handlerRef.current(JSON.parse(e.data) as StreamEvent);
      } catch (err) {
        logger.error("Failed to parse stream event:", err);
      }
    };

    source.addEventListener("connected", () => setConnected(true));
    for (const type of [
      "issue.created",
      "issue.status_changed",
      "issue.verification_changed",
      "issue.supported",
    ]) {
      source.addEventListener(type, handleMessage as EventListener);
    }

    source.onerror = () => {
      // EventSource retries automatically; surface the gap in the UI meanwhile.
      setConnected(false);
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [path]);

  return { connected };
}
