import { inject, injectable } from "tsyringe";

import {
  type Database,
  generatePathSlug,
  type Location,
  type PathHop,
  type PathRequest,
} from "@r0ute/database";

import { DATABASE } from "@/tokens.ts";

const PATH_TTL_MS = 28 * 24 * 60 * 60 * 1000;
const SLUG_ATTEMPTS = 3;

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

    // expired requests are purged lazily whenever a new one arrives; hops
    // follow via the cascade on PathHop
    await this.db.pathRequest.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    // the slug space is small enough that a collision is possible, so retry
    // with a fresh token; the unique constraint is the arbiter
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.db.pathRequest.upsert({
          where: {
            channelId_userName_requestTimestamp: {
              channelId: data.channelId,
              userName: data.userName,
              requestTimestamp,
            },
          },
          create: {
            slug: generatePathSlug(),
            channelId: data.channelId,
            userName: data.userName,
            requestTimestamp,
            expiresAt: new Date(Date.now() + PATH_TTL_MS),
            path: { create: hops },
          },
          update: {},
          include: {
            path: { orderBy: { position: "asc" }, include: { location: true } },
          },
        });
      } catch (error) {
        const isSlugCollision = error instanceof Error && "code" in error && error.code === "P2002";
        if (!isSlugCollision || attempt >= SLUG_ATTEMPTS) {
          throw error;
        }
      }
    }
  }
}
