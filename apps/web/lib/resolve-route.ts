/**
 * Route hops arrive as truncated public-key prefixes, so each one can match
 * zero, one or many known nodes. Picking a node per hop is therefore a shortest
 * path problem over small candidate sets: the chain that minimises total
 * great-circle distance is the one a mesh packet plausibly took.
 *
 * Everything here is pure and browser-safe — see scripts/check-resolve-route.mts.
 */

export type Candidate = {
  publicKey: string;
  name: string | null;
  lat: number;
  lon: number;
};

export type Hop = {
  prefix: string;
  candidates: Candidate[];
};

export type ResolvedHop = {
  prefix: string;
  chosen: Candidate | null;
  /** candidates discarded in favour of `chosen` — 0 means the prefix was unambiguous */
  alternatives: number;
};

/** A direction marker sitting at the midpoint of one leg. */
export type RouteArrow = {
  id: string;
  position: [number, number];
  /** screen-space bearing: 0 points up/north and grows clockwise, as CSS rotate() expects */
  angleDeg: number;
};

export type RouteSegment = {
  id: string;
  positions: [number, number][];
  /** the leg reaches the name-guessed sender anchor, so it is drawn dashed */
  ambiguous: boolean;
  arrows: RouteArrow[];
};

/**
 * One candidate-to-candidate leg the message could have taken but the chosen
 * chain did not. Ambiguity renders as a visible fan of these rather than a
 * silent pick: every candidate of a hop connects to every candidate of the
 * next, minus the edges the chosen chain already draws.
 */
export type AlternativeEdge = {
  id: string;
  positions: [[number, number], [number, number]];
};

export type ResolvedRoute = {
  hops: ResolvedHop[];
  segments: RouteSegment[];
  alternatives: AlternativeEdge[];
};

export type Anchor = { lat: number; lon: number };

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance. Only relative magnitudes matter, so precision is ample. */
export function haversineKm(from: Anchor, to: Anchor): number {
  const halfLat = Math.sin(toRadians(to.lat - from.lat) / 2);
  const halfLon = Math.sin(toRadians(to.lon - from.lon) / 2);
  const chord =
    halfLat * halfLat +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * halfLon * halfLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(chord)));
}

/**
 * One arrow per leg, at its midpoint, pointing the way the message travelled
 * (route order is sender to receiver). Longitude is scaled by cos(latitude) so
 * the bearing matches what Mercator actually draws rather than the raw
 * coordinate delta. A leg of zero length — a route that revisits the same node
 * — has no direction, so it gets no arrow.
 */
export function segmentArrows(positions: [number, number][]): RouteArrow[] {
  const arrows: RouteArrow[] = [];

  for (const [index, to] of positions.entries()) {
    const from = index === 0 ? undefined : positions[index - 1];
    if (!from) continue;

    const [fromLat, fromLon] = from;
    const [toLat, toLon] = to;
    const deltaLat = toLat - fromLat;
    const deltaLon = toLon - fromLon;
    if (deltaLat === 0 && deltaLon === 0) continue;

    const midLat = (fromLat + toLat) / 2;
    const bearing = Math.atan2(deltaLon * Math.cos(toRadians(midLat)), deltaLat);
    const degrees = (bearing * 180) / Math.PI;

    arrows.push({
      id: `${index - 1}`,
      position: [midLat, (fromLon + toLon) / 2],
      angleDeg: ((degrees % 360) + 360) % 360,
    });
  }

  return arrows;
}

type Trail = { cost: number; chain: Candidate[] };

/**
 * Viterbi over one gap-free run of hops. Candidate sets are tiny and hops are
 * capped at 63 by the protocol, so carrying whole chains costs nothing and
 * avoids backtracking bookkeeping. Ties keep the earlier candidate.
 */
function resolveRun(candidateSets: Candidate[][], anchor: Anchor | null): Candidate[] {
  let trails: Trail[] = [];

  for (const [index, candidates] of candidateSets.entries()) {
    trails = candidates.map((candidate) => {
      if (index === 0) {
        return { cost: anchor ? haversineKm(anchor, candidate) : 0, chain: [candidate] };
      }

      let best: Trail | null = null;
      for (const trail of trails) {
        const previous = trail.chain.at(-1);
        if (!previous) continue;
        const cost = trail.cost + haversineKm(previous, candidate);
        if (!best || cost < best.cost) best = { cost, chain: [...trail.chain, candidate] };
      }
      return best ?? { cost: 0, chain: [candidate] };
    });
  }

  let best: Trail | null = null;
  for (const trail of trails) {
    if (!best || trail.cost < best.cost) best = trail;
  }
  return best?.chain ?? [];
}

type PathPoint = { position: [number, number]; ambiguous: boolean };

// positions are appended as the run is walked, so arrows are attached once the
// segment is final rather than per push
type SegmentDraft = Omit<RouteSegment, "arrows">;

