import type { NodeJSSerialConnection } from "@liamcottle/meshcore.js";
import type { Logger } from "pino";
import { inject, singleton } from "tsyringe";

import type { Env } from "@/env.ts";
import { CONNECTION, ENV, LOGGER } from "@/tokens.ts";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

function formatUptime(sinceMs: number): string {
  const totalMinutes = Math.floor(sinceMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

@singleton()
export class HeartbeatService {
  private readonly logger: Logger;
  private readonly monitorPublicKey: Buffer;
  private readonly intervalMs = DEFAULT_INTERVAL_MS;

  private startedAt: Date | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @inject(CONNECTION) private readonly connection: NodeJSSerialConnection,
    @inject(ENV) env: Env,
    @inject(LOGGER) logger: Logger,
  ) {
    this.logger = logger.child({ component: "Heartbeat" });
    this.monitorPublicKey = Buffer.from(env.MONITOR_PUBLIC_KEY, "hex");
  }

  start(): void {
    this.stop();
    this.startedAt = new Date();

    void this.sendMessageToMonitor("Bot started");

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

  private async sendMessageToMonitor(message: string): Promise<void> {
    try {
      const contact = await this.connection.findContactByPublicKeyPrefix(this.monitorPublicKey);

      if (contact) {
        await this.connection.sendTextMessage(this.monitorPublicKey, message);
        this.logger.debug({ message }, "Message sent");
      } else {
        this.logger.warn("Contact not found");
      }
    } catch (error) {
      this.logger.warn({ error }, "Message send failed");
    }
  }

  private async beat(): Promise<void> {
    const startedAt = this.startedAt;
    if (!startedAt) {
      return;
    }

    const uptime = formatUptime(Date.now() - startedAt.getTime());
    await this.sendMessageToMonitor(`Up time: ${uptime}`);
  }
}
