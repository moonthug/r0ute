import {
  type GroupMessageContext,
  type GroupResponderOptions,
  GroupResponderBase,
} from "./Responder.js";
import { type Coord, distance } from "@turf/turf";

export type PingRequest = {
  channelId: number,
  userName: string,
  requestTimestamp: number
}

type PingResponderOptions = GroupResponderOptions & {
  location: Coord
}

export class PingResponder extends GroupResponderBase {
  private readonly pingRequests: PingRequest[];
  private readonly location: Coord;

  constructor(options: PingResponderOptions) {
    super(options);
    this.location = options.location;

    this.pingRequests = [];
  }

  async onMessage(_message: string, context: GroupMessageContext) {
    const { connection, channel, location, logger, route, timestamp, user } = context;

    if (this.pingRequests.length > 500) {
      this.pingRequests.shift();
    }

    const requestFulfilled = this.pingRequests.find(request =>
      request.channelId === channel.id
      && request.requestTimestamp === timestamp
      && request.userName === user
    );

    if (requestFulfilled) {
      return;
    }

    this.pingRequests.push({
      channelId: channel.id,
      requestTimestamp: timestamp,
      userName: user
    });

    const distanceMessage = location
      ? `\n${distance(this.location, location, { units: "miles" }).toFixed(1)} miles away`
      : ''

    const routeMessage = route.length === 0
      ? "direct"
      : `${route.join(",")} (${route.length} hops)`

    const message = `@[${user}]  ⛰️ RX in Matlock️ ⛰️\nRoute: ${routeMessage}${distanceMessage}`;
    await connection.sendChannelTextMessage(channel.id, message);

    logger.debug({
      responder: "PING",
      data: {
        message: message,
        bufferSize: this.pingRequests.length
      }
    });
  }
}
