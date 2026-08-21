import type { MapAnchor, MapDestination, MapLocation, MapPath } from "@r0ute/ui/map";
import { type Hop, resolveRoute } from "@r0ute/ui/resolve-route";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isPathSlug, isValidCoordinate } from "@r0ute/database";

import { RouteTable } from "../../../components/RouteTable.tsx";
import { RouteView } from "../../../components/RouteView.tsx";
import { db } from "../../../lib/db.ts";

export const dynamic = "force-dynamic";

type PathPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PathPageProps) {
  const { id } = await params;
  return { title: `r0ute — path #${id}` };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// every monitored channel funnels into the bot's receiver behind this repeater,
// so all routes end there; its live DB record tracks the node as it re-adverts
const RECEIVER_PUBLIC_KEY =
  process.env.RECEIVER_PUBLIC_KEY ??
  "fa0c61aaf6d550cce54e8ad8a5133148b2d63d92d14320a72009c4a01fd34a18";

// Matlock, where the receiver lives — used only if its node is missing from the DB
const FALLBACK_DESTINATION: MapDestination = {
  lat: 53.1442947,
  lon: -1.5428249,
  name: "Matlock",
};

export default async function PathRequestPage({ params }: PathPageProps) {
  const { id } = await params;

  // links now carry the short slug, but uuids already shared keep working
  const isUuid = UUID_PATTERN.test(id);
  if (!isUuid && !isPathSlug(id)) notFound();

  const pathRequest = await db.pathRequest.findUnique({
    where: isUuid ? { id } : { slug: id.toLowerCase() },
    include: { path: { orderBy: { position: "asc" }, include: { location: true } } },
  });
  // expired requests may linger until the next lazy purge, so the expiry is
  // enforced here too
  if (!pathRequest || pathRequest.expiresAt <= new Date()) notFound();

  // the sender's own node is stored alongside the packet hops but anchors the
  // chain rather than counting as a hop
  const senderHop = pathRequest.path.find((hop) => hop.isSender);
  const prefixes = pathRequest.path.filter((hop) => !hop.isSender).map((hop) => hop.hash);

  // hops are truncated key prefixes, so candidates are looked up live rather
  // than trusting the single resolution stored at write time — nodes heard
  // since then sharpen the picture
  const [candidateRows, senderRows, receiverRow] = await Promise.all([
    prefixes.length
      ? db.location.findMany({
          where: { OR: prefixes.map((prefix) => ({ publicKey: { startsWith: prefix } })) },
        })
      : Promise.resolve([]),
    // older requests predate the stored sender hop, so fall back to a live
    // name lookup for them
    senderHop
      ? Promise.resolve([])
      : db.location.findMany({ where: { name: pathRequest.userName } }),
    db.location.findUnique({ where: { publicKey: RECEIVER_PUBLIC_KEY } }),
  ]);

  const validRows = candidateRows.filter((row) => isValidCoordinate(row.lat, row.lon));

  const destination: MapDestination =
    receiverRow && isValidCoordinate(receiverRow.lat, receiverRow.lon)
      ? { lat: receiverRow.lat, lon: receiverRow.lon, name: receiverRow.name ?? "Matlock" }
      : FALLBACK_DESTINATION;

  const hops: Hop[] = prefixes.map((prefix) => ({
    prefix,
    candidates: validRows
      .filter((row) => row.publicKey.startsWith(prefix))
      .map((row) => ({ publicKey: row.publicKey, name: row.name, lat: row.lat, lon: row.lon })),
  }));

  // display names are neither unique nor verified, so only an unambiguous
  // match is trusted enough to anchor the chain from the sender
  const senderMatches = senderRows.filter((row) => isValidCoordinate(row.lat, row.lon));
  const storedSender =
    senderHop?.location && isValidCoordinate(senderHop.location.lat, senderHop.location.lon)
      ? senderHop.location
      : undefined;
  const sender = storedSender ?? (senderMatches.length === 1 ? senderMatches[0] : undefined);
  const anchor: MapAnchor | null = sender
    ? { lat: sender.lat, lon: sender.lon, name: pathRequest.userName }
    : null;

  // the table lists hops by truncated key, so the sender's full key is cut to
  // the same width (2–3 bytes) to read as one column
  const senderPrefixLength = Math.min(6, Math.max(4, prefixes[0]?.length ?? 4));
  const tableSender = sender
    ? { prefix: sender.publicKey.slice(0, senderPrefixLength), name: pathRequest.userName }
    : null;

  const route = resolveRoute(hops, anchor, destination);

  // when the route already ends at the receiver node, its own marker is the
  // endpoint — the extra red point (and its leg, already zero-length) is noise
  const endsAtReceiver =
    receiverRow !== null && route.hops.at(-1)?.chosen?.publicKey === receiverRow.publicKey;

  // client components need serializable props — Dates become ISO strings
  const locations: MapLocation[] = [
    ...new Map(validRows.map((row) => [row.publicKey, row])).values(),
  ].map((row) => ({
    publicKey: row.publicKey,
    name: row.name,
    nodeType: row.nodeType,
    lat: row.lat,
    lon: row.lon,
    advertTimestamp: row.advertTimestamp.toISOString(),
  }));

  const paths: MapPath[] = [
    {
      id: pathRequest.id,
      label: `${pathRequest.userName} — path #${pathRequest.slug}`,
      variant: "message",
      hops: route.hops,
      segments: route.segments,
      alternatives: route.alternatives,
    },
  ];

  const unknown = route.hops.filter((hop) => !hop.chosen).length;

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <Link href="/" className="m-0 font-mono text-lg font-bold tracking-tight text-cyan-400">
          r0ute
        </Link>
        <span className="text-sm text-neutral-400">
          path #{pathRequest.slug} · {pathRequest.userName} ·{" "}
          {hops.length === 0 ? "direct" : `${hops.length} hop${hops.length === 1 ? "" : "s"}`}
          {unknown > 0 ? ` (${unknown} unknown)` : ""}
        </span>
        <span className="ml-auto text-xs text-neutral-500">
          {pathRequest.requestTimestamp.toUTCString()}
        </span>
      </header>
      <div className="relative min-h-0 flex-1">
        <RouteView
          locations={locations}
          paths={paths}
          anchor={anchor}
          destination={endsAtReceiver ? null : destination}
        />
        <RouteTable hops={route.hops} sender={tableSender} />
      </div>
    </main>
  );
}
