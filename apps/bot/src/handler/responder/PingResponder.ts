import { type Coord, distance } from "@turf/turf";

import {
  type GroupMessageContext,
  GroupResponderBase,
  type GroupResponderOptions,
} from "./Responder.js";

type PingResponderOptions = GroupResponderOptions & {
  location: Coord;
};

export class PingResponder extends GroupResponderBase {
  private readonly location: Coord;

  constructor(options: PingResponderOptions) {
    super(options);
    this.location = options.location;
  }

  async onMessage(_message: string, context: GroupMessageContext) {
    const { connection, channel, location, logger, route, user } = context;

    const distanceMessage = location
      ? `\n${distance(this.location, location, { units: "miles" }).toFixed(1)} miles away`
      : "";

    const routeMessage =
      route.length === 0 ? "direct" : `${route.join(",")} (${route.length} hops)`;

    const message = `@[${user}]\n⛰️ RX in Matlock️ ⛰️\nRoute: ${routeMessage}${distanceMessage}`;
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
