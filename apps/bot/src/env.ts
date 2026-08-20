import "dotenv/config";

import type { Coord } from "@turf/turf";
import { z } from "zod";

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

const commaList = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== ""),
  );

export const envSchema = z.object({
  DEVICE: z.string().min(1, "serial device path is required"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  BOT_LOCATION: z.string().transform((value) => {
    const [lon, lat] = value.split(",").map((item) => Number(item.trim()));
    return [lon, lat] as Coord;
  }),
  PING_RESPONDER_CHANNELS: commaList,
  // public URL of the admin map, used in path responder replies
  BASE_URL: z.url(),
  MONITOR_PUBLIC_KEY: z.string().min(64),
  MESHRANK_REGISTRATION_KEY: z
    .string()
    .trim()
    .regex(/^[0-9A-Fa-f]{32}$/, "must be a 32-char hex registration key"),
  MESHRANK_MQTT_URL: z
    .url({ protocol: /^(mqtt|mqtts|ws|wss)$/ })
    .default("mqtts://meshrank.net:8883"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues
    .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment:\n${problems}\n\nSee apps/bot/src/example.env`);
}

export const env: Env = parseEnv();
