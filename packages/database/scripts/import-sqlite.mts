import { DatabaseSync } from "node:sqlite";
import { createPrismaClient, isValidCoordinate } from "../src/index.ts";

type ImportRow = {
  publicKey: string;
  name: string | null;
  lat: number;
  lon: number;
  advertTimestamp: Date;
  receivedAt: Date;
};

function readRows(sqlitePath: string): ImportRow[] {
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });

  try {
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    const names = new Set(tables.map((table) => table.name));

    if (names.has("AdvertLocation")) {
      const rows = sqlite
        .prepare(
          'SELECT "publicKey", name, lat, lon, "advertTimestamp", "receivedAt" FROM "AdvertLocation"',
        )
        .all() as {
        publicKey: string;
        name: string | null;
        lat: number;
        lon: number;
        advertTimestamp: string;
        receivedAt: string;
      }[];
      return rows.map((row) => ({
        ...row,
        advertTimestamp: new Date(row.advertTimestamp),
        receivedAt: new Date(row.receivedAt),
      }));
    }

    if (names.has("advert_locations")) {
      const rows = sqlite
        .prepare(
          "SELECT public_key, name, lat, lon, advert_timestamp, received_at FROM advert_locations",
        )
        .all() as {
        public_key: string;
        name: string | null;
        lat: number;
        lon: number;
        advert_timestamp: number;
        received_at: number;
      }[];
      return rows.map((row) => ({
        publicKey: row.public_key,
        name: row.name,
        lat: row.lat,
        lon: row.lon,
        advertTimestamp: new Date(row.advert_timestamp * 1000),
        receivedAt: new Date(row.received_at * 1000),
      }));
    }

    throw new Error(`no advert location table found in ${sqlitePath}`);
  } finally {
    sqlite.close();
  }
}

const sqlitePath = process.argv[2];
if (!sqlitePath) {
  console.error("usage: import-sqlite <path-to-sqlite-file>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const allRows = readRows(sqlitePath);
// old databases predate coordinate validation, so they can carry garbage rows
const rows = allRows.filter((row) => isValidCoordinate(row.lat, row.lon));
const skipped = allRows.length - rows.length;

const db = createPrismaClient(process.env.DATABASE_URL);

for (const row of rows) {
  const { publicKey, ...data } = row;
  await db.advertLocation.upsert({
    where: { publicKey },
    create: { publicKey, ...data },
    update: data,
  });
}

const total = await db.advertLocation.count();
await db.$disconnect();
console.log(
  `imported ${rows.length} rows from ${sqlitePath}` +
    (skipped > 0 ? ` (skipped ${skipped} with invalid coordinates)` : "") +
    `; postgres now holds ${total}`,
);
