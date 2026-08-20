"use client";

import nextDynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AdvertPush, NodeType } from "@r0ute/database";

import { NODE_STYLES, nodeStyle } from "../lib/node-types";
import { type Anchor, type Candidate, type Hop, resolveRoute } from "../lib/resolve-route";
import type { MapLocation, MapPath, PathVariant } from "./LeafletMap";
import { PacketFeed, type PacketRow } from "./PacketFeed";

// leaflet touches `window` at import time, so the map must never render on the server
const LeafletMap = nextDynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <p className="p-4 text-neutral-400">Loading map…</p>,
});

const PULSE_MS = 4_000; // covers the three CSS iterations, then the class is dropped
const PATH_TTL_MS = 20_000;
const MAX_PATHS = 10;
const MAX_PACKETS = 50;

type GroupMessageEvent = {
  channel: string;
  user: string;
  hops: Hop[];
  receivedAt: string;
};

type RoutePacketEvent = {
  packetType: string;
  hops: Hop[];
  snr: number | null;
  rssi: number | null;
  receivedAt: string;
};

/** what applyPath needs to draw any routed event */
type PathInput = {
  label: string;
  hops: Hop[];
  variant: PathVariant;
  /** display name to anchor the chain from, when one is known */
  anchorUser?: string;
};

/** the original event a feed row was built from, kept for replay-on-click */
type PacketPayload = { kind: "advert"; advert: AdvertPush } | { kind: "path"; path: PathInput };

function parseHops(value: unknown): Hop[] | null {
  if (!Array.isArray(value)) return null;

  const hops: Hop[] = [];
  for (const hop of value) {
    if (typeof hop !== "object" || hop === null) return null;
    const { prefix, candidates } = hop as Record<string, unknown>;
    if (typeof prefix !== "string") return null;
    const parsedCandidates = (Array.isArray(candidates) ? candidates : [])
      .map((candidate): Candidate | null => {
        if (typeof candidate !== "object" || candidate === null) return null;
        const { publicKey, name, lat, lon } = candidate as Record<string, unknown>;
        if (typeof publicKey !== "string" || typeof lat !== "number" || typeof lon !== "number") {
          return null;
        }
        return { publicKey, name: typeof name === "string" ? name : null, lat, lon };
      })
      .filter((candidate): candidate is Candidate => candidate !== null);
    hops.push({ prefix, candidates: parsedCandidates });
  }
  return hops;
}

function parseAdvert(value: Record<string, unknown>): AdvertPush | null {
  const { publicKey, name, nodeType, lat, lon, advertTimestamp, receivedAt } = value;
  if (typeof publicKey !== "string" || typeof lat !== "number" || typeof lon !== "number") {
    return null;
  }

  const now = new Date().toISOString();
  return {
    type: "advert",
    publicKey,
    name: typeof name === "string" ? name : null,
    nodeType:
      typeof nodeType === "string" && nodeType in NODE_STYLES ? (nodeType as NodeType) : null,
    lat,
    lon,
    advertTimestamp: typeof advertTimestamp === "string" ? advertTimestamp : now,
    receivedAt: typeof receivedAt === "string" ? receivedAt : now,
  };
}

function parseGroupMessage(value: Record<string, unknown>): GroupMessageEvent | null {
  const { channel, user, hops, receivedAt } = value;
  if (typeof channel !== "string" || typeof user !== "string") return null;

  const parsedHops = parseHops(hops);
  if (!parsedHops) return null;

  return {
    channel,
    user,
    hops: parsedHops,
    receivedAt: typeof receivedAt === "string" ? receivedAt : new Date().toISOString(),
  };
}

function parseRoutePacket(value: Record<string, unknown>): RoutePacketEvent | null {
  const { packetType, hops, snr, rssi, receivedAt } = value;
  if (typeof packetType !== "string") return null;

  const parsedHops = parseHops(hops);
  if (!parsedHops) return null;

  return {
    packetType,
    hops: parsedHops,
    snr: typeof snr === "number" ? snr : null,
    rssi: typeof rssi === "number" ? rssi : null,
    receivedAt: typeof receivedAt === "string" ? receivedAt : new Date().toISOString(),
  };
}

function upsertMarker(markers: MapLocation[], advert: AdvertPush): MapLocation[] {
  return markers.some((marker) => marker.publicKey === advert.publicKey)
    ? markers.map((marker) => (marker.publicKey === advert.publicKey ? advert : marker))
    : [...markers, advert];
}

/**
 * Display names are neither unique nor verified, so only an unambiguous match
 * is trusted enough to anchor the chain — everything else draws hops only.
 */
function findAnchor(markers: MapLocation[], user: string | undefined): Anchor | null {
  if (!user) return null;
  const matches = markers.filter((marker) => marker.name === user);
  const only = matches.length === 1 ? matches[0] : undefined;
  return only ? { lat: only.lat, lon: only.lon } : null;
}

function hopSummary(hops: Hop[]): string {
  const unknown = hops.filter((hop) => hop.candidates.length === 0).length;
  const base = hops.length === 0 ? "direct" : `${hops.length} hop${hops.length === 1 ? "" : "s"}`;
  return unknown > 0 ? `${base} (${unknown} unknown)` : base;
}

