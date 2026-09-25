import { Request, Response } from "express";
import { eventBus, IssueEvent } from "./eventBus.js";

const HEARTBEAT_MS = 25_000;

/**
 * Opens a Server-Sent Events stream on an already-authorised request and
 * pipes matching bus events to it. Native EventSource handles reconnection
 * client-side; we send a retry hint plus periodic heartbeats so proxies
 * don't silently drop an idle connection.
 */
export function openSseStream(
  req: Request,
  res: Response,
  subscribe: (push: (event: IssueEvent) => void) => () => void
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write("retry: 3000\n\n");
  res.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

  const push = (event: IssueEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const unsubscribe = subscribe(push);

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
}

export { eventBus };
