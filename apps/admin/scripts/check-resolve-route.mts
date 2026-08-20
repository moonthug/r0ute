/**
 * Assertions for @r0ute/ui's resolve-route. The repo has no test framework, so this
 * is a plain script: `pnpm --filter @r0ute/admin check`.
 */
import assert from "node:assert/strict";

import { type Candidate, type Hop, resolveRoute, segmentArrows } from "@r0ute/ui/resolve-route";

import type { GroupMessagePush } from "@r0ute/database";

function node(publicKey: string, lat: number, lon: number): Candidate {
  return { publicKey, name: publicKey.toUpperCase(), lat, lon };
}

function hop(prefix: string, ...candidates: Candidate[]): Hop {
  return { prefix, candidates };
}

// nodes strung north-to-south along one meridian, plus two decoys far away
const a = node("aa11", 53.0, -1.0);
const b = node("bb22", 53.1, -1.0);
const c = node("cc33", 53.2, -1.0);
const farNorth = node("bb99", 55.0, -1.0);
const farWest = node("bb77", 53.1, -4.0);

// 1. all-unique chain resolves in order
{
  const { hops, segments } = resolveRoute([hop("aa", a), hop("bb", b), hop("cc", c)]);

  assert.deepEqual(
    hops.map((entry) => entry.chosen?.publicKey),
    ["aa11", "bb22", "cc33"],
  );
  assert.deepEqual(
    hops.map((entry) => entry.alternatives),
    [0, 0, 0],
  );
  assert.equal(segments.length, 1, "one unbroken run");
  assert.equal(segments[0]?.ambiguous, false, "no ambiguity means a solid line");
  assert.deepEqual(segments[0]?.positions, [
    [53.0, -1.0],
    [53.1, -1.0],
    [53.2, -1.0],
  ]);
}

// 2. a 3-candidate middle hop picks the geometrically cheapest candidate, and
//    the chain stays solid — ambiguity renders as the alternative-edge fan
{
  const { hops, segments, alternatives } = resolveRoute([
    hop("aa", a),
    hop("bb", farNorth, farWest, b), // cheapest listed last, so order cannot flatter it
    hop("cc", c),
  ]);

  assert.equal(hops[1]?.chosen?.publicKey, "bb22", "minimum-total-distance chaining");
  assert.equal(hops[1]?.alternatives, 2);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.ambiguous, false, "the chosen chain is always drawn solid");
  // 1×3 edges in plus 3×1 edges out, minus the two the chosen chain draws
  assert.equal(alternatives.length, 4, "the fan shows every unchosen leg");
}

// 3. a zero-candidate hop yields a gap that splits the polyline runs
{
  const d = node("dd44", 53.3, -1.0);
  const { hops, segments } = resolveRoute([
    hop("aa", a),
    hop("bb", b),
    hop("zz"), // matches nothing known
    hop("cc", c),
    hop("dd", d),
  ]);

  assert.equal(hops[2]?.chosen, null, "an unresolvable hop has no chosen node");
  assert.equal(hops[2]?.alternatives, 0);
  assert.equal(segments.length, 2, "no line is drawn across the gap");
  assert.deepEqual(segments[0]?.positions, [
    [53.0, -1.0],
    [53.1, -1.0],
  ]);
  assert.deepEqual(segments[1]?.positions, [
    [53.2, -1.0],
    [53.3, -1.0],
  ]);
}

// 4. an empty route (direct message) yields no segments
{
  const { hops, segments } = resolveRoute([]);

  assert.deepEqual(hops, []);
  assert.deepEqual(segments, []);
}

// 5. duplicate prefixes in one route resolve independently
{
  const near = node("ab01", 53.05, -1.0);
  const far = node("ab02", 54.0, -1.0);
  const start = node("xx00", 53.0, -1.0);
  const middle = node("yy00", 53.9, -1.0);

  const { hops } = resolveRoute([
    hop("xx", start),
    hop("ab", near, far),
    hop("yy", middle),
    hop("ab", near, far),
  ]);

  assert.equal(hops[1]?.chosen?.publicKey, "ab01", "first occurrence hugs its neighbours");
  assert.equal(hops[3]?.chosen?.publicKey, "ab02", "second occurrence is resolved on its own");
  assert.equal(hops[1]?.alternatives, 1);
  assert.equal(hops[3]?.alternatives, 1);
}

// 6. a known sender anchors the chain and its leg is always drawn as a guess
{
  const { segments } = resolveRoute([hop("bb", b), hop("cc", c)], { lat: 52.9, lon: -1.0 });

  assert.equal(segments.length, 2, "the dashed anchor leg splits off the solid run");
  assert.equal(segments[0]?.ambiguous, true);
  assert.deepEqual(segments[0]?.positions, [
    [52.9, -1.0],
    [53.1, -1.0],
  ]);
  assert.equal(segments[1]?.ambiguous, false);
}

// 7. the anchor only seeds the first run — a gap restarts the chain from nothing
{
  const { segments } = resolveRoute([hop("zz"), hop("bb", b), hop("cc", c)], {
    lat: 52.9,
    lon: -1.0,
  });

  assert.equal(segments.length, 1, "no dashed leg reaches across the gap");
  assert.equal(segments[0]?.ambiguous, false);
}

