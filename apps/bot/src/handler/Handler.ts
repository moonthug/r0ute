import type { NodeJSSerialConnection, Packet, SelfInfo } from "@liamcottle/meshcore.js";
import type { Logger } from "pino";

import type { Channel, PacketType } from "@/types.ts";

export type HandlerContext = {
  connection: NodeJSSerialConnection;
  channelMap: Map<number, Channel>;
  logger: Logger;
  nodeName: string | undefined;
  rx: { snr: number; rssi: number; raw: Uint8Array };
};

export interface Handler {
  packetTypes: PacketType[];
  initialise?: (selfInfo: SelfInfo) => Promise<void>;
  onMessage: (packet: Packet, context: HandlerContext) => void | Promise<void>;
}
