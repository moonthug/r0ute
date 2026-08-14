import { AdvertHandler } from "./handler/AdvertHandler.js";
import { GroupTextHandler } from "./handler/GroupTextHandler.js";
import { RoutePacketHandler } from "./handler/RoutePacketHandler.js";
import { PingResponder } from "./handler/responder/PingResponder.js";
import { R0ute } from "./R0ute.js";

if (!process.env.DEVICE) {
  throw new Error("DEVICE environment variable is not set");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const r0ute = new R0ute({
  device: process.env.DEVICE,
  monitorPublicKey: "07a7bc43b98a6223b133d90bd5962348e02784d66e641afc11656183d70a19bf",
  handlers: [
    new AdvertHandler(),
    new RoutePacketHandler(),
    new GroupTextHandler({
      responders: [
        new PingResponder({
          channels: process.env.PING_RESPONDER_CHANNELS?.split(",") ?? [],
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
