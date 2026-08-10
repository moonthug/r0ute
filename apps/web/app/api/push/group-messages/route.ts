import { type GroupMessagePush, PUSH_CHANNELS } from "@r0ute/database";
import { db } from "../../../../lib/db";
import { subscribe } from "../../../../lib/push-listener";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;

type Candidate = { publicKey: string; name: string | null; lat: number; lon: number };
type Hop = { prefix: string; candidates: Candidate[] };

/**
 * Route hops are truncated public-key prefixes, so each can match zero, one or
 * many known nodes. Candidates are resolved here rather than shipped through
 * NOTIFY, which is capped at 8000 bytes.
 */
async function resolveHops(route: string[]): Promise<Hop[]> {
  const prefixes = [...new Set(route)];
  const matches = await Promise.all(
    prefixes.map((prefix) =>
      db.advertLocation.findMany({
        where: { publicKey: { startsWith: prefix } },
        select: { publicKey: true, name: true, lat: true, lon: true },
      }),
    ),
  );

  const byPrefix = new Map(prefixes.map((prefix, index) => [prefix, matches[index] ?? []]));
  return route.map((prefix) => ({ prefix, candidates: byPrefix.get(prefix) ?? [] }));
}

export function GET(request: Request): Response {
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

      const relay = async (event: GroupMessagePush): Promise<void> => {
        let hops: Hop[];
        try {
          hops = await resolveHops(event.route);
        } catch (error) {
          // a failed lookup should degrade the path, not lose the event
          console.error("[push/group-messages] hop resolution failed", error);
          hops = event.route.map((prefix) => ({ prefix, candidates: [] }));
        }
        send(`event: group-message\ndata: ${JSON.stringify({ ...event, hops })}\n\n`);
      };

      // headers are not flushed until the first body byte, so open the stream
      // immediately rather than leaving clients status-less until the heartbeat
      send(": connected\nretry: 3000\n\n");

      unsubscribe = subscribe(PUSH_CHANNELS.groupMessages, (event) => {
        relay(event).catch((error: unknown) => {
          console.error("[push/group-messages] relay failed", error);
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
