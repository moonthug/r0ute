import type { NodeJSSerialConnection, Packet } from "@liamcottle/meshcore.js";
import type { Logger } from "pino";

import type { LocationManager } from "../LocationManager.js";
import type { Channel, PacketType } from "../types.js";

export type HandlerContext = {
  connection: NodeJSSerialConnection;
  channelMap: Map<number, Channel>;
  logger: Logger;
  locationManager: LocationManager;
  nodeName: string | undefined;
  /** radio-reported reception quality for this packet */
  rx: { snr: number; rssi: number };
};

export type Handler = {
  packetTypes: PacketType[];
  onMessage: (packet: Packet, context: HandlerContext) => void | Promise<void>;
};
