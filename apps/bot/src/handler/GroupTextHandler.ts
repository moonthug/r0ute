import { createDecipheriv, createHmac } from "node:crypto";

import type { Packet } from "@liamcottle/meshcore.js";
import { inject, injectAll, injectable } from "tsyringe";

import { push } from "@r0ute/database";

import { LocationService } from "@/service/LocationService.ts";
import { RESPONDER } from "@/tokens.ts";
import { type Channel, PacketType } from "@/types.ts";

import type { Handler, HandlerContext } from "./Handler.ts";
import type { GroupResponderBase } from "./responder/Responder.ts";

@injectable()
export class GroupTextHandler implements Handler {
  public packetTypes: PacketType[] = [PacketType.GroupText];

  constructor(
    @inject(LocationService) private readonly locationService: LocationService,
    @injectAll(RESPONDER) private readonly responders: GroupResponderBase[],
  ) {}

  private decodeGroupText(payload: Uint8Array, channel: Channel) {
    const mac = payload.subarray(1, 3); // [0] is the channel hash byte
    const ciphertext = payload.subarray(3);

    // encrypt-then-MAC: first 2 bytes of HMAC-SHA256 over the ciphertext
    const expected = createHmac("sha256", channel.secret).update(ciphertext).digest();
    if (mac[0] !== expected[0] || mac[1] !== expected[1]) {
      return null; // not this channel's key — try the next channel's secret
    }

    const decipher = createDecipheriv("aes-128-ecb", channel.secret.subarray(0, 16), null);
    decipher.setAutoPadding(false); // zero-padded, not PKCS#7
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return {
      senderTimestamp: plain.readUInt32LE(0),
      txtType: plain[4],
      text: plain.subarray(5).toString("utf8").replace(/\0+$/, ""), // "Sender: message"
    };
  }

  public async onMessage(packet: Packet, context: HandlerContext) {
    const { connection, channelMap, logger, nodeName } = context;

    const route = packet.getPathHashes().map((hash) => Buffer.from(hash).toString("hex"));

    const channelHash = packet.payload[0];
    if (channelHash === undefined) {
      return;
    }

    const channel = channelMap.get(channelHash);
    if (!channel) {
      return; // unknown channel
    }

    const messageData = this.decodeGroupText(packet.payload, channel);
    if (!messageData) {
      return; // Could not decode
    }

    const colonIdx = messageData.text.indexOf(":");
    if (colonIdx === -1) {
      return;
    }

    const user = messageData.text.slice(0, colonIdx);
    const message = messageData.text.slice(colonIdx + 1).toLowerCase();

    // repeaters re-flood our own replies back to us — never respond to ourselves
    if (nodeName !== null && user === nodeName) {
      return;
    }

    const location = await this.locationService.getLocationByName(user);
    const position = location ? { coord: [location.lon, location.lat] as [number, number] } : null;

    try {
      await push({
        type: "group-message",
        channel: channel.name,
        user,
        route,
        senderTimestamp: messageData.senderTimestamp,
        receivedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn({ error }, "Failed to publish group-message push event");
    }

    for (const responder of this.responders) {
      const keywordMatch = responder.keywords?.some((keyword) => message.includes(keyword));
      const channelMatch = responder.channels.includes(channel.name);

      if (keywordMatch && channelMatch) {
        logger.debug({
          handler: "GRP_TXT",
          type: "MESSAGE",
          data: {
            user,
            channel: channel.name,
            keywords: responder.keywords,
            location: position?.coord,
            timestamp: messageData.senderTimestamp,
          },
        });

        try {
          await responder.handleMessage(message, {
            connection,
            channel,
            user,
            route,
            logger,
            location: position?.coord,
            timestamp: messageData.senderTimestamp,
          });
        } catch (error) {
          logger.warn({ user, channel: channel.name, error }, "responder failed");
        }
      }
    }
  }
}
