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

import { nodeStyle } from "../lib/node-types";
import { type Anchor, describeHop, type ResolvedRoute, segmentArrows } from "../lib/resolve-route";

export type RouteMarker = {
  publicKey: string;
  name: string | null;
  nodeType: NodeType | null;
  lat: number;
  lon: number;
  advertTimestamp: string;
};

const FALLBACK_CENTER: [number, number] = [53.1442947, -1.5428249]; // Matlock
const ROUTE_COLOR = "#f97316";
const ARROW_PX = { main: 16, alt: 12 } as const;

type ArrowWeight = keyof typeof ARROW_PX;

/** Frame the viewport around the route once; panning stays the user's own. */
function FitToRoute({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    if (fitted || positions.length === 0) return;
    setFitted(true);
    map.fitBounds(positions, { padding: [48, 48], maxZoom: 12 });
  }, [map, fitted, positions]);
  return null;
}

// an icon only depends on its angle and weight, so whole-degree buckets let
// every arrow reuse one instance and leaflet skip rebuilding
const arrowIcons = new Map<string, DivIcon>();

function arrowIcon(angleDeg: number, weight: ArrowWeight): DivIcon {
  const degrees = Math.round(angleDeg) % 360;
  const key = `${weight}:${degrees}`;
  const cached = arrowIcons.get(key);
  if (cached) return cached;

  const size = ARROW_PX[weight];
  const icon = divIcon({
    className: weight === "alt" ? "route-arrow route-arrow-alt" : "route-arrow",
    html: `<svg viewBox="0 0 16 16" style="transform: rotate(${degrees}deg)"><path d="M8 1.5 14 14 8 10.6 2 14Z"/></svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  arrowIcons.set(key, icon);
  return icon;
}

export default function RouteMap({
  label,
  senderName,
  anchor,
  markers,
  route,
}: {
  /** tooltip headline for the route line */
  label: string;
  senderName: string;
  /** the sender's own last-known position, when their name matched a node */
  anchor: Anchor | null;
  markers: RouteMarker[];
  route: ResolvedRoute;
}) {
  const framed: [number, number][] = [
    ...markers.map((marker): [number, number] => [marker.lat, marker.lon]),
    ...(anchor ? [[anchor.lat, anchor.lon] as [number, number]] : []),
  ];

  return (
    <MapContainer center={FALLBACK_CENTER} zoom={10} style={{ height: "100%", width: "100%" }}>
      <FitToRoute positions={framed} />
      {/* dark, label-light basemap: the mesh is the subject, not the roads */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {/* alternatives first so the chosen chain draws on top */}
      {route.alternatives.map((edge) => (
        <Polyline
          key={edge.id}
          positions={edge.positions}
          interactive={false}
          pathOptions={{
            color: ROUTE_COLOR,
            weight: 2,
            opacity: 0.6,
            dashArray: "4 6",
            className: "route-alt",
          }}
        />
      ))}
      {route.segments.map((segment) => (
        <Polyline
          key={segment.id}
          positions={segment.positions}
          pathOptions={{
            color: ROUTE_COLOR,
            weight: 3,
            opacity: 0.95,
            className: "route-line",
            // only the name-guessed sender leg is dashed; hop ambiguity is
            // shown by the alternative-edge fan instead
            ...(segment.ambiguous ? { dashArray: "6 8" } : {}),
          }}
        >
          <Tooltip sticky>
            <strong>{label}</strong>
            <br />
            {route.hops.map(describeHop).join(" → ")}
          </Tooltip>
        </Polyline>
      ))}
      {route.alternatives.flatMap((edge) =>
        segmentArrows(edge.positions).map((arrow) => (
          <Marker
            key={`${edge.id}:${arrow.id}`}
            position={arrow.position}
            icon={arrowIcon(arrow.angleDeg, "alt")}
            // purely decorative: never steal a click from the node underneath
            interactive={false}
            keyboard={false}
          />
        )),
      )}
      {route.segments.flatMap((segment) =>
        segment.arrows.map((arrow) => (
          <Marker
            key={`${segment.id}:${arrow.id}`}
            position={arrow.position}
            icon={arrowIcon(arrow.angleDeg, "main")}
            interactive={false}
            keyboard={false}
          />
        )),
      )}
      {anchor && (
        <CircleMarker
          center={[anchor.lat, anchor.lon]}
          radius={6}
          pathOptions={{
            color: "#0a0a0a",
            weight: 2,
            fillColor: "#22d3ee",
            fillOpacity: 0.9,
            className: "node-marker",
          }}
        >
          <Popup>
            <strong>{senderName}</strong>
            <br />
            Sender (matched by name — position is a guess)
          </Popup>
        </CircleMarker>
      )}
      {markers.map((marker) => {
        const style = nodeStyle(marker.nodeType);
        return (
          <CircleMarker
            key={marker.publicKey}
            center={[marker.lat, marker.lon]}
            radius={style.radius}
            pathOptions={{
              color: "#0a0a0a", // dark ring so overlapping markers stay separable
              weight: 2,
              fillColor: style.color,
              fillOpacity: 0.9,
              className: `node-marker ${style.className}`,
            }}
          >
            <Popup>
              <strong>{marker.name ?? `${marker.publicKey.slice(0, 12)}…`}</strong>
              <br />
              <span style={{ color: style.color }}>{style.label}</span>
              <br />
              Last advert: {new Date(marker.advertTimestamp).toLocaleString()}
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
