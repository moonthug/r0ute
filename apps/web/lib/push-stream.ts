import type { PushEvent } from "@r0ute/database";
import { subscribe } from "./push-listener";

const HEARTBEAT_MS = 20_000;

/**
 * The shared shell of the SSE push endpoint: opening frame, heartbeat, abort
 * cleanup, dead-socket reaping. Events go out as default `message` frames —
 * each payload carries its own `type` field, so no named SSE events are
 * needed. A transform failure drops that one event with a log, never the
 * stream.
 */
export function pushEventStream(
  request: Request,
  transform: (event: PushEvent) => Promise<unknown> | unknown,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let unsubscribe: (() => void) | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const close = (): void => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // the stream may already have errored out under a dead socket
        }
      };

      const send = (frame: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          close();
        }
      };

      // headers are not flushed until the first body byte, so open the stream
      // immediately rather than leaving clients status-less until the heartbeat
      send(": connected\nretry: 3000\n\n");

      unsubscribe = subscribe((event) => {
        void (async () => {
          const data = await transform(event);
          send(`data: ${JSON.stringify(data)}\n\n`);
        })().catch((error: unknown) => {
          console.error(`[push/${event.type}] relay failed`, error);
        });
      });

      // abort can fire late (next#52809); writing to a dead socket reaps the
      // subscriber, and the comment frame also defeats proxy idle timeouts
      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      request.signal.addEventListener("abort", close);
      if (request.signal.aborted) close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
