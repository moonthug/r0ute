import type { Channel } from "../../types.js";
import type { Coord } from "@turf/turf";
import type { NodeJSSerialConnection } from "@liamcottle/meshcore.js";
import type { Logger } from "pino";

export type MessageContext = {
  connection: NodeJSSerialConnection,
  user: string,
  location: Coord | undefined,
  logger: Logger,
  route: string[],
  timestamp: number
}

export type GroupMessageContext = MessageContext & {
  channel: Channel
}

export type Responder = {
  keywords?: string[],
}

export type ResponderOptions = {
  keywords?: string[],
}

abstract class ResponderBase {
  public readonly keywords: string[];

  protected constructor(options: { keywords?: string[] }) {
    this.keywords = options.keywords ?? [];
  }

  public abstract onMessage(message: string, context: MessageContext): void
}

export type GroupResponderOptions = ResponderOptions & {
  channels: string[]
}

export abstract class GroupResponderBase extends ResponderBase {
  public readonly channels: string[];

  protected constructor(options: GroupResponderOptions) {
    super(options);
    this.channels = options.channels;
  }

  public abstract onMessage(message: string, context: GroupMessageContext): void
}
