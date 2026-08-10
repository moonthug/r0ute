import { createPrismaClient, type Database } from "@r0ute/database";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// reuse one client across dev hot reloads
const globalForDb = globalThis as unknown as { db?: Database };

export const db = globalForDb.db ?? createPrismaClient(process.env.DATABASE_URL);

globalForDb.db = db;
