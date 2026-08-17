import { createHash } from "node:crypto";
import type { Packet } from "@liamcottle/meshcore.js";
import mqtt, { type MqttClient } from "mqtt";
import type { Logger } from "pino";

const DEFAULT_STATUS_INTERVAL_MS = 5 * 60 * 1000;
const CLIENT_ID_PREFIX = "meshcore_";
const PACKET_HASH_BYTES = 8;

export type MeshRankOptions = {
  logger: Logger;
  url: string;
  registrationKey: string;
  clientVersion: string;
  statusIntervalMs?: number | undefined;
};

export type MeshRankIdentity = {
  publicKey: string;
  name: string;
  radio?: string;
  model?: string;
  firmwareVersion?: string;
};

export type MeshRankRx = { snr: number; rssi: number };

export function packetHash(packet: Packet): string {
  return createHash("sha256")
    .update(Buffer.from([packet.payload_type]))
    .update(packet.payload)
    .digest()
    .subarray(0, PACKET_HASH_BYTES)
    .toString("hex")
    .toUpperCase();
}

function routeLetter(packet: Packet): "F" | "D" {
  const type = packet.route_type;
  return type === 0x00 || type === 0x01 ? "F" : "D";
}

export function sanitizeClientId(name: string, prefix = CLIENT_ID_PREFIX): string {
  return (prefix + name.replace(/ /g, "_")).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 23);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export class MeshRankService {
  private readonly logger: Logger;
  private readonly options: {
    url: string;
    registrationKey: string;
    clientVersion: string;
    statusIntervalMs: number;
  };
  private readonly packetsTemplate: string;
  private readonly statusTemplate: string;

  private client: MqttClient | null = null;
  private identity: MeshRankIdentity | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private stats = { packetsRx: 0, publishFailures: 0 };

  constructor(options: MeshRankOptions) {
    this.logger = options.logger.child({ component: "MeshRank" });

    this.options = {
      url: options.url,
      registrationKey: options.registrationKey,
      clientVersion: options.clientVersion,
      statusIntervalMs: options.statusIntervalMs ?? DEFAULT_STATUS_INTERVAL_MS,
    };

    this.packetsTemplate = "meshrank/uplink/{REGISTRATION_KEY}/{PUBLIC_KEY}/packets";
    this.statusTemplate = "meshrank/uplink/{REGISTRATION_KEY}/{PUBLIC_KEY}/status";
  }

  async connect(identity: MeshRankIdentity): Promise<void> {
    await this.close();

    this.identity = { ...identity, publicKey: identity.publicKey.toUpperCase() };
    const statusTopic = this.topic(this.statusTemplate);

    const client = mqtt.connect(this.options.url, {
      clientId: sanitizeClientId(identity.name),
      clean: true,
      keepalive: 60,
      reconnectPeriod: 5_000,
      will: {
        topic: statusTopic,
        payload: Buffer.from(JSON.stringify(this.statusMessage("offline", false))),
        qos: 0,
        retain: false,
      },
    });

    this.client = client;

    client.on("connect", () => {
      this.logger.info({ url: this.options.url, statusTopic }, "Connected to broker");
      this.publishStatus("online");
    });
    client.on("reconnect", () => this.logger.debug("Reconnecting to broker"));
    client.on("offline", () => this.logger.warn("Broker connection offline"));
    client.on("error", (error) => this.logger.warn({ error }, "Broker error"));

    this.statusTimer = setInterval(
      () => this.publishStatus("online"),
      this.options.statusIntervalMs,
    );
  }

  async close(): Promise<void> {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }

    const client = this.client;
    this.client = null;
    if (!client) {
      return;
    }

    if (client.connected) {
      try {
        await client.publishAsync(
          this.topic(this.statusTemplate),
          JSON.stringify(this.statusMessage("offline")),
          { qos: 0, retain: false },
        );
      } catch (error) {
        this.logger.warn({ error }, "Failed to publish offline status");
      }
    }
    await client.endAsync();
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  publishPacket(raw: Uint8Array, packet: Packet, rx: MeshRankRx): void {
    if (!this.identity) {
      return;
    }
    this.stats.packetsRx += 1;

    const now = new Date();
    const message: Record<string, unknown> = {
      origin: this.identity.name,
      origin_id: this.identity.publicKey,
      timestamp: now.toISOString(),
      type: "PACKET",
      direction: "rx",
      time: `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`,
      date: `${now.getUTCDate()}/${now.getUTCMonth() + 1}/${now.getUTCFullYear()}`,
      len: String(raw.length),
      packet_type: String(packet.payload_type),
      route: routeLetter(packet),
      payload_len: String(packet.payload.length),
      raw: Buffer.from(raw).toString("hex").toUpperCase(),
      SNR: String(rx.snr),
      RSSI: String(rx.rssi),
      score: null,
      duration: null,
      hash: packetHash(packet),
    };

    if (message.route === "D" && packet.path.length > 0) {
      message.path = Buffer.from(packet.path).toString("hex").toUpperCase();
    }

    this.publish(this.topic(this.packetsTemplate), JSON.stringify(message));
  }

  publishStatus(status: "online" | "offline"): void {
    this.publish(this.topic(this.statusTemplate), JSON.stringify(this.statusMessage(status)));
  }

  private statusMessage(status: "online" | "offline", includeStats = true) {
    const identity = this.identity;
    const message: Record<string, unknown> = {
      status,
      timestamp: new Date().toISOString(),
      origin: identity?.name ?? "unknown",
      origin_id: identity?.publicKey ?? "UNKNOWN",
      radio: identity?.radio ?? "unknown",
      model: identity?.model ?? "unknown",
      firmware_version: identity?.firmwareVersion ?? "unknown",
      client_version: this.options.clientVersion,
    };
    if (includeStats) {
      message.stats = {
        packets_rx: this.stats.packetsRx,
        publish_failures: this.stats.publishFailures,
      };
    }
    return message;
  }

  private topic(template: string): string {
    return template
      .replace("{REGISTRATION_KEY}", this.options.registrationKey)
      .replace("{PUBLIC_KEY}", this.identity?.publicKey ?? "UNKNOWN");
  }

  private publish(topic: string, payload: string): void {
    const client = this.client;
    if (!client?.connected) {
      this.stats.publishFailures += 1;
      this.logger.debug({ topic }, "Not connected — dropping publish");
      return;
    }

    client.publish(topic, payload, { qos: 0, retain: false }, (error) => {
      if (error) {
        this.stats.publishFailures += 1;
        this.logger.warn({ error, topic }, "Publish failed");
      }
    });
  }
}
