import { createHash } from "node:crypto";

import {
  Constants,
  type NodeJSSerialConnection,
  Packet,
  type SelfInfo,
} from "@liamcottle/meshcore.js";
import type { Logger } from "pino";
import { inject, injectAll, singleton } from "tsyringe";

import type { Database } from "@r0ute/database";

import type { Env } from "@/env.ts";
import type { Handler } from "@/handler/Handler.ts";
import { HeartbeatService } from "@/service/HeartbeatService.ts";
import { CONNECTION, DATABASE, ENV, HANDLER, LOGGER } from "@/tokens.ts";
import type { Channel, LogRxData, PacketType } from "@/types.ts";

@singleton()
export class R0ute {
  private channelMap = new Map<number, Channel>();
  private selfInfo?: SelfInfo;

  constructor(
    @inject(CONNECTION) private readonly connection: NodeJSSerialConnection,
    @inject(DATABASE) private readonly db: Database,
    @inject(ENV) private readonly env: Env,
    @injectAll(HANDLER) private readonly handlers: Handler[],
    @inject(HeartbeatService) private readonly heartbeat: HeartbeatService,
    @inject(LOGGER) private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    await this.db.$connect();

    this.connection.on("connected", this.onConnected.bind(this));
    // biome-ignore lint/style/noNonNullAssertion: PushCodes are always defined
    this.connection.on(Constants.PushCodes.LogRxData!, this.onLogRxData.bind(this));
    this.connection.on("disconnected", () => {
      this.logger.warn("Disconnected");
    });
    this.connection.on("error", (e) => {
      this.logger.error(e, "Error connecting to radio");
    });

    this.logger.info({ device: this.env.DEVICE }, "Connecting to radio");

    await this.connection.connect();
  }

  async stop() {
    await this.db.$disconnect();

    this.heartbeat.stop();
    await this.connection.close();
  }

  private async onConnected() {
    this.logger.info("Connected");

    try {
      this.selfInfo = await this.connection.getSelfInfo();

      const channels = await this.connection.getChannels();
      this.channelMap = new Map<number, Channel>();

      channels.forEach((channel) => {
        const hash = createHash("sha256").update(channel.secret).digest()[0];

        if (hash === undefined) {
          return;
        }

        this.channelMap.set(hash, {
          id: channel.channelIdx,
          name: channel.name,
          secret: channel.secret,
        });
      });

      for (const handler of this.handlers) {
        if (handler.initialise) {
          await handler.initialise(this.selfInfo);
        }
      }

      this.heartbeat.start();

      this.logger.info(
        { name: this.selfInfo.name, channels: this.channelMap.size },
        "Setup complete — monitoring",
      );
    } catch (e) {
      this.logger.error({ error: e }, "Post-connect setup failed — exiting for a clean retry");
      process.exit(1);
    }
  }

  private async onLogRxData(data: LogRxData) {
    try {
      const packet = Packet.fromBytes(data.raw);

      const packetType = packet.payload_type_string;
      if (packetType === null) return;

      for (const handler of this.handlers) {
        if (handler.packetTypes.includes(packetType as PacketType)) {
          await handler.onMessage(packet, {
            connection: this.connection,
            channelMap: this.channelMap,
            logger: this.logger,
            nodeName: this.selfInfo?.name ?? "R0ute Bot",
            rx: { snr: data.lastSnr, rssi: data.lastRssi, raw: data.raw },
          });
        }
      }
    } catch (e) {
      this.logger.warn({ error: e }, "Failed to decode packet");
    }
  }
}
