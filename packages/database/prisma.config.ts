import { defineConfig } from "prisma/config";

// used by the prisma CLI (migrate/generate); the app passes its own URL at runtime.
// the default matches the postgres service in docker-compose.yml
const url = process.env.DATABASE_URL ?? "postgresql://r0ute:r0ute@localhost:5433/r0ute";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
});
