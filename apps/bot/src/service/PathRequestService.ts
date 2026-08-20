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

    const [locations, senderMatches] = await Promise.all([
      hashes.length
        ? this.db.location.findMany({
            where: { OR: hashes.map((hash) => ({ publicKey: { startsWith: hash } })) },
          })
        : Promise.resolve([]),
      this.db.location.findMany({ where: { name: data.userName } }),
    ]);

    // display names are neither unique nor verified, so only an unambiguous
    // match is trusted enough to record the sender as the path's origin
    const sender = senderMatches.length === 1 ? senderMatches[0] : undefined;

    const hops = [
      ...(sender
        ? [{ hash: sender.publicKey, locationPublicKey: sender.publicKey, isSender: true }]
        : []),
      ...hashes.map((hash) => ({
        hash,
        locationPublicKey:
          locations.find((location) => location.publicKey.startsWith(hash))?.publicKey ?? null,
        isSender: false,
      })),
    ].map((hop, position) => ({ ...hop, position }));

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
