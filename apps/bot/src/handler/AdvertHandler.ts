import type { Packet } from "@liamcottle/meshcore.js";
import { PUSH_CHANNELS } from "@r0ute/database";

import { PacketType } from "../types.js";
import type { Handler, HandlerContext } from "./Handler.js";

export class AdvertHandler implements Handler {
  public packetType: PacketType = PacketType.Advert;
  public async onMessage(packet: Packet, { locationManager, logger, push }: HandlerContext) {
    const advert = packet.parsePayloadTypeAdvert();
    const recorded = await locationManager.recordAdvert(advert);

    if (recorded) {
      await push(PUSH_CHANNELS.adverts, recorded);

      logger.debug({
        handler: "ADVERT",
        type: "LOCATION_UPDATE",
        data: {
          name: advert.app_data.name ?? "unknown",
        },
      });
    }
  }
}
