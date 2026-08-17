import type { Packet, SelfInfo } from "@liamcottle/meshcore.js";
import { pino } from "pino";
import { env } from "../env.ts";

import { MeshRankService } from "../service/MeshRankService.ts";
import { PacketType } from "../types.ts";
import type { Handler, HandlerContext } from "./Handler.ts";

export class MeshRankHandler implements Handler {
  public packetTypes: PacketType[] = Object.values(PacketType);

  private readonly meshRank: MeshRankService;

  constructor() {
    this.meshRank = new MeshRankService({
      logger: pino({ level: env.LOG_LEVEL }),
      registrationKey: env.MESHRANK_REGISTRATION_KEY,
      url: env.MESHRANK_MQTT_URL,
      clientVersion: "r0ute",
    });
  }

  public async initialise(selfInfo: SelfInfo): Promise<void> {
    await this.meshRank.connect({
      publicKey: Buffer.from(selfInfo.publicKey).toString("hex"),
      name: selfInfo.name ?? "unknown",
      radio: `${selfInfo.radioFreq / 1000},${selfInfo.radioBw / 1000},${selfInfo.radioSf},${selfInfo.radioCr}`,
    });
  }

  public onMessage(packet: Packet, { logger, rx }: HandlerContext) {
    try {
      console.log("Publishing packet to MeshRank");
      this.meshRank.publishPacket(rx.raw, packet, rx);
    } catch (error) {
      logger.warn({ error }, "Failed to publish packet to MeshRank");
    }
  }
}
