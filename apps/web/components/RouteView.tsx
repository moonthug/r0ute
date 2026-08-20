"use client";

import type { MapAnchor, MapLocation, MapPath } from "@r0ute/ui/map";
import nextDynamic from "next/dynamic";

// leaflet touches `window` at import time, so the map must never render on the server
const LeafletMap = nextDynamic(() => import("@r0ute/ui/map"), {
  ssr: false,
  loading: () => <p className="p-4 text-neutral-400">Loading map…</p>,
});

export function RouteView({
  locations,
  paths,
  anchor,
}: {
  locations: MapLocation[];
  paths: MapPath[];
  anchor: MapAnchor | null;
}) {
  return (
    <LeafletMap
      locations={locations}
      paths={paths}
      anchor={anchor}
      // the hop table overlay carries the route details instead
      interactivePaths={false}
      fitPadding={48}
      fitMaxZoom={12}
    />
  );
}
