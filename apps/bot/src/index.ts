import { env } from "./env.js";
import { AdvertHandler } from "./handler/AdvertHandler.js";
import { GroupTextHandler } from "./handler/GroupTextHandler.js";
import { MeshRankHandler } from "./handler/MeshRankHandler.js";
import { RoutePacketHandler } from "./handler/RoutePacketHandler.js";
import { PingResponder } from "./handler/responder/PingResponder.js";
import { R0ute } from "./R0ute.js";

const r0ute = new R0ute({
  device: env.DEVICE,
  monitorPublicKey: env.MONITOR_PUBLIC_KEY,
  handlers: [
    new MeshRankHandler(),
    new AdvertHandler(),
    new RoutePacketHandler(),
    new GroupTextHandler({
      responders: [
        new PingResponder({
          channels: env.PING_RESPONDER_CHANNELS,
          keywords: ["test"],
          location: [-1.5428249, 53.1442947],
        }),
      ],
    }),
  ],
});

void r0ute.start();

const shutdown = async () => {
  await r0ute.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
