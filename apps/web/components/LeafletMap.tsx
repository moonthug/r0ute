"use client";

import "leaflet/dist/leaflet.css";
import "./map.css";
import { type DivIcon, divIcon } from "leaflet";
import { useEffect, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import {
  type AlternativeEdge,
  describeHop,
  type ResolvedHop,
  type RouteSegment,
} from "../lib/resolve-route";

export type MapLocation = {
  publicKey: string;
  name: string | null;
  lat: number;
  lon: number;
  advertTimestamp: string;
  receivedAt: string;
};

export type MapPath = {
  id: string;
  user: string;
  channel: string;
  hops: ResolvedHop[];
  segments: RouteSegment[];
  alternatives: AlternativeEdge[];
};

/**
 * Frame the initial viewport around the markers, once. A mean-of-coordinates
 * centre lets a single far-flung node drag the view into open sea; the bounding
 * box always shows every node. Live updates never re-fit — panning stays the
 * user's own.
 */
function FitToMarkers({ locations }: { locations: MapLocation[] }) {
  const map = useMap();
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    if (fitted || locations.length === 0) return;
    setFitted(true);
    map.fitBounds(
      locations.map((location) => [location.lat, location.lon]),
      { padding: [32, 32], maxZoom: 11 },
    );
  }, [map, fitted, locations]);
  return null;
}

/** Dev-only escape hatch so demos and screenshots can frame the viewport. */
function DevMapHandle() {
  const map = useMap();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as { __r0uteMap?: unknown }).__r0uteMap = map;
    return () => {
      delete (window as { __r0uteMap?: unknown }).__r0uteMap;
    };
  }, [map]);
  return null;
}

const FALLBACK_CENTER: [number, number] = [53.1442947, -1.5428249]; // Matlock
const PATH_COLOR = "#f97316"; // distinct from the indigo marker fill
const ARROW_PX = 16;

// an icon only ever depends on its angle, so whole-degree buckets let every
// arrow reuse one instance and leaflet skip rebuilding the element each render
const arrowIcons = new Map<number, DivIcon>();

function arrowIcon(angleDeg: number): DivIcon {
  const degrees = Math.round(angleDeg) % 360;
  const cached = arrowIcons.get(degrees);
  if (cached) return cached;

  const icon = divIcon({
    className: "route-arrow", // replaces leaflet's boxed div-icon default
    html: `<svg viewBox="0 0 16 16" style="transform: rotate(${degrees}deg)"><path d="M8 1.5 14 14 8 10.6 2 14Z"/></svg>`,
    iconSize: [ARROW_PX, ARROW_PX],
    iconAnchor: [ARROW_PX / 2, ARROW_PX / 2],
  });
  arrowIcons.set(degrees, icon);
  return icon;
}

export default function LeafletMap({
  locations,
  pulses,
  paths,
}: {
  locations: MapLocation[];
  pulses: Record<string, number>;
  paths: MapPath[];
}) {
  // which marker has its popup open, and the pulse counter it was opened at
  const [openPopup, setOpenPopup] = useState<{ publicKey: string; seq: number } | null>(null);

  return (
    // the fallback centre only shows until FitToMarkers frames the real nodes
    <MapContainer center={FALLBACK_CENTER} zoom={10} style={{ height: "100%", width: "100%" }}>
      <FitToMarkers locations={locations} />
      <DevMapHandle />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locations.map((location) => {
        // a remount would tear down an open popup, so a marker being read holds
        // its key steady and skips the pulse until the user closes it
        const frozen = openPopup?.publicKey === location.publicKey ? openPopup.seq : null;
        const pulse = frozen ?? pulses[location.publicKey];
        return (
          <CircleMarker
            // className cannot be changed after mount, so the key carries the
            // pulse counter and the marker remounts with the animated class
            key={`${location.publicKey}:${pulse ?? 0}`}
            center={[location.lat, location.lon]}
            radius={8}
            eventHandlers={{
              popupopen: () =>
                setOpenPopup({
                  publicKey: location.publicKey,
                  seq: pulses[location.publicKey] ?? 0,
                }),
              popupclose: () =>
                setOpenPopup((current) =>
                  current?.publicKey === location.publicKey ? null : current,
                ),
            }}
            pathOptions={{
              color: "#ffffff", // ring so overlapping markers stay separable
              weight: 2,
              fillColor: "#4338ca",
              fillOpacity: 0.85,
              className: pulse ? "node-marker pulse" : "node-marker",
            }}
          >
            <Popup>
              <strong>{location.name ?? `${location.publicKey.slice(0, 12)}…`}</strong>
              <br />
              Last advert: {new Date(location.advertTimestamp).toLocaleString()}
              <br />
              Last heard: {new Date(location.receivedAt).toLocaleString()}
            </Popup>
          </CircleMarker>
        );
      })}
      {paths.map((path) =>
        // rendered before the chosen chain so the solid line draws on top
        path.alternatives.map((edge) => (
          <Polyline
            key={`${path.id}:${edge.id}`}
            positions={edge.positions}
            interactive={false}
            pathOptions={{ color: PATH_COLOR, weight: 2, opacity: 0.7, dashArray: "4 6" }}
          />
        )),
      )}
      {paths.map((path) =>
        path.segments.map((segment) => (
          <Polyline
            key={`${path.id}:${segment.id}`}
            positions={segment.positions}
            pathOptions={{
              color: PATH_COLOR,
              weight: 3,
              opacity: 0.9,
              // only the name-guessed sender leg is dashed; hop ambiguity is
              // shown by the alternative-edge fan instead
              ...(segment.ambiguous ? { dashArray: "6 8" } : {}),
            }}
          >
            <Tooltip sticky>
              <strong>
                {path.user} → {path.channel}
              </strong>
              <br />
              {path.hops.length} hop{path.hops.length === 1 ? "" : "s"}
              <br />
              {path.hops.map(describeHop).join(" → ")}
            </Tooltip>
          </Polyline>
        )),
      )}
      {paths.map((path) =>
        path.segments.flatMap((segment) =>
          segment.arrows.map((arrow) => (
            <Marker
              key={`${path.id}:${segment.id}:${arrow.id}`}
              position={arrow.position}
              icon={arrowIcon(arrow.angleDeg)}
              // purely decorative: never steal a click from the node underneath
              interactive={false}
              keyboard={false}
            />
          )),
        ),
      )}
    </MapContainer>
  );
}
