import { DatabaseSync, StatementSync } from "node:sqlite";
import type { Coord } from "@turf/turf";

import type { AdvertPayload } from "./types.js";

export type Position = {
  publicKey: string,
  name: string | null,
  coord: Coord,
  advertTimestamp: number,
  receivedAt: number
}

export class LocationManager {
  private readonly db: DatabaseSync;
  private readonly insertLocation: StatementSync;
  private readonly selectLatestByName: StatementSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS advert_locations (
        public_key TEXT PRIMARY KEY,
        name TEXT,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        advert_timestamp INTEGER NOT NULL,
        received_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_advert_locations_name
        ON advert_locations (name);
    `);

    this.insertLocation = this.db.prepare(`
      INSERT INTO advert_locations
        (public_key, name, lat, lon, advert_timestamp, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (public_key) DO UPDATE SET
        name = excluded.name,
        lat = excluded.lat,
        lon = excluded.lon,
        advert_timestamp = excluded.advert_timestamp,
        received_at = excluded.received_at
      WHERE excluded.advert_timestamp != advert_locations.advert_timestamp
    `);

    this.selectLatestByName = this.db.prepare(`
      SELECT public_key, name, lat, lon, advert_timestamp, received_at
      FROM advert_locations
      WHERE name = ?
      ORDER BY received_at DESC
      LIMIT 1
    `);
  }

  recordAdvert(advert: AdvertPayload): boolean {
    const { lat, lon, name } = advert.app_data;

    if (lat === null || lon === null || (lat === 0 && lon === 0)) {
      return false;
    }

    const result = this.insertLocation.run(
      Buffer.from(advert.public_key).toString("hex"),
      name,
      lat / 1_000_000, // stored on-air as millionths of a degree
      lon / 1_000_000,
      advert.timestamp,
      Math.floor(Date.now() / 1000)
    );

    // 0 changes means we already heard this advert (re-flooded via another repeater)
    return result.changes > 0;
  }

  latestPositionFor(name: string): Position | undefined {
    const row = this.selectLatestByName.get(name) as {
      public_key: string,
      name: string | null,
      lat: number,
      lon: number,
      advert_timestamp: number,
      received_at: number
    } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      publicKey: row.public_key,
      name: row.name,
      coord: [row.lon, row.lat],
      advertTimestamp: row.advert_timestamp,
      receivedAt: row.received_at
    };
  }

  close() {
    this.db.close();
  }
}
