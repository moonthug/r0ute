import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.ts";

export { isValidCoordinate } from "./coords.ts";
export type { AdvertLocation } from "./generated/client.ts";
export type { AdvertPush, GroupMessagePush, PushChannel } from "./push.ts";
export { PUSH_CHANNELS, publishPush } from "./push.ts";

export function createPrismaClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg(connectionString),
  });
}

export type Database = ReturnType<typeof createPrismaClient>;
