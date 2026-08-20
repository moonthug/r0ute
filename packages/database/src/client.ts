import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client.ts";

export function createPrismaClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg(connectionString),
  });
}

export type Database = ReturnType<typeof createPrismaClient>;

// process-wide singleton for consumers that read DATABASE_URL from the
// environment; survives dev hot reloads via globalThis
const globalForDb = globalThis as { __r0uteDatabase?: Database };

export function getDatabase(): Database {
  if (!globalForDb.__r0uteDatabase) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    globalForDb.__r0uteDatabase = createPrismaClient(process.env.DATABASE_URL);
  }
  return globalForDb.__r0uteDatabase;
}
