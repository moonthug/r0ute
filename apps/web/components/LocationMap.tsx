"use client";

import type { AdvertPush } from "@r0ute/database";
import nextDynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { type Anchor, type Candidate, type Hop, resolveRoute } from "../lib/resolve-route";
import type { MapLocation, MapPath } from "./LeafletMap";

// leaflet touches `window` at import time, so the map must never render on the server
const LeafletMap = nextDynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <p style={{ padding: "1rem" }}>Loading map…</p>,
});

const PULSE_MS = 4_000; // covers the three CSS iterations, then the class is dropped
const PATH_TTL_MS = 20_000;
const MAX_PATHS = 10;

type GroupMessageEvent = {
  channel: string;
  user: string;
  hops: Hop[];
  receivedAt: string;
};

function frameData(event: Event): string | null {
  // EventSource's typed map only covers open/message/error, so named frames
  // arrive as a bare Event
  const data: unknown = (event as MessageEvent<unknown>).data;
  return typeof data === "string" ? data : null;
}

function parseJson(event: Event): Record<string, unknown> | null {
  const data = frameData(event);
  if (data === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function parseAdvert(event: Event): AdvertPush | null {
  const value = parseJson(event);
  if (!value) return null;

  const { publicKey, name, lat, lon, advertTimestamp, receivedAt } = value;
  if (typeof publicKey !== "string" || typeof lat !== "number" || typeof lon !== "number") {
    return null;
  }

  const now = new Date().toISOString();
  return {
    publicKey,
    name: typeof name === "string" ? name : null,
    lat,
    lon,
    advertTimestamp: typeof advertTimestamp === "string" ? advertTimestamp : now,
    receivedAt: typeof receivedAt === "string" ? receivedAt : now,
  };
}

function parseCandidate(value: unknown): Candidate | null {
  if (typeof value !== "object" || value === null) return null;
  const { publicKey, name, lat, lon } = value as Record<string, unknown>;
  if (typeof publicKey !== "string" || typeof lat !== "number" || typeof lon !== "number") {
    return null;
  }
  return { publicKey, name: typeof name === "string" ? name : null, lat, lon };
}

function parseGroupMessage(event: Event): GroupMessageEvent | null {
  const value = parseJson(event);
  if (!value) return null;

  const { channel, user, hops, receivedAt } = value;
  if (typeof channel !== "string" || typeof user !== "string" || !Array.isArray(hops)) return null;

  const parsedHops: Hop[] = [];
  for (const hop of hops) {
    if (typeof hop !== "object" || hop === null) return null;
    const { prefix, candidates } = hop as Record<string, unknown>;
    if (typeof prefix !== "string") return null;
    const parsedCandidates = (Array.isArray(candidates) ? candidates : [])
      .map(parseCandidate)
      .filter((candidate): candidate is Candidate => candidate !== null);
    parsedHops.push({ prefix, candidates: parsedCandidates });
  }

  return {
    channel,
    user,
    hops: parsedHops,
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
function findAnchor(markers: MapLocation[], user: string): Anchor | null {
  const matches = markers.filter((marker) => marker.name === user);
  const only = matches.length === 1 ? matches[0] : undefined;
  return only ? { lat: only.lat, lon: only.lon } : null;
}

export function LocationMap({ locations }: { locations: MapLocation[] }) {
  const [markers, setMarkers] = useState<MapLocation[]>(locations);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [paths, setPaths] = useState<MapPath[]>([]);

  // the group-message handler needs the current markers to find the sender, but
  // must not tear down the EventSources every time an advert lands
  const markersRef = useRef(locations);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  const nextPathId = useRef(0);
  // pulse counters live in a ref as well as state, so an expiry timer can tell
  // whether it is retiring its own pulse or a fresher one
  const pulseSeq = useRef(new Map<string, number>());

  useEffect(() => {
    const adverts = new EventSource("/api/push/adverts");
    const groupMessages = new EventSource("/api/push/group-messages");
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const schedule = (run: () => void, delayMs: number): void => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        run();
      }, delayMs);
      timers.add(timer);
    };

    const onAdvert = (event: Event): void => {
      const advert = parseAdvert(event);
      if (!advert) return;

      const seq = (pulseSeq.current.get(advert.publicKey) ?? 0) + 1;
      pulseSeq.current.set(advert.publicKey, seq);

      setMarkers((current) => upsertMarker(current, advert));
      setPulses((current) => ({ ...current, [advert.publicKey]: seq }));
      // dropping the entry remounts the marker without the animated class, so a
      // later advert for the same node pulses again — but only this pulse's own
      // timer may retire it
      schedule(() => {
        if (pulseSeq.current.get(advert.publicKey) !== seq) return;
        pulseSeq.current.delete(advert.publicKey);
        setPulses((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => key !== advert.publicKey)),
        );
      }, PULSE_MS);
    };

    const onGroupMessage = (event: Event): void => {
      const message = parseGroupMessage(event);
      if (!message) return;

      const resolved = resolveRoute(message.hops, findAnchor(markersRef.current, message.user));
      if (resolved.segments.length === 0) return;

      nextPathId.current += 1;
      const id = `path-${nextPathId.current}`;
      const path: MapPath = {
        id,
        user: message.user,
        channel: message.channel,
        hops: resolved.hops,
        segments: resolved.segments,
        alternatives: resolved.alternatives,
      };

      setPaths((current) => [...current, path].slice(-MAX_PATHS));
      schedule(() => {
        setPaths((current) => current.filter((entry) => entry.id !== id));
      }, PATH_TTL_MS);
    };

    adverts.addEventListener("advert", onAdvert);
    groupMessages.addEventListener("group-message", onGroupMessage);

    return () => {
      adverts.close();
      groupMessages.close();
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return <LeafletMap locations={markers} pulses={pulses} paths={paths} />;
}
