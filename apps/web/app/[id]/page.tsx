import Link from "next/link";
import { notFound } from "next/navigation";

import { isValidCoordinate } from "@r0ute/database";

import type { RouteMarker } from "../../components/RouteMap";
import { RouteView } from "../../components/RouteView";
import { db } from "../../lib/db";
import { type Anchor, describeHop, type Hop, resolveRoute } from "../../lib/resolve-route";

export const dynamic = "force-dynamic";

type PathPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PathPageProps) {
  const { id } = await params;
  return { title: `r0ute — path #${id}` };
}

export default async function PathRequestPage({ params }: PathPageProps) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();

  const pathRequest = await db.pathRequest.findUnique({
    where: { id: Number.parseInt(id, 10) },
    include: { path: { orderBy: { position: "asc" } } },
  });
  if (!pathRequest) notFound();

  const prefixes = pathRequest.path.map((hop) => hop.hash);

  // hops are truncated key prefixes, so candidates are looked up live rather
  // than trusting the single resolution stored at write time — nodes heard
  // since then sharpen the picture
  const [candidateRows, senderRows] = await Promise.all([
    prefixes.length
      ? db.location.findMany({
          where: { OR: prefixes.map((prefix) => ({ publicKey: { startsWith: prefix } })) },
        })
      : Promise.resolve([]),
    db.location.findMany({ where: { name: pathRequest.userName } }),
  ]);

  const validRows = candidateRows.filter((row) => isValidCoordinate(row.lat, row.lon));

  const hops: Hop[] = prefixes.map((prefix) => ({
    prefix,
    candidates: validRows
      .filter((row) => row.publicKey.startsWith(prefix))
      .map((row) => ({ publicKey: row.publicKey, name: row.name, lat: row.lat, lon: row.lon })),
  }));

  // display names are neither unique nor verified, so only an unambiguous
  // match is trusted enough to anchor the chain from the sender
  const senderMatches = senderRows.filter((row) => isValidCoordinate(row.lat, row.lon));
  const sender = senderMatches.length === 1 ? senderMatches[0] : undefined;
  const anchor: Anchor | null = sender ? { lat: sender.lat, lon: sender.lon } : null;

  const route = resolveRoute(hops, anchor);

  // client components need serializable props — Dates become ISO strings
  const markers: RouteMarker[] = [
    ...new Map(validRows.map((row) => [row.publicKey, row])).values(),
  ].map((row) => ({
    publicKey: row.publicKey,
    name: row.name,
    nodeType: row.nodeType,
    lat: row.lat,
    lon: row.lon,
    advertTimestamp: row.advertTimestamp.toISOString(),
  }));

  const unknown = hops.filter((hop) => hop.candidates.length === 0).length;

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <Link href="/" className="m-0 font-mono text-lg font-bold tracking-tight text-cyan-400">
          r0ute
        </Link>
        <span className="text-sm text-neutral-400">
          path #{pathRequest.id} · {pathRequest.userName} ·{" "}
          {hops.length === 0 ? "direct" : `${hops.length} hop${hops.length === 1 ? "" : "s"}`}
          {unknown > 0 ? ` (${unknown} unknown)` : ""}
        </span>
        <span className="ml-auto text-xs text-neutral-500">
          {pathRequest.requestTimestamp.toUTCString()}
        </span>
      </header>
      <div className="border-b border-neutral-800 bg-neutral-950 px-4 py-1.5 font-mono text-xs text-neutral-400">
        {hops.length === 0
          ? "This message reached the bot directly — no repeaters to draw."
          : route.hops.map(describeHop).join(" → ")}
      </div>
      <div className="min-h-0 flex-1">
        <RouteView
          label={`${pathRequest.userName} — path #${pathRequest.id}`}
          senderName={pathRequest.userName}
          anchor={anchor}
          markers={markers}
          route={route}
        />
      </div>
    </main>
  );
}
