import { type Database, getDatabase } from "./client.ts";

export const PUSH_CHANNELS = {
  adverts: "push_adverts",
  groupMessages: "push_group_messages",
} as const;

export type PushChannel = (typeof PUSH_CHANNELS)[keyof typeof PUSH_CHANNELS];

export type AdvertPush = {
  publicKey: string;
  name: string | null;
  lat: number;
  lon: number;
  advertTimestamp: string; // ISO
  receivedAt: string; // ISO
};

export type GroupMessagePush = {
  channel: string;
  user: string;
  route: string[];
  senderTimestamp: number;
  receivedAt: string;
};

export async function publishPush(
  db: Database,
  channel: string,
  payload: AdvertPush | GroupMessagePush,
): Promise<void> {
  await db.$executeRaw`SELECT pg_notify(${channel}::text, ${JSON.stringify(payload)}::text)`;
}

export async function push(
  channel: PushChannel,
  payload: AdvertPush | GroupMessagePush,
): Promise<void> {
  await publishPush(getDatabase(), channel, payload);
}
