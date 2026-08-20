import { type Database, getDatabase } from "./client.ts";
import type { NodeType } from "./generated/enums.ts";

/** every push event travels over one NOTIFY channel, discriminated by `type` */
export const PUSH_CHANNEL = "push_events";

export type AdvertPush = {
  type: "advert";
  publicKey: string;
  name: string | null;
  nodeType: NodeType | null;
  lat: number;
  lon: number;
  advertTimestamp: string; // ISO
  receivedAt: string; // ISO
};

export type GroupMessagePush = {
  type: "group-message";
  channel: string;
  user: string;
  route: string[];
  senderTimestamp: number;
  receivedAt: string;
};

/** any other flood-routed packet: no decoded content, but a drawable path */
export type RoutePacketPush = {
  type: "route-packet";
  packetType: string;
  route: string[];
  snr: number | null;
  rssi: number | null;
  receivedAt: string;
};

export type PushEvent = AdvertPush | GroupMessagePush | RoutePacketPush;

export async function publishPush(db: Database, event: PushEvent): Promise<void> {
  await db.$executeRaw`SELECT pg_notify(${PUSH_CHANNEL}::text, ${JSON.stringify(event)}::text)`;
}

/** Publish a push event on the process-wide database (from DATABASE_URL). */
export async function push(event: PushEvent): Promise<void> {
  await publishPush(getDatabase(), event);
}
