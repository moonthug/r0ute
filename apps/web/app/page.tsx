import { isValidCoordinate } from "@r0ute/database";
import { LocationMap } from "../components/LocationMap";
import { db } from "../lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const locations = await db.advertLocation.findMany({
    orderBy: { receivedAt: "desc" },
  });

  // client components need serializable props — Dates become ISO strings.
  // rows written before coordinate validation existed may carry garbage
  const markers = locations
    .filter((location) => isValidCoordinate(location.lat, location.lon))
    .map((location) => ({
      publicKey: location.publicKey,
      name: location.name,
      lat: location.lat,
      lon: location.lon,
      advertTimestamp: location.advertTimestamp.toISOString(),
      receivedAt: location.receivedAt.toISOString(),
    }));

  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          padding: "0.5rem 1rem",
          display: "flex",
          alignItems: "baseline",
          gap: "0.75rem",
        }}
      >
        <h1 style={{ fontSize: "1.1rem", margin: 0 }}>r0ute</h1>
        <span style={{ color: "#555", fontSize: "0.9rem" }}>
          {markers.length} node{markers.length === 1 ? "" : "s"} with a known location
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <LocationMap locations={markers} />
      </div>
    </main>
  );
}
