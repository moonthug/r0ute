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

import type { NodeType } from "@r0ute/database";

import { nodeStyle } from "./node-types.ts";
import {
  type AlternativeEdge,
  describeHop,
  type ResolvedHop,
  type RouteSegment,
  segmentArrows,
} from "./resolve-route.ts";

export type MapLocation = {
  publicKey: string;
  name: string | null;
  nodeType: NodeType | null;
  lat: number;
  lon: number;
  advertTimestamp: string;
  /** when omitted, the popup skips the "Last heard" line */
  receivedAt?: string;
};

export type PathVariant = "message" | "packet";

export type MapPath = {
  id: string;
  label: string;
  variant: PathVariant;
  hops: ResolvedHop[];
  segments: RouteSegment[];
  alternatives: AlternativeEdge[];
};

/** A sender position guessed by display name, drawn as its own marker. */
export type MapAnchor = {
  lat: number;
  lon: number;
  name: string;
};

/**
 * Frame the initial viewport around the markers, once. A mean-of-coordinates
 * centre lets a single far-flung node drag the view into open sea; the bounding
 * box always shows every node. Live updates never re-fit — panning stays the
 * user's own.
 */
function FitToMarkers({
  positions,
  padding,
  maxZoom,
}: {
  positions: [number, number][];
  padding: number;
  maxZoom: number;
}) {
  const map = useMap();
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    if (fitted || positions.length === 0) return;
    setFitted(true);
    map.fitBounds(positions, { padding: [padding, padding], maxZoom });
  }, [map, fitted, positions, padding, maxZoom]);
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

/** marker ring: the fill lightened toward white, so overlapping markers stay separable without a hard outline */
function lighten(hex: string, factor = 0.3): string {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16);
    return Math.round(channel + (255 - channel) * factor);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
// both distinct from the cyan marker fill: orange = decoded messages,
// violet = opaque routed packets
const PATH_COLORS: Record<PathVariant, string> = {
  message: "#f97316",
  packet: "#a78bfa",
};
const ARROW_PX = { main: 16, alt: 12 } as const;

type ArrowWeight = keyof typeof ARROW_PX;

// an icon only depends on its angle, weight and palette, so whole-degree
// buckets let every arrow reuse one instance and leaflet skip rebuilding
const arrowIcons = new Map<string, DivIcon>();

