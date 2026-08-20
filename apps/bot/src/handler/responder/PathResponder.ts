import type { PathRequestService } from "@/service/PathRequestService.ts";

import {
  type GroupMessageContext,
  GroupResponderBase,
  type GroupResponderOptions,
} from "./Responder.ts";

export type PathResponderOptions = GroupResponderOptions & {
  baseUrl: string;
};

export class PathResponder extends GroupResponderBase {
  private readonly baseUrl: string;

  constructor(
    options: PathResponderOptions,
    private readonly pathRequestService: PathRequestService,
  ) {
    super(options);
    this.baseUrl = options.baseUrl;
  }

  async onMessage(_message: string, context: GroupMessageContext) {
    const { channel, logger, route, timestamp, user } = context;

    // Skip direct routes
    if (!route?.length) {
      return;
    }

    // Skip single byte routes
    if (route && route[0]?.length === 2) {
      return;
    }

    const pathRequest = await this.pathRequestService.createPath({
      channelId: channel.id,
      userName: user,
      requestTimestamp: timestamp,
      path: route,
    });

    const message = `@[${user}] ${this.baseUrl}/${pathRequest.id}`;

    //await connection.sendChannelTextMessage(channel.id, message);

    logger.debug({
      responder: "PATH",
      data: {
        message: message,
        bufferSize: this.responderRequests.length,
      },
    });
  }
}
