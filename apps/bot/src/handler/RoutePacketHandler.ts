import type { Packet } from "@liamcottle/meshcore.js";
import { push } from "@r0ute/database";

import { PacketType } from "../types.js";
import type { Handler, HandlerContext } from "./Handler.js";

export class RoutePacketHandler implements Handler {
  public packetTypes: PacketType[] = [
    PacketType.GroupData,
    PacketType.TextMessage,
    PacketType.Ack,
    PacketType.Path,
    PacketType.Trace,
    PacketType.Request,
    PacketType.Response,
    PacketType.AnonRequest,
    PacketType.RawCustom,
  ];

  public async onMessage(packet: Packet, { logger, rx }: HandlerContext) {
    const route = packet.getPathHashes().map((hash) => Buffer.from(hash).toString("hex"));

    // a direct packet has no path to draw
    if (route.length === 0) {
      return;
    }

    const packetType = packet.payload_type_string ?? "UNKNOWN";

    logger.debug({
      handler: "ROUTE_PACKET",
      type: "PACKET",
      data: { packetType, hops: route.length, snr: rx.snr, rssi: rx.rssi },
    });

    // a failed publish must never break packet handling
    try {
      await push({
        type: "route-packet",
        packetType,
        route,
        snr: rx.snr,
        rssi: rx.rssi,
        receivedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn({ error }, "Failed to publish route-packet push event");
    }
  }
}
