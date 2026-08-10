import { createHash} from "node:crypto"

import { Constants, NodeJSSerialConnection, Packet } from "@liamcottle/meshcore.js";
import {pino, type Logger} from 'pino'

import type { Channel, LogRxData } from "./types.js";
import type { Handler } from "./handler/Handler.js";
import { LocationManager } from "./LocationManager.js";

type R0uteOptions = {
  device: string,
  dbPath: string,
  handlers: Handler[]
}

export class R0ute {
  private readonly connection: NodeJSSerialConnection;
  private readonly handlers: Handler[];
  private readonly locationManager: LocationManager;

  private channelMap: Map<number, Channel>;
  private selfName: string | undefined;
  private logger: Logger;

  constructor(options: R0uteOptions) {
    this.connection = new NodeJSSerialConnection(options.device);
    this.handlers = options.handlers;

    this.locationManager = new LocationManager(options.dbPath);
    this.channelMap = new Map<number, Channel>();

    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
    })
  }

  async start(): Promise<void> {
    this.connection.on("connected", this.onConnected.bind(this));
    this.connection.on(Constants.PushCodes.LogRxData!, this.onLogRxData.bind(this));
    this.connection.on("disconnected", () => {
      this.logger.warn("Disconnected");
    });

    await this.connection.connect();
  }

  async stop() {
    await this.connection.close();
    this.locationManager.close();
  }

  private async onConnected() {
    this.logger.info("Connected");

    const selfInfo = await this.connection.getSelfInfo();
    this.selfName = selfInfo.name;

    const channels = await this.connection.getChannels();
    this.channelMap = new Map<number, Channel>();

    channels
      .forEach(channel => {
        const hash = createHash("sha256").update(channel.secret).digest()[0];

        if (hash === undefined) {
          return
        }

        this.channelMap.set(hash, {
          id: channel.channelIdx,
          name: channel.name,
          secret: channel.secret
        })
      });
  }
  private async onLogRxData(data: LogRxData) {
    try {
      const packet = Packet.fromBytes(data.raw);

      this.handlers.forEach(handler => {
        if (packet.payload_type_string === handler.packetType) {
          handler.onMessage(
            packet,
            {
              connection: this.connection,
              channelMap: this.channelMap,
              locationManager: this.locationManager,
              logger: this.logger,
              nodeName: this.selfName
            }
          );
        }
      })
    } catch (e) {
      this.logger.warn({ msg: "Failed to decode packet", error: e });
    }
  }
}
