import { existsSync, readFileSync } from "node:fs";
import { Pool, type QueryResultRow } from "pg";

import { PROVIDER_TLS_CA } from "./provider-ca";

export interface SqlConnection { query<T extends QueryResultRow = QueryResultRow>(query: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> }
export interface SqlDatabase extends SqlConnection { transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T> }

function remoteTls(address: URL) {
  const configured = address.searchParams.get("sslrootcert");
  address.searchParams.delete("sslrootcert");
  address.searchParams.delete("sslmode");
  const ca = configured && existsSync(configured) ? readFileSync(configured, "utf8") : PROVIDER_TLS_CA;
  return { rejectUnauthorized: true as const, ca };
}

export function postgresDatabase(connectionString: string): SqlDatabase {
  // Remote connections verify the provider CA. Never disable certificate verification.
  const address = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(address.hostname);
  const ssl = local ? undefined : remoteTls(address);
  const pool = new Pool({ connectionString: address.toString(), ssl, max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 20_000, statement_timeout: 30_000 });
  pool.on("error", () => { /* Request boundaries expose non-content error codes. */ });
  return {
    query: (text, params) => pool.query(text, params),
    async transaction(work) {
      const client = await pool.connect();
      try { await client.query("BEGIN"); const value = await work(client); await client.query("COMMIT"); return value; }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
  };
}
