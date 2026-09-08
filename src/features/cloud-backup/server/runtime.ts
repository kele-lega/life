// Only imported by the server-only HTTP boundary and the deployment worker.
import { cloudConfig, type CloudConfig } from "./config";
import { postgresDatabase } from "./sql";
import { CloudStore } from "./store";
import { s3Objects } from "./objects";
import { BackupService } from "./service";
import { supabaseEmailAuth } from "./auth";
import { assertApplicationRole } from "./role";

let runtime: ReturnType<typeof createRuntime> | undefined;
let workerRuntime: ReturnType<typeof createRuntime> | undefined;
function createRuntime(config: CloudConfig) {
  const store = new CloudStore(postgresDatabase(config.databaseUrl));
  const objects = s3Objects(config);
  return { config, store, service: new BackupService(store, objects), auth: supabaseEmailAuth(config) };
}
export function cloudRuntime() { return runtime ??= createRuntime(cloudConfig()); }
let checkedRole: Promise<void> | undefined;
export async function checkedCloudRuntime() {
  const value = cloudRuntime();
  try { await (checkedRole ??= assertApplicationRole(value.store.sql)); }
  catch (error) { checkedRole = undefined; throw error; }
  return value;
}

export async function runPendingVerifications(budgetMs = 20_000) {
  if (!process.env.CLOUD_WORKER_DATABASE_URL) return { processed: 0, configured: false };
  const config = { ...cloudConfig(), databaseUrl: process.env.CLOUD_WORKER_DATABASE_URL };
  const worker = workerRuntime ??= createRuntime(config);
  const deadline = Date.now() + budgetMs;
  const result = await worker.store.sql.query<{ id: string; account_id: string }>(`SELECT id,account_id FROM life_cloud.backups
    WHERE status='verifying' AND (lease_until IS NULL OR lease_until<now()) ORDER BY received_at LIMIT 5`);
  let processed = 0;
  for (const row of result.rows) {
    if (Date.now() >= deadline) break;
    try { await worker.service.verifySlice(row.account_id, row.id, Math.max(1000, deadline - Date.now())); processed++; }
    catch { /* Non-content failure state is already persisted; retry is explicit. */ }
  }
  return { processed, configured: true };
}
