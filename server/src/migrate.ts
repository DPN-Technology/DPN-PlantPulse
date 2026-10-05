import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../db/schema.sql");
const schema = await readFile(schemaPath, "utf8");
const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query(schema);
  process.stdout.write("PlantPulse platform schema applied successfully.\n");
} finally {
  await pool.end();
}
