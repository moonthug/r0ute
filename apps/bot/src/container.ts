import "reflect-metadata";

import { NodeJSSerialConnection } from "@liamcottle/meshcore.js";
import { pino } from "pino";
import { container } from "tsyringe";

import { getDatabase } from "@r0ute/database";

import { env } from "@/env.ts";
import { AdvertHandler } from "@/handler/AdvertHandler.ts";
import { GroupTextHandler } from "@/handler/GroupTextHandler.ts";
import { MeshRankHandler } from "@/handler/MeshRankHandler.ts";
import { RoutePacketHandler } from "@/handler/RoutePacketHandler.ts";
import { PathResponder } from "@/handler/responder/PathResponder.ts";
import { PingResponder } from "@/handler/responder/PingResponder.ts";
import type { MeshRankOptions } from "@/service/MeshRankService.ts";
import { PathRequestService } from "@/service/PathRequestService.ts";
import {
  CONNECTION,
  DATABASE,
  ENV,
  HANDLER,
  LOGGER,
  MESHRANK_OPTIONS,
  RESPONDER,
} from "@/tokens.ts";

container.register(ENV, { useValue: env });
container.register(DATABASE, { useValue: getDatabase() });
container.register(LOGGER, { useValue: pino({ level: env.LOG_LEVEL }) });
container.register(CONNECTION, { useValue: new NodeJSSerialConnection(env.DEVICE) });

container.register<MeshRankOptions>(MESHRANK_OPTIONS, {
  useValue: {
    url: env.MESHRANK_MQTT_URL,
    registrationKey: env.MESHRANK_REGISTRATION_KEY,
    clientVersion: `r0ute_v${process.env.npm_package_version ?? "0.0"}`,
  },
});

// group-text responders
container.register(RESPONDER, {
  useFactory: () =>
    new PingResponder({
      channels: env.PING_RESPONDER_CHANNELS,
      keywords: ["test"],
      location: env.BOT_LOCATION,
    }),
});
container.register(RESPONDER, {
  useFactory: () =>
    new PathResponder(
      {
        channels: env.PING_RESPONDER_CHANNELS,
        keywords: ["path"],
        baseUrl: env.BASE_URL,
      },
      container.resolve(PathRequestService),
    ),
});

// packet handlers
container.register(HANDLER, { useClass: MeshRankHandler });
container.register(HANDLER, { useClass: AdvertHandler });
container.register(HANDLER, { useClass: RoutePacketHandler });
container.register(HANDLER, { useClass: GroupTextHandler });

export { container };