// 8. arrow bearings are screen-space: 0 is north, growing clockwise
{
  const bearing = (from: [number, number], to: [number, number]): number => {
    const arrows = segmentArrows([from, to]);
    assert.equal(arrows.length, 1, "one arrow per leg");
    return arrows[0]?.angleDeg ?? Number.NaN;
  };

  assert.equal(bearing([53.0, -1.0], [53.2, -1.0]), 0, "north");
  assert.equal(bearing([53.0, -1.0], [53.0, -0.5]), 90, "east");
  assert.equal(bearing([53.2, -1.0], [53.0, -1.0]), 180, "south");
  assert.equal(bearing([53.0, -0.5], [53.0, -1.0]), 270, "west");

  // the arrow sits at the midpoint of its leg
  assert.deepEqual(
    segmentArrows([
      [53.0, -1.0],
      [53.2, -1.0],
    ])[0]?.position,
    [53.1, -1.0],
  );

  // longitude is scaled by cos(latitude), so equal deltas do not read as 45°
  const diagonal = bearing([53.0, -1.0], [53.1, -0.9]);
  assert.ok(
    diagonal > 31 && diagonal < 31.1,
    `expected the mercator-scaled bearing near 31.04°, got ${diagonal}`,
  );
  assert.ok(diagonal < 45, "unscaled longitude would have given 45°");
}

// 9. a leg of zero length has no direction, so it is skipped
{
  assert.deepEqual(
    segmentArrows([
      [53.0, -1.0],
      [53.0, -1.0],
    ]),
    [],
    "repeated node yields no arrow",
  );

  // a run of three points keeps the arrows either side of the dead leg
  const arrows = segmentArrows([
    [53.0, -1.0],
    [53.0, -1.0],
    [53.2, -1.0],
  ]);
  assert.equal(arrows.length, 1);
  assert.equal(arrows[0]?.angleDeg, 0);

  // and resolved segments carry them, one per drawn leg
  const { segments } = resolveRoute([hop("aa", a), hop("bb", b), hop("cc", c)]);
  assert.equal(segments[0]?.positions.length, 3);
  assert.equal(segments[0]?.arrows.length, 2, "two legs, two arrows");
  assert.deepEqual(
    segments[0]?.arrows.map((arrow) => arrow.angleDeg),
    [0, 0],
    "both legs run due north",
  );
}

// 10. alternative edges form the full bipartite fan and respect gaps
{
  const near = node("ab01", 53.05, -1.0);
  const far = node("ab02", 54.0, -1.0);

  // 1-2-1 shape: 1×2 + 2×1 = 4 edges, minus the 2 chosen legs
  const fan = resolveRoute([hop("aa", a), hop("ab", near, far), hop("cc", c)]);
  assert.equal(fan.alternatives.length, 2);
  assert.deepEqual(
    fan.alternatives.map((edge) => edge.id),
    ["alt-0-0-1", "alt-1-1-0"],
    "only the unchosen legs into and out of the ambiguous hop remain",
  );

  // no edges reach across a zero-candidate gap
  const gapped = resolveRoute([hop("aa", a), hop("zz"), hop("ab", near, far), hop("cc", c)]);
  assert.ok(
    gapped.alternatives.every(
      (edge) => !edge.id.startsWith("alt-0-") && !edge.id.startsWith("alt-1-"),
    ),
    "the gap has no incoming or outgoing edges",
  );
  // the run after the gap contributes 2×1 edges minus its chosen leg
  assert.equal(gapped.alternatives.length, 1, "the fan after the gap is intact");

  // the sender anchor fans out to unchosen first-hop candidates only
  const anchored = resolveRoute([hop("ab", near, far), hop("cc", c)], { lat: 53.0, lon: -1.0 });
  const anchorEdges = anchored.alternatives.filter((edge) => edge.id.startsWith("alt-anchor-"));
  assert.equal(anchorEdges.length, 1, "one unchosen first-hop candidate, one anchor edge");
  assert.deepEqual(anchorEdges[0]?.positions[1], [54.0, -1.0], "it reaches the losing candidate");

  // an alternative that would be zero-length is skipped
  const twin = node("ab03", 53.0, -1.0); // same coordinates as `a`
  const zeroLength = resolveRoute([hop("aa", a), hop("ab", twin, far)]);
  assert.ok(
    zeroLength.alternatives.every(
      (edge) => JSON.stringify(edge.positions[0]) !== JSON.stringify(edge.positions[1]),
    ),
    "no zero-length alternative edges",
  );
}

// 11. the worst-case group-message payload fits pg_notify's 8000-byte cap
let payloadBytes: number;
{
  const worstCase: GroupMessagePush = {
    type: "group-message",
    channel: "c".repeat(64),
    user: "u".repeat(64),
    // the widest hash is 3 bytes, and pathLen caps the hop count at 63
    route: Array.from({ length: 63 }, () => "abcdef"),
    senderTimestamp: 1786492800,
    receivedAt: new Date().toISOString(),
  };

  payloadBytes = Buffer.byteLength(JSON.stringify(worstCase));
  assert.ok(payloadBytes < 8000, `NOTIFY payload is ${payloadBytes} bytes, over the 8000 cap`);
}

console.log(`resolve-route: 11 cases passed (worst-case push payload ${payloadBytes} bytes)`);
