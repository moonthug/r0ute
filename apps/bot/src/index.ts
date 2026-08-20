import "reflect-metadata";

import { container } from "@/container.ts";
import { R0ute } from "@/R0ute.ts";

const r0ute = container.resolve(R0ute);

void r0ute.start();

const shutdown = async () => {
  await r0ute.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
