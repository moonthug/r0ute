import { inject, singleton } from "tsyringe";

import { type Database, isValidCoordinate, type Location, NodeType } from "@r0ute/database";

import { DATABASE } from "@/tokens.ts";
import type { AdvertPayload } from "@/types.ts";

/** meshcore.js reports the advert's ADV_TYPE flag as a string; "NONE" means unset */
function parseNodeType(type: string | null): NodeType | null {
  return type !== null && type in NodeType ? NodeType[type as keyof typeof NodeType] : null;
}

@singleton()
export class LocationService {
  constructor(@inject(DATABASE) private readonly db: Database) {}

  async getLocationByPublicKey(publicKey: string) {
    return await this.db.location.findUnique({ where: { publicKey } });
  }

  /** most recently received location for a node name */
  async getLocationByName(name: string) {
    return await this.db.location.findFirst({
      where: { name },
      orderBy: { receivedAt: "desc" },
    });
  }

  async upsertLocationForAdvert(advert: AdvertPayload): Promise<Location | null> {
    const { lat, lon, name, type } = advert.app_data;

    if (lat === null || lon === null || (lat === 0 && lon === 0)) {
      return null;
    }

    if (!isValidCoordinate(lat / 1_000_000, lon / 1_000_000)) {
      return null;
    }

    const publicKey = Buffer.from(advert.public_key).toString("hex");
    const advertTimestamp = new Date(advert.timestamp * 1000); // on-air as epoch seconds

    const existing = await this.getLocationByPublicKey(publicKey);
    if (existing?.advertTimestamp.getTime() === advertTimestamp.getTime()) {
      return null;
    }

    const data = {
      name,
      nodeType: parseNodeType(type),
      lat: lat / 1_000_000, // stored on-air as millionths of a degree
      lon: lon / 1_000_000,
      advertTimestamp,
      receivedAt: new Date(),
    };

    return await this.db.location.upsert({
      where: { publicKey },
      create: { publicKey, ...data },
      update: data,
    });
  }
}
