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
    const { connection, channel, logger, route, timestamp, user } = context;

    if (route.length === 0) {
      await connection.sendChannelTextMessage(channel.id, `@[${user}] Direct path`);
      return;
    }

    const pathRequest = await this.pathRequestService.createPath({
      channelId: channel.id,
      userName: user,
      requestTimestamp: timestamp,
      path: route,
    });

    const message = `@[${user}] Path: ${this.baseUrl}/${pathRequest.id}`;

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
