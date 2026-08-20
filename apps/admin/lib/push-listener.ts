import { EventEmitter } from "node:events";

import { Client, escapeIdentifier, type Notification } from "pg";

import { PUSH_CHANNEL, type PushEvent } from "@r0ute/database";

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const EVENT = "push";

const PUSH_TYPES = new Set<PushEvent["type"]>(["advert", "group-message", "route-packet"]);

type ListenerState = {
  emitter: EventEmitter;
  client: Client | null;
  started: boolean;
  backoffMs: number;
  retry: ReturnType<typeof setTimeout> | null;
};

// one dedicated LISTEN connection per process, reused across dev hot reloads.
// the key is versioned so structural changes (like the single-channel move)
// invalidate a stale cached listener instead of inheriting it
const globalForPush = globalThis as unknown as { pushListenerV2?: ListenerState };

const state: ListenerState = globalForPush.pushListenerV2 ?? {
  emitter: new EventEmitter(),
  client: null,
  started: false,
  backoffMs: INITIAL_BACKOFF_MS,
  retry: null,
};

// one listener per connected SSE client, so the default limit of 10 is far too low
state.emitter.setMaxListeners(0);

globalForPush.pushListenerV2 = state;

function handleNotification(message: Notification): void {
  if (!message.payload) return;

  let payload: unknown;
  try {
    payload = JSON.parse(message.payload);
  } catch {
    console.warn("[push-listener] dropped unparseable payload");
    return;
  }

  const type = (payload as { type?: unknown }).type;
  if (typeof type !== "string" || !PUSH_TYPES.has(type as PushEvent["type"])) {
    console.warn(`[push-listener] dropped event with unknown type ${String(type)}`);
    return;
  }

  state.emitter.emit(EVENT, payload as PushEvent);
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
    // LISTEN takes no bind parameters, and its registration dies with the
    // session, so every reconnect must re-issue it
    await client.query(`LISTEN ${escapeIdentifier(PUSH_CHANNEL)}`);
    state.backoffMs = INITIAL_BACKOFF_MS;
    console.log(`[push-listener] listening on ${PUSH_CHANNEL}`);
  } catch (error) {
    console.error("[push-listener] failed to connect", error);
    discard(client);
  }
}

/**
 * Subscribe to all push events. The postgres connection is opened on the first
 * call — importing this module alone must never open a socket, because
 * `next build` imports it.
 */
export function subscribe(handler: (event: PushEvent) => void): () => void {
  if (!state.started) {
    state.started = true;
    void connect();
  }

  state.emitter.on(EVENT, handler);
  return () => {
    state.emitter.off(EVENT, handler);
  };
}
