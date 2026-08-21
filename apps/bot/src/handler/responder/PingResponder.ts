import { type Coord, distance } from "@turf/turf";

import type { PathRequestService } from "@/service/PathRequestService.ts";

import {
  type GroupMessageContext,
  GroupResponderBase,
  type GroupResponderOptions,
} from "./Responder.js";

type PingResponderOptions = GroupResponderOptions & {
  baseUrl: string;
  location: Coord;
};

export class PingResponder extends GroupResponderBase {
  private readonly location: Coord;
  private readonly baseUrl: string;

  constructor(
    options: PingResponderOptions,
    private readonly pathRequestService: PathRequestService,
  ) {
    super(options);
    this.location = options.location;
    this.baseUrl = options.baseUrl;
  }

  async onMessage(_message: string, context: GroupMessageContext) {
    const { connection, channel, location, logger, route, timestamp, user } = context;

    const distanceMessage = location
      ? `\n${distance(this.location, location, { units: "miles" }).toFixed(1)} miles away`
      : "";

    let routeMessage = "";

    // Direct and single-byte routes
    if (!route?.length || route[0]?.length === 2) {
      routeMessage = route.length === 0 ? "direct" : `${route.join(",")} (${route.length} hops)`;
    } else {
      const pathRequest = await this.pathRequestService.createPath({
        channelId: channel.id,
        userName: user,
        requestTimestamp: timestamp,
        path: route,
      });

      routeMessage = `${this.baseUrl}/${pathRequest.slug}`;
    }

    const message = `@[${user}]\n⛰️ RX in Matlock️ ⛰️\nRoute: ${routeMessage}\n${distanceMessage}`;
    await connection.sendChannelTextMessage(channel.id, message);

    logger.debug({
      responder: "PING",
      data: {
        message: message,
        bufferSize: this.responderRequests.length,
      },
    });
  }
}
