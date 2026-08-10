import { EventEmitter } from "node:events";
import {
  type AdvertPush,
  type GroupMessagePush,
  PUSH_CHANNELS,
  type PushChannel,
} from "@r0ute/database";
import { Client, escapeIdentifier, type Notification } from "pg";

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

type PushPayloads = {
  [PUSH_CHANNELS.adverts]: AdvertPush;
  [PUSH_CHANNELS.groupMessages]: GroupMessagePush;
};

type ListenerState = {
  emitter: EventEmitter;
  client: Client | null;
  started: boolean;
  backoffMs: number;
  retry: ReturnType<typeof setTimeout> | null;
};

// one dedicated LISTEN connection per process, reused across dev hot reloads
const globalForPush = globalThis as unknown as { pushListener?: ListenerState };

const state: ListenerState = globalForPush.pushListener ?? {
  emitter: new EventEmitter(),
  client: null,
  started: false,
  backoffMs: INITIAL_BACKOFF_MS,
  retry: null,
};

// one listener per connected SSE client, so the default limit of 10 is far too low
state.emitter.setMaxListeners(0);

globalForPush.pushListener = state;

function handleNotification(message: Notification): void {
  if (!message.payload) return;

  let payload: unknown;
  try {
    payload = JSON.parse(message.payload);
  } catch {
    console.warn(`[push-listener] dropped unparseable payload on ${message.channel}`);
    return;
  }

  state.emitter.emit(message.channel, payload);
}

function scheduleReconnect(): void {
  if (state.retry) return;

  const delay = state.backoffMs;
  state.backoffMs = Math.min(state.backoffMs * 2, MAX_BACKOFF_MS);
  console.warn(`[push-listener] reconnecting in ${delay}ms`);

  state.retry = setTimeout(() => {
    state.retry = null;
    void connect();
  }, delay);
}

function discard(client: Client): void {
  if (state.client !== client) return;
  state.client = null;
  client.removeAllListeners();
  client.end().catch(() => {});
  scheduleReconnect();
}

async function connect(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // retrying cannot fix a missing env var, so this is not scheduled for reconnect
    console.error("[push-listener] DATABASE_URL environment variable is not set");
    return;
  }

  const client = new Client({ connectionString });
  state.client = client;

  client.on("notification", handleNotification);
  client.on("error", (error) => {
    console.error("[push-listener] connection error", error);
    discard(client);
  });
  client.on("end", () => {
    console.warn("[push-listener] connection ended");
    discard(client);
  });

  try {
    await client.connect();
    // LISTEN takes no bind parameters, and its registrations die with the session,
    // so every reconnect must re-issue both of them
    for (const channel of Object.values(PUSH_CHANNELS)) {
      await client.query(`LISTEN ${escapeIdentifier(channel)}`);
    }
    state.backoffMs = INITIAL_BACKOFF_MS;
    console.log(`[push-listener] listening on ${Object.values(PUSH_CHANNELS).join(", ")}`);
  } catch (error) {
    console.error("[push-listener] failed to connect", error);
    discard(client);
  }
}

/**
 * Subscribe to a push channel. The postgres connection is opened on the first
 * call — importing this module alone must never open a socket, because
 * `next build` imports it.
 */
export function subscribe<C extends PushChannel>(
  channel: C,
  handler: (payload: PushPayloads[C]) => void,
): () => void {
  if (!state.started) {
    state.started = true;
    void connect();
  }

  state.emitter.on(channel, handler);
  return () => {
    state.emitter.off(channel, handler);
  };
}
