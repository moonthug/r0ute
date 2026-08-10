import { createHmac, createDecipheriv } from "node:crypto"
import type { Packet } from "@liamcottle/meshcore.js";

import type { Handler, HandlerContext } from "./Handler.js";
import { GroupResponderBase } from "./responder/Responder.js";
import { type Channel, PacketType } from "../types.js";

type GroupTextHandlerOptions = {
  responders: GroupResponderBase[]
}

export class GroupTextHandler implements Handler {
  public packetType: PacketType = PacketType.GroupText;
  private readonly responders: GroupResponderBase[];

  constructor(options: GroupTextHandlerOptions) {
    this.responders = options.responders;
  }

  private decodeGroupText(payload: Uint8Array, channel: Channel) {
    const mac = payload.subarray(1, 3);        // [0] is the channel hash byte
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

  public onMessage(packet: Packet, context: HandlerContext) {
    const { connection, channelMap, locationManager, logger, nodeName } = context;

    const route = packet.getPathHashes()
      .map(hash => Buffer.from(hash).toString("hex"))

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

    const colonIdx = messageData.text.indexOf(':');
    if (colonIdx === -1) {
      return
    }

    const user = messageData.text.slice(0, colonIdx);
    const message = messageData.text.slice(colonIdx + 1).toLowerCase();

    // repeaters re-flood our own replies back to us — never respond to ourselves
    if (nodeName !== null && user === nodeName) {
      return;
    }

    const position = locationManager.latestPositionFor(user);


    logger.debug({
      handler: "GRP_TXT",
      type: "MESSAGE",
      data: {
        user,
        channel: channel.name,
        location: position?.coord,
        timestamp: messageData.senderTimestamp,
      }
    });

    this.responders.forEach(responder => {
      if (responder.keywords?.some(keyword => message.includes(keyword))) {
        responder.onMessage(message, {
          connection,
          channel,
          user,
          route,
          logger,
          location: position?.coord,
          timestamp: messageData.senderTimestamp,
        });
      }
    });
  }
}
