import { db } from "../../../lib/db";
import { pushEventStream } from "../../../lib/push-stream";

export const dynamic = "force-dynamic";

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
  return pushEventStream(request, async (event) => {
    // any event carrying a route gets its hop candidates attached
    if (!("route" in event)) {
      return event;
    }

    let hops: Hop[];
    try {
      hops = await resolveHops(event.route);
    } catch (error) {
      // a failed lookup should degrade the path, not lose the event
      console.error("[push] hop resolution failed", error);
      hops = event.route.map((prefix) => ({ prefix, candidates: [] }));
    }
    return { ...event, hops };
  });
}
