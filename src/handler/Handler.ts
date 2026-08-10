import { NodeJSSerialConnection, type Packet } from "@liamcottle/meshcore.js";
import type { Logger } from "pino";

import type { Channel, PacketType } from "../types.js";
import type { LocationManager } from "../LocationManager.js";

export type HandlerContext = {
  connection: NodeJSSerialConnection,
  channelMap: Map<number, Channel>,
  logger: Logger,
  locationManager: LocationManager,
  nodeName: string | undefined
}

export type Handler = {
  packetType: PacketType,
  onMessage: (packet: Packet, context: HandlerContext) => void
}
