import { inject, injectable } from "tsyringe";

import type { Database, Location, PathHop, PathRequest } from "@r0ute/database";

import { DATABASE } from "@/tokens.ts";

export type CreatePathData = {
  channelId: number;
  userName: string;
  requestTimestamp: number;
  path: string[];
};

export type PathRequestWithPath = PathRequest & {
  path: (PathHop & { location: Location | null })[];
};

@injectable()
export class PathRequestService {
  constructor(@inject(DATABASE) private readonly db: Database) {}

  public async createPath(data: CreatePathData): Promise<PathRequestWithPath> {
    const requestTimestamp = new Date(data.requestTimestamp * 1000);
    const hashes = data.path;

    const locations = hashes.length
      ? await this.db.location.findMany({
          where: { OR: hashes.map((hash) => ({ publicKey: { startsWith: hash } })) },
        })
      : [];

    const hops = hashes.map((hash, position) => ({
      position,
      hash,
      locationPublicKey:
        locations.find((location) => location.publicKey.startsWith(hash))?.publicKey ?? null,
    }));

    return await this.db.pathRequest.upsert({
      where: {
        channelId_userName_requestTimestamp: {
          channelId: data.channelId,
          userName: data.userName,
          requestTimestamp,
        },
      },
      create: {
        channelId: data.channelId,
        userName: data.userName,
        requestTimestamp,
        path: { create: hops },
      },
      update: {},
      include: {
        path: { orderBy: { position: "asc" }, include: { location: true } },
      },
    });
  }
}
