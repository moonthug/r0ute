import { type Packet } from "@liamcottle/meshcore.js";

import type { Handler, HandlerContext } from "./Handler.js";
import { PacketType } from "../types.js";

export class AdvertHandler implements Handler {
  public packetType: PacketType = PacketType.Advert;
  public onMessage(packet: Packet, { locationManager, logger }: HandlerContext) {
    const advert = packet.parsePayloadTypeAdvert();
    const recorded = locationManager.recordAdvert(advert);

    if (recorded) {
      logger.debug({
        handler: "ADVERT",
        type: "LOCATION_UPDATE",
        data: {
          name: advert.app_data.name ?? "unknown"
        }
      });
    }
  }
}
