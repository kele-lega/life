import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

// Explicit operator command. The application never runs DDL during requests/builds.
async function main() {
  const url = process.env.CLOUD_MIGRATION_DATABASE_URL;
  if (!url) throw new Error("migration_unconfigured");
  const address = new URL(url);
  if (!["localhost", "127.0.0.1", "postgres", "life-postgres"].includes(address.hostname)) address.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({ connectionString: address.toString(), max: 1 });
  try {
    for (const file of ["001-foundation.sql", "002-roles.sql", "003-immutable-snapshots.sql", "004-replica.sql"]) {
      await pool.query(await readFile(resolve("infrastructure/cloud", file), "utf8"));
      console.log(`Applied ${file}`);
    }
  } finally { await pool.end(); }
}
void main().catch(() => { process.exitCode = 1; console.error("Cloud migration failed. Configure the migration URL and permissions; credentials/query payloads are not logged."); });
