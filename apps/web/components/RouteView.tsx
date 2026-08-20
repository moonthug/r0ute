"use client";

import nextDynamic from "next/dynamic";

import type { Anchor, ResolvedRoute } from "../lib/resolve-route";
import type { RouteMarker } from "./RouteMap";

// leaflet touches `window` at import time, so the map must never render on the server
const RouteMap = nextDynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => <p className="p-4 text-neutral-400">Loading map…</p>,
});

export function RouteView(props: {
  label: string;
  senderName: string;
  anchor: Anchor | null;
  markers: RouteMarker[];
  route: ResolvedRoute;
}) {
  return <RouteMap {...props} />;
}