export function LocationMap({ locations }: { locations: MapLocation[] }) {
  const [markers, setMarkers] = useState<MapLocation[]>(locations);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [paths, setPaths] = useState<MapPath[]>([]);
  const [packets, setPackets] = useState<PacketRow[]>([]);

  // the path handler needs the current markers to find the sender, but must
  // not tear down the EventSource every time an advert lands
  const markersRef = useRef(locations);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  const nextPathId = useRef(0);
  const nextPacketId = useRef(0);
  // pulse counters live in a ref as well as state, so an expiry timer can tell
  // whether it is retiring its own pulse or a fresher one
  const pulseSeq = useRef(new Map<string, number>());
  // original events per feed row, for replay-on-click
  const packetPayloads = useRef(new Map<number, PacketPayload>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const schedule = useCallback((run: () => void, delayMs: number): void => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, delayMs);
    timers.current.add(timer);
  }, []);

  const applyPulse = useCallback(
    (publicKey: string): void => {
      const seq = (pulseSeq.current.get(publicKey) ?? 0) + 1;
      pulseSeq.current.set(publicKey, seq);

      setPulses((current) => ({ ...current, [publicKey]: seq }));
      // dropping the entry remounts the marker without the animated class, so a
      // later advert for the same node pulses again — but only this pulse's own
      // timer may retire it
      schedule(() => {
        if (pulseSeq.current.get(publicKey) !== seq) return;
        pulseSeq.current.delete(publicKey);
        setPulses((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => key !== publicKey)),
        );
      }, PULSE_MS);
    },
    [schedule],
  );

  const applyPath = useCallback(
    (input: PathInput): void => {
      const resolved = resolveRoute(input.hops, findAnchor(markersRef.current, input.anchorUser));
      if (resolved.segments.length === 0) return;

      nextPathId.current += 1;
      const id = `path-${nextPathId.current}`;
      const path: MapPath = {
        id,
        label: input.label,
        variant: input.variant,
        hops: resolved.hops,
        segments: resolved.segments,
        alternatives: resolved.alternatives,
      };

      setPaths((current) => [...current, path].slice(-MAX_PATHS));
      schedule(() => {
        setPaths((current) => current.filter((entry) => entry.id !== id));
      }, PATH_TTL_MS);
    },
    [schedule],
  );

  const addPacket = useCallback((row: Omit<PacketRow, "id">, payload: PacketPayload): void => {
    nextPacketId.current += 1;
    const packet = { ...row, id: nextPacketId.current };
    packetPayloads.current.set(packet.id, payload);
    setPackets((current) => {
      const next = [packet, ...current].slice(0, MAX_PACKETS);
      // retire payloads for rows that fell off the end of the feed
      for (const dropped of current.slice(MAX_PACKETS - 1)) {
        packetPayloads.current.delete(dropped.id);
      }
      return next;
    });
  }, []);

  // replay a packet as if it had just arrived, on an otherwise-clean map
  const replayPacket = useCallback(
    (id: number): void => {
      const payload = packetPayloads.current.get(id);
      if (!payload) return;

      pulseSeq.current.clear();
      setPulses({});
      setPaths([]);

      if (payload.kind === "advert") {
        applyPulse(payload.advert.publicKey);
      } else {
        applyPath(payload.path);
      }
    },
    [applyPulse, applyPath],
  );

  useEffect(() => {
    const source = new EventSource("/api/push");

    const onAdvert = (advert: AdvertPush): void => {
      addPacket(
        {
          kind: "advert",
          receivedAt: advert.receivedAt,
          title: advert.name ?? `${advert.publicKey.slice(0, 12)}…`,
          detail: `${nodeStyle(advert.nodeType).label} · ${advert.lat.toFixed(5)}, ${advert.lon.toFixed(5)}`,
        },
        { kind: "advert", advert },
      );

      setMarkers((current) => upsertMarker(current, advert));
      applyPulse(advert.publicKey);
    };

    const onGroupMessage = (message: GroupMessageEvent): void => {
      const path: PathInput = {
        label: `${message.user} → ${message.channel}`,
        hops: message.hops,
        variant: "message",
        anchorUser: message.user,
      };

      // record the packet even when there is nothing drawable about it
      addPacket(
        {
          kind: "group-message",
          receivedAt: message.receivedAt,
          title: message.user,
          detail: `${message.channel} · ${hopSummary(message.hops)}`,
        },
        { kind: "path", path },
      );

      applyPath(path);
    };

    const onRoutePacket = (packet: RoutePacketEvent): void => {
      const path: PathInput = {
        label: `${packet.packetType} packet`,
        hops: packet.hops,
        variant: "packet",
      };

      addPacket(
        {
          kind: "route-packet",
          receivedAt: packet.receivedAt,
          title: packet.packetType,
          detail: hopSummary(packet.hops) + (packet.snr !== null ? ` · SNR ${packet.snr} dB` : ""),
        },
        { kind: "path", path },
      );

      applyPath(path);
    };

    source.onmessage = (event: MessageEvent<string>) => {
      let value: unknown;
      try {
        value = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof value !== "object" || value === null) return;

      const record = value as Record<string, unknown>;
      switch (record.type) {
        case "advert": {
          const advert = parseAdvert(record);
          if (advert) onAdvert(advert);
          break;
        }
        case "group-message": {
          const message = parseGroupMessage(record);
          if (message) onGroupMessage(message);
          break;
        }
        case "route-packet": {
          const packet = parseRoutePacket(record);
          if (packet) onRoutePacket(packet);
          break;
        }
        default:
          break;
      }
    };

    return () => {
      source.close();
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    };
  }, [addPacket, applyPulse, applyPath]);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <LeafletMap locations={markers} pulses={pulses} paths={paths} />
      </div>
      <PacketFeed rows={packets} onSelect={replayPacket} />
    </div>
  );
}
