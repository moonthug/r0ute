import type { NodeJSSerialConnection, Packet, SelfInfo } from "@liamcottle/meshcore.js";
import type { Logger } from "pino";

import type { LocationService } from "../service/LocationService.js";
import type { Channel, PacketType } from "../types.js";

export type HandlerContext = {
  connection: NodeJSSerialConnection;
  channelMap: Map<number, Channel>;
  logger: Logger;
  locationService: LocationService;
  nodeName: string | undefined;
  rx: { snr: number; rssi: number; raw: Uint8Array };
};

export interface Handler {
  packetTypes: PacketType[];
  initialise?: (selfInfo: SelfInfo) => Promise<void>;
  onMessage: (packet: Packet, context: HandlerContext) => void | Promise<void>;
}
