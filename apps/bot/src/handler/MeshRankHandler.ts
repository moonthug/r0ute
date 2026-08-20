import type { Packet, SelfInfo } from "@liamcottle/meshcore.js";
import { inject, injectable } from "tsyringe";

import { MeshRankService } from "@/service/MeshRankService.ts";
import { PacketType } from "@/types.ts";

import type { Handler, HandlerContext } from "./Handler.ts";

@injectable()
export class MeshRankHandler implements Handler {
  public packetTypes: PacketType[] = Object.values(PacketType);

  constructor(@inject(MeshRankService) private readonly meshRank: MeshRankService) {}

  public async initialise(selfInfo: SelfInfo): Promise<void> {
    await this.meshRank.connect({
      publicKey: Buffer.from(selfInfo.publicKey).toString("hex"),
      name: selfInfo.name ?? "unknown",
      radio: `${selfInfo.radioFreq / 1000},${selfInfo.radioBw / 1000},${selfInfo.radioSf},${selfInfo.radioCr}`,
    });
  }

  public onMessage(packet: Packet, { logger, rx }: HandlerContext) {
    try {
      this.meshRank.publishPacket(rx.raw, packet, rx);
    } catch (error) {
      logger.warn({ error }, "Failed to publish packet to MeshRank");
    }
  }
}
