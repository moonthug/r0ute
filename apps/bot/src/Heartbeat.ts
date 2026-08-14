import type { NodeJSSerialConnection } from "@liamcottle/meshcore.js";
import type { Logger } from "pino";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

type HeartbeatOptions = {
  connection: NodeJSSerialConnection;
  logger: Logger;
  /** hex-encoded public key of the node that receives the uptime message */
  monitorPublicKey: string;
  intervalMs?: number;
};

function formatUptime(sinceMs: number): string {
  const totalMinutes = Math.floor(sinceMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

/** Periodically DMs a monitor node with the bot's uptime, as a liveness signal. */
export class Heartbeat {
  private readonly connection: NodeJSSerialConnection;
  private readonly logger: Logger;
  private readonly monitorPublicKey: Buffer;
  private readonly intervalMs: number;

  private startedAt: Date | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: HeartbeatOptions) {
    this.connection = options.connection;
    this.logger = options.logger.child({ component: "Heartbeat" });
    this.monitorPublicKey = Buffer.from(options.monitorPublicKey, "hex");
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /** (Re)starts the uptime clock and the send interval. */
  start(): void {
    this.stop();
    this.startedAt = new Date();
    this.timer = setInterval(() => {
      void this.beat();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async beat(): Promise<void> {
    const startedAt = this.startedAt;
    if (!startedAt) {
      return;
    }

    const uptime = formatUptime(Date.now() - startedAt.getTime());
    try {
      const contact = await this.connection.findContactByPublicKeyPrefix(this.monitorPublicKey);

      if (contact) {
        await this.connection.sendTextMessage(this.monitorPublicKey, `Up time: ${uptime}`);
        this.logger.debug({ uptime }, "Heartbeat sent");
      } else {
        this.logger.warn("Contact not found");
      }
    } catch (error) {
      this.logger.warn({ error }, "Heartbeat send failed");
    }
  }
}