function arrowIcon(angleDeg: number, weight: ArrowWeight, variant: PathVariant): DivIcon {
  const degrees = Math.round(angleDeg) % 360;
  const key = `${variant}:${weight}:${degrees}`;
  const cached = arrowIcons.get(key);
  if (cached) return cached;

  const size = ARROW_PX[weight];
  const classNames = [
    "route-arrow", // replaces leaflet's boxed div-icon default
    ...(weight === "alt" ? ["route-arrow-alt"] : []),
    ...(variant === "packet" ? ["route-arrow-packet"] : []),
  ];
  const icon = divIcon({
    className: classNames.join(" "),
    html: `<svg viewBox="0 0 16 16" style="transform: rotate(${degrees}deg)"><path d="M8 1.5 14 14 8 10.6 2 14Z"/></svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  arrowIcons.set(key, icon);
  return icon;
}

export default function LeafletMap({
  locations,
  pulses = {},
  paths,
  anchor = null,
  interactivePaths = true,
  fitPadding = 32,
  fitMaxZoom = 11,
}: {
  locations: MapLocation[];
  /** bump a node's counter to remount its marker with the pulse animation */
  pulses?: Record<string, number>;
  paths: MapPath[];
  anchor?: MapAnchor | null;
  /** hover tooltips and pointer events on the route lines */
  interactivePaths?: boolean;
  fitPadding?: number;
  fitMaxZoom?: number;
}) {
  // which marker has its popup open, and the pulse counter it was opened at
  const [openPopup, setOpenPopup] = useState<{ publicKey: string; seq: number } | null>(null);

  const framed: [number, number][] = [
    ...locations.map((location): [number, number] => [location.lat, location.lon]),
    ...(anchor ? [[anchor.lat, anchor.lon] as [number, number]] : []),
  ];

  return (
    // the fallback centre only shows until FitToMarkers frames the real nodes
    <MapContainer center={FALLBACK_CENTER} zoom={10} style={{ height: "100%", width: "100%" }}>
      <FitToMarkers positions={framed} padding={fitPadding} maxZoom={fitMaxZoom} />
      <DevMapHandle />
      {/* dark, label-light basemap: the mesh is the subject, not the roads */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {paths.map((path) =>
        // rendered before the chosen chain so the solid line draws on top
        path.alternatives.map((edge) => (
          <Polyline
            key={`${path.id}:${edge.id}`}
            positions={edge.positions}
            interactive={false}
            pathOptions={{
              color: PATH_COLORS[path.variant],
              weight: 2,
              opacity: 0.6,
              dashArray: "4 6",
              className: path.variant === "packet" ? "route-alt route-alt-packet" : "route-alt",
            }}
          />
        )),
      )}
      {paths.map((path) =>
        path.segments.map((segment) => (
          <Polyline
            key={`${path.id}:${segment.id}`}
            positions={segment.positions}
            interactive={interactivePaths}
            pathOptions={{
              color: PATH_COLORS[path.variant],
              weight: 3,
              opacity: 0.95,
              className: path.variant === "packet" ? "route-line route-line-packet" : "route-line",
              // only the name-guessed sender leg is dashed; hop ambiguity is
              // shown by the alternative-edge fan instead
              ...(segment.ambiguous ? { dashArray: "6 8" } : {}),
            }}
          >
            {interactivePaths && (
              <Tooltip sticky>
                <strong>{path.label}</strong>
                <br />
                {path.hops.length} hop{path.hops.length === 1 ? "" : "s"}
                <br />
                {path.hops.map(describeHop).join(" → ")}
              </Tooltip>
            )}
          </Polyline>
        )),
      )}
      {paths.map((path) =>
        path.alternatives.flatMap((edge) =>
          segmentArrows(edge.positions).map((arrow) => (
            <Marker
              key={`${path.id}:${edge.id}:${arrow.id}`}
              position={arrow.position}
              icon={arrowIcon(arrow.angleDeg, "alt", path.variant)}
              // purely decorative: never steal a click from the node underneath
              interactive={false}
              keyboard={false}
            />
          )),
        ),
      )}
      {paths.map((path) =>
        path.segments.flatMap((segment) =>
          segment.arrows.map((arrow) => (
            <Marker
              key={`${path.id}:${segment.id}:${arrow.id}`}
              position={arrow.position}
              icon={arrowIcon(arrow.angleDeg, "main", path.variant)}
              // purely decorative: never steal a click from the node underneath
              interactive={false}
              keyboard={false}
            />
          )),
        ),
      )}
      {locations.map((location) => {
        // a remount would tear down an open popup, so a marker being read holds
        // its key steady and skips the pulse until the user closes it
        const frozen = openPopup?.publicKey === location.publicKey ? openPopup.seq : null;
        const pulse = frozen ?? pulses[location.publicKey];
        const style = nodeStyle(location.nodeType);
        return (
          <CircleMarker
            // className cannot be changed after mount, so the key carries the
            // pulse counter and the marker remounts with the animated class
            key={`${location.publicKey}:${pulse ?? 0}`}
            center={[location.lat, location.lon]}
            radius={style.radius}
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
              color: lighten(style.color),
              weight: 2,
              fillColor: style.color,
              fillOpacity: 0.9,
              className: `node-marker ${style.className}${pulse ? " pulse" : ""}`,
            }}
          >
            <Popup>
              <strong>{location.name ?? `${location.publicKey.slice(0, 12)}…`}</strong>
              {location.name && (
                <>
                  <br />
                  <span style={{ fontFamily: "monospace" }}>
                    {location.publicKey.slice(0, 12)}…
                  </span>
                </>
              )}
              <br />
              <span style={{ color: style.color }}>{style.label}</span>
              <br />
              Last advert: {new Date(location.advertTimestamp).toLocaleString()}
              {location.receivedAt && (
                <>
                  <br />
                  Last heard: {new Date(location.receivedAt).toLocaleString()}
                </>
              )}
            </Popup>
          </CircleMarker>
        );
      })}
      {anchor && (
        <CircleMarker
          center={[anchor.lat, anchor.lon]}
          radius={6}
          pathOptions={{
            color: lighten("#22d3ee"),
            weight: 2,
            fillColor: "#22d3ee",
            fillOpacity: 0.9,
            className: "node-marker",
          }}
        >
          <Popup>
            <strong>{anchor.name}</strong>
            <br />
            Sender (matched by name — position is a guess)
          </Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
