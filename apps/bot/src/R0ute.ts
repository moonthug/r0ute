import { createHash } from "node:crypto";
import { Constants, NodeJSSerialConnection, Packet } from "@liamcottle/meshcore.js";
import type { AdvertPush, GroupMessagePush } from "@r0ute/database";
import { type Logger, pino } from "pino";
import type { Handler } from "./handler/Handler.js";
import { LocationManager } from "./LocationManager.js";
import type { Channel, LogRxData } from "./types.js";

type R0uteOptions = {
  device: string;
  databaseUrl: string;
  handlers: Handler[];
};

export class R0ute {
  private readonly connection: NodeJSSerialConnection;
  private readonly device: string;
  private readonly handlers: Handler[];
  private readonly locationManager: LocationManager;

  private channelMap: Map<number, Channel>;
  private selfName: string | undefined;
  private logger: Logger;

  constructor(options: R0uteOptions) {
    this.connection = new NodeJSSerialConnection(options.device);
    this.device = options.device;
    this.handlers = options.handlers;

    this.locationManager = new LocationManager(options.databaseUrl);
    this.channelMap = new Map<number, Channel>();

    this.logger = pino({
      level: process.env.LOG_LEVEL || "info",
    });
  }

  async start(): Promise<void> {
    this.connection.on("connected", this.onConnected.bind(this));
    // biome-ignore lint/style/noNonNullAssertion: PushCodes are always defined
    this.connection.on(Constants.PushCodes.LogRxData!, this.onLogRxData.bind(this));
    this.connection.on("disconnected", () => {
      this.logger.warn("Disconnected");
    });
    this.connection.on("error", (e) => {
      this.logger.error(e, "Error connecting to radio");
    });

    this.logger.info({ device: this.device }, "Connecting to radio");

    await this.connection.connect();
  }

  async stop() {
    await this.connection.close();
    await this.locationManager.close();
  }

  private async onConnected() {
    this.logger.info("Connected");

    try {
      const selfInfo = await this.connection.getSelfInfo();
      this.selfName = selfInfo.name;

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

      this.logger.info(
        { name: this.selfName, channels: this.channelMap.size },
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

      for (const handler of this.handlers) {
        if (packet.payload_type_string === handler.packetType) {
          await handler.onMessage(packet, {
            connection: this.connection,
            channelMap: this.channelMap,
            locationManager: this.locationManager,
            logger: this.logger,
            nodeName: this.selfName,
            push: this.push.bind(this),
          });
        }
      }
    } catch (e) {
      this.logger.warn({ error: e }, "Failed to decode packet");
    }
  }

  private async push(channel: string, payload: AdvertPush | GroupMessagePush) {
    try {
      await this.locationManager.publish(channel, payload);
    } catch (e) {
      this.logger.warn({ channel, error: e }, "Failed to publish push event");
    }
  }
}