function toSegments(points: PathPoint[], idPrefix: string): SegmentDraft[] {
  const segments: SegmentDraft[] = [];

  for (const [index, to] of points.entries()) {
    const from = index === 0 ? undefined : points[index - 1];
    if (!from) continue;

    const ambiguous = from.ambiguous || to.ambiguous;
    const previous = segments.at(-1);
    if (previous && previous.ambiguous === ambiguous) {
      previous.positions.push(to.position);
      continue;
    }
    segments.push({
      id: `${idPrefix}-${segments.length}`,
      positions: [from.position, to.position],
      ambiguous,
    });
  }

  return segments;
}

function buildSegments(hops: ResolvedHop[], anchor: Anchor | null): RouteSegment[] {
  const runs: PathPoint[][] = [];
  // the sender anchor is a display-name match, never a key match, so its leg is
  // always drawn as a guess
  let current: PathPoint[] = anchor
    ? [{ position: [anchor.lat, anchor.lon], ambiguous: true }]
    : [];

  for (const hop of hops) {
    if (!hop.chosen) {
      // an unknown node sits between the neighbours — draw nothing across it
      if (current.length > 1) runs.push(current);
      current = [];
      continue;
    }
    current.push({
      // the chosen chain is always drawn solid — hop ambiguity shows as the
      // fan of AlternativeEdges instead of as dashing
      position: [hop.chosen.lat, hop.chosen.lon],
      ambiguous: false,
    });
  }
  if (current.length > 1) runs.push(current);

  return runs
    .flatMap((points, index) => toSegments(points, `run${index}`))
    .map((segment) => ({ ...segment, arrows: segmentArrows(segment.positions) }));
}

type Point = { lat: number; lon: number };

function buildAlternatives(
  hops: Hop[],
  chosenByIndex: Map<number, Candidate>,
  anchor: Anchor | null,
): AlternativeEdge[] {
  const edges: AlternativeEdge[] = [];

  const push = (id: string, from: Point, to: Point): void => {
    // a zero-length edge (shared coordinates) draws nothing
    if (from.lat === to.lat && from.lon === to.lon) return;
    edges.push({
      id,
      positions: [
        [from.lat, from.lon],
        [to.lat, to.lon],
      ],
    });
  };

  // the sender fans out to every first-hop candidate the chain did not pick
  const first = hops[0];
  if (anchor && first) {
    const chosen = chosenByIndex.get(0);
    for (const [index, candidate] of first.candidates.entries()) {
      if (candidate === chosen) continue;
      push(`alt-anchor-${index}`, anchor, candidate);
    }
  }

  for (let index = 0; index + 1 < hops.length; index += 1) {
    const from = hops[index];
    const to = hops[index + 1];
    // a gap (zero candidates) breaks the chain, so no edges reach across it
    if (!from || !to || from.candidates.length === 0 || to.candidates.length === 0) continue;

    const chosenFrom = chosenByIndex.get(index);
    const chosenTo = chosenByIndex.get(index + 1);
    for (const [fromIndex, a] of from.candidates.entries()) {
      for (const [toIndex, b] of to.candidates.entries()) {
        // the chosen chain already draws this leg
        if (a === chosenFrom && b === chosenTo) continue;
        push(`alt-${index}-${fromIndex}-${toIndex}`, a, b);
      }
    }
  }

  return edges;
}

/**
 * Resolve a route's hops to concrete nodes and the polylines that draw them.
 * `anchor` is the sender's position when it could be identified; it seeds the
 * first run only, since a gap means the chain restarts from nothing known.
 */
export function resolveRoute(hops: Hop[], anchor: Anchor | null = null): ResolvedRoute {
  const chosenByIndex = new Map<number, Candidate>();
  let run: number[] = [];
  let anchorAvailable = anchor !== null;

  const flush = (): void => {
    if (run.length === 0) return;
    const chain = resolveRun(
      run.map((index) => hops[index]?.candidates ?? []),
      anchorAvailable ? anchor : null,
    );
    for (const [position, hopIndex] of run.entries()) {
      const candidate = chain[position];
      if (candidate) chosenByIndex.set(hopIndex, candidate);
    }
    anchorAvailable = false;
    run = [];
  };

  for (const [index, hop] of hops.entries()) {
    if (hop.candidates.length === 0) {
      flush();
      anchorAvailable = false;
      continue;
    }
    run.push(index);
  }
  flush();

  const resolved: ResolvedHop[] = hops.map((hop, index) => ({
    prefix: hop.prefix,
    chosen: chosenByIndex.get(index) ?? null,
    alternatives: Math.max(hop.candidates.length - 1, 0),
  }));

  return {
    hops: resolved,
    segments: buildSegments(resolved, anchor),
    alternatives: buildAlternatives(hops, chosenByIndex, anchor),
  };
}

/** Human-readable hop summary for the path tooltip. */
export function describeHop(hop: ResolvedHop): string {
  if (!hop.chosen) return `${hop.prefix}: unknown`;
  const name = hop.chosen.name ?? hop.chosen.publicKey.slice(0, 12);
  return hop.alternatives > 0
    ? `${hop.prefix}: ${name} (±${hop.alternatives} candidate${hop.alternatives === 1 ? "" : "s"})`
    : `${hop.prefix}: ${name}`;
}
