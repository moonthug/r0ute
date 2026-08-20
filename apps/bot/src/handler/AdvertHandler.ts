import type { Packet } from "@liamcottle/meshcore.js";
import { inject, injectable } from "tsyringe";

import { push } from "@r0ute/database";

import { LocationService } from "@/service/LocationService.ts";
import { PacketType } from "@/types.ts";

import type { Handler, HandlerContext } from "./Handler.ts";

@injectable()
export class AdvertHandler implements Handler {
  public packetTypes: PacketType[] = [PacketType.Advert];

  constructor(@inject(LocationService) private readonly locationService: LocationService) {}

  public async onMessage(packet: Packet, { logger }: HandlerContext) {
    const advert = packet.parsePayloadTypeAdvert();
    const recorded = await this.locationService.upsertLocationForAdvert(advert);

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
          nodeType: recorded.nodeType,
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
