import type { NodeJSSerialConnection } from "@liamcottle/meshcore.js";
import type { Coord } from "@turf/turf";
import type { Logger } from "pino";

import type { Channel } from "@/types.ts";

export type MessageContext = {
  connection: NodeJSSerialConnection;
  user: string;
  location: Coord | undefined;
  logger: Logger;
  route: string[];
  timestamp: number;
};

export type GroupMessageContext = MessageContext & {
  channel: Channel;
};

export interface Responder {
  keywords?: string[];
}

export type ResponderOptions = {
  keywords?: string[];
};

abstract class ResponderBase implements Responder {
  public readonly keywords: string[];

  protected constructor(options: { keywords?: string[] }) {
    this.keywords = options.keywords ?? [];
  }

  public async handleMessage(message: string, context: MessageContext): Promise<void> {
    await this.onMessage(message, context);
  }

  protected abstract onMessage(message: string, context: MessageContext): Promise<void>;
}

export type GroupResponderOptions = ResponderOptions & {
  channels: string[];
};

export type GroupResponderRequest = {
  channelId: number;
  userName: string;
  requestTimestamp: number;
};

export abstract class GroupResponderBase extends ResponderBase {
  public readonly channels: string[];
  protected readonly responderRequests: GroupResponderRequest[];

  protected constructor(options: GroupResponderOptions) {
    super(options);
    this.channels = options.channels;

    this.responderRequests = [];
  }

  public async handleMessage(message: string, context: GroupMessageContext): Promise<void> {
    const { channel, user, timestamp } = context;
    if (this.responderRequests.length > 500) {
      this.responderRequests.shift();
    }

    const requestFulfilled = this.responderRequests.find(
      (request) =>
        request.channelId === channel.id &&
        request.requestTimestamp === timestamp &&
        request.userName === user,
    );

    if (requestFulfilled) {
      return;
    }

    this.responderRequests.push({
      channelId: channel.id,
      requestTimestamp: timestamp,
      userName: user,
    });

    await this.onMessage(message, context);
  }

  protected abstract onMessage(message: string, context: GroupMessageContext): Promise<void>;
}
