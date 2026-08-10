import type { Database } from "./index.ts";

// lowercase: `LISTEN foo` folds to lowercase, the pg_notify() string argument does not
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

// deliberately carries no message text — the consuming SSE endpoints are unauthenticated
export type GroupMessagePush = {
  channel: string;
  user: string; // sender display name (spoofable, display-only)
  route: string[]; // hop prefixes, hex, uniform width 2|4|6 chars
  senderTimestamp: number; // epoch seconds as decoded
  receivedAt: string; // ISO, bot clock
};

// pg_notify payloads are capped at 8000 bytes in the default postgres config
export async function publishPush(
  db: Database,
  channel: string,
  payload: AdvertPush | GroupMessagePush,
): Promise<void> {
  await db.$executeRaw`SELECT pg_notify(${channel}::text, ${JSON.stringify(payload)}::text)`;
}
