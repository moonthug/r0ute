import {
  type AdvertPush,
  createPrismaClient,
  type Database,
  type GroupMessagePush,
  isValidCoordinate,
  publishPush,
} from "@r0ute/database";
import type { Coord } from "@turf/turf";

import type { AdvertPayload } from "./types.js";

export type Position = {
  publicKey: string;
  name: string | null;
  coord: Coord;
  advertTimestamp: Date;
  receivedAt: Date;
};

export class LocationManager {
  private readonly db: Database;

  constructor(databaseUrl: string) {
    this.db = createPrismaClient(databaseUrl);
  }

  async recordAdvert(advert: AdvertPayload): Promise<AdvertPush | null> {
    const { lat, lon, name } = advert.app_data;

    // lat/lon of 0 means "location not shared"
    if (lat === null || lon === null || (lat === 0 && lon === 0)) {
      return null;
    }

    // radios emit garbage coordinates occasionally — never let them reach the DB
    if (!isValidCoordinate(lat / 1_000_000, lon / 1_000_000)) {
      return null;
    }

    const publicKey = Buffer.from(advert.public_key).toString("hex");
    const advertTimestamp = new Date(advert.timestamp * 1000); // on-air as epoch seconds

    // re-flooded copies carry the same advert timestamp — treat as already seen
    const existing = await this.db.advertLocation.findUnique({ where: { publicKey } });
    if (existing?.advertTimestamp.getTime() === advertTimestamp.getTime()) {
      return null;
    }

    const data = {
      name,
      lat: lat / 1_000_000, // stored on-air as millionths of a degree
      lon: lon / 1_000_000,
      advertTimestamp,
      receivedAt: new Date(),
    };

    await this.db.advertLocation.upsert({
      where: { publicKey },
      create: { publicKey, ...data },
      update: data,
    });

    return {
      publicKey,
      name: data.name,
      lat: data.lat,
      lon: data.lon,
      advertTimestamp: data.advertTimestamp.toISOString(),
      receivedAt: data.receivedAt.toISOString(),
    };
  }

  async publish(channel: string, payload: AdvertPush | GroupMessagePush): Promise<void> {
    await publishPush(this.db, channel, payload);
  }

  async latestPositionFor(name: string): Promise<Position | undefined> {
    const row = await this.db.advertLocation.findFirst({
      where: { name },
      orderBy: { receivedAt: "desc" },
    });

    if (!row) {
      return undefined;
    }

    return {
      publicKey: row.publicKey,
      name: row.name,
      coord: [row.lon, row.lat],
      advertTimestamp: row.advertTimestamp,
      receivedAt: row.receivedAt,
    };
  }

  async close() {
    await this.db.$disconnect();
  }
}
