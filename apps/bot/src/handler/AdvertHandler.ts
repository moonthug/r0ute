import type { Packet } from "@liamcottle/meshcore.js";
import { push } from "@r0ute/database";

import { PacketType } from "../types.js";
import type { Handler, HandlerContext } from "./Handler.js";

export class AdvertHandler implements Handler {
  public packetTypes: PacketType[] = [PacketType.Advert];
  public async onMessage(packet: Packet, { locationService, logger }: HandlerContext) {
    const advert = packet.parsePayloadTypeAdvert();
    const recorded = await locationService.upsertLocationForAdvert(advert);

    if (recorded) {
      logger.debug({
        handler: "ADVERT",
        type: "LOCATION_UPDATE",
        data: {
          name: advert.app_data.name ?? "unknown",
        },
      });

      try {
        await push({
          type: "advert",
          publicKey: recorded.publicKey,
          name: recorded.name,
          lat: recorded.lat,
          lon: recorded.lon,
          advertTimestamp: recorded.advertTimestamp.toISOString(),
          receivedAt: recorded.receivedAt.toISOString(),
        });
      } catch (error) {
        logger.warn({ error }, "Failed to publish advert push event");
      }
    }
  }
}
