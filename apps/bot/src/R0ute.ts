import { createHash } from "node:crypto";
import { Constants, NodeJSSerialConnection, Packet } from "@liamcottle/meshcore.js";
import { type Logger, pino } from "pino";
import { Heartbeat } from "./Heartbeat.js";
import type { Handler } from "./handler/Handler.js";
import { LocationManager } from "./LocationManager.js";
import type { Channel, LogRxData } from "./types.js";

type R0uteOptions = {
  device: string;
  monitorPublicKey: string;
  handlers: Handler[];
};

export class R0ute {
  private readonly connection: NodeJSSerialConnection;
  private readonly device: string;
  private readonly handlers: Handler[];
  private readonly locationManager: LocationManager;
  private readonly logger: Logger;
  private readonly heartbeat: Heartbeat;

  private channelMap: Map<number, Channel>;
  private selfName: string | undefined;

  constructor(options: R0uteOptions) {
    this.connection = new NodeJSSerialConnection(options.device);
    this.device = options.device;
    this.handlers = options.handlers;

    this.locationManager = new LocationManager();
    this.channelMap = new Map<number, Channel>();

    this.logger = pino({
      level: process.env.LOG_LEVEL || "info",
    });

    this.heartbeat = new Heartbeat({
      connection: this.connection,
      logger: this.logger,
      monitorPublicKey: options.monitorPublicKey,
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
    this.heartbeat.stop();
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

      this.heartbeat.start();

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
          });
        }
      }
    } catch (e) {
      this.logger.warn({ error: e }, "Failed to decode packet");
    }
  }
}
