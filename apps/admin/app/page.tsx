import { isValidCoordinate } from "@r0ute/database";
import { LocationMap } from "../components/LocationMap";
import { db } from "../lib/db";
import { LEGEND } from "../lib/node-types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const locations = await db.location.findMany({
    orderBy: { receivedAt: "desc" },
  });

  // client components need serializable props — Dates become ISO strings.
  // rows written before coordinate validation existed may carry garbage
  const markers = locations
    .filter((location) => isValidCoordinate(location.lat, location.lon))
    .map((location) => ({
      publicKey: location.publicKey,
      name: location.name,
      nodeType: location.nodeType,
      lat: location.lat,
      lon: location.lon,
      advertTimestamp: location.advertTimestamp.toISOString(),
      receivedAt: location.receivedAt.toISOString(),
    }));

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-baseline gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <h1 className="m-0 font-mono text-lg font-bold tracking-tight text-cyan-400">r0ute</h1>
        <span className="text-sm text-neutral-400">
          {markers.length} node{markers.length === 1 ? "" : "s"} with a known location
        </span>
        <ul className="m-0 ml-auto flex list-none gap-4 p-0 text-xs text-neutral-400">
          {LEGEND.map((style) => (
            <li key={style.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: style.color, boxShadow: `0 0 4px ${style.color}` }}
              />
              {style.label}
            </li>
          ))}
        </ul>
      </header>
      <div className="min-h-0 flex-1">
        <LocationMap locations={markers} />
      </div>
    </main>
  );
}
