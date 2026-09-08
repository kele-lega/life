import { Pool, type QueryResultRow } from "pg";

export interface SqlConnection { query<T extends QueryResultRow = QueryResultRow>(query: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> }
export interface SqlDatabase extends SqlConnection { transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T> }
export function postgresDatabase(connectionString: string): SqlDatabase {
  // Use sslmode=verify-full (and the provider CA if necessary) in the connection string.
  // Never disable certificate verification to work around configuration errors.
  const address = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(address.hostname)) address.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({ connectionString: address.toString(), max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 20_000, statement_timeout: 30_000 });
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
