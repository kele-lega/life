import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { PROVIDER_TLS_CA } from "../src/features/cloud-backup/server/provider-ca";

function pool(url: string) {
  const address = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(address.hostname);
  const configured = address.searchParams.get("sslrootcert");
  address.searchParams.delete("sslrootcert");
  address.searchParams.delete("sslmode");
  const ssl = local ? undefined : {
    rejectUnauthorized: true as const,
    ca: configured && existsSync(configured) ? readFileSync(configured, "utf8") : PROVIDER_TLS_CA,
  };
  return new Pool({ connectionString: address.toString(), ssl, max: 1, connectionTimeoutMillis: 15_000, statement_timeout: 20_000 });
}

async function expectDenied(work: () => Promise<unknown>, label: string) {
  try {
    await work();
    throw new Error(`${label}_expected_denied`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.endsWith("_expected_denied")) throw error;
    if (!/permission denied|42501/i.test(message)) throw new Error(`${label}_unexpected: ${message.split("\n")[0]}`);
  }
}

async function main() {
  const appUrl = process.env.CLOUD_DATABASE_URL;
  const workerUrl = process.env.CLOUD_WORKER_DATABASE_URL;
  const origin = process.env.CLOUD_APP_ORIGIN;
  const email = process.env.CLOUD_TEST_EMAIL;
  if (!appUrl || !workerUrl) throw new Error("test_configuration_required");
  const app = pool(appUrl);
  const worker = pool(workerUrl);
  try {
    const appIdentity = await app.query<{ current_user: string }>("SELECT current_user");
    const workerIdentity = await worker.query<{ current_user: string }>("SELECT current_user");
    if (!appIdentity.rows[0].current_user.includes("life_cloud_app")) throw new Error("app_role_mismatch");
    if (!workerIdentity.rows[0].current_user.includes("life_cloud_worker")) throw new Error("worker_role_mismatch");
    if (appIdentity.rows[0].current_user === workerIdentity.rows[0].current_user) throw new Error("app_worker_same_login");

    const migrated = await app.query<{ version: number }>("SELECT version FROM life_cloud.schema_migrations ORDER BY version");
    const versions = migrated.rows.map((row) => Number(row.version));
    if (!versions.includes(4)) throw new Error("replica_migration_missing");

    await app.query("SELECT COUNT(*) FROM life_cloud.replica_moments");
    await app.query("SELECT COUNT(*) FROM life_cloud.backups");
    await worker.query("SELECT COUNT(*) FROM life_cloud.backups");

    await expectDenied(() => worker.query("SELECT COUNT(*) FROM life_cloud.replica_moments"), "worker_replica_select");
    await expectDenied(
      () => worker.query("INSERT INTO life_cloud.replica_state(account_id,writer_id,epoch) VALUES($1,$2,1)", [
        "11111111-1111-4111-8111-111111111111",
        "11111111-1111-4111-8111-111111111111",
      ]),
      "worker_replica_insert",
    );
    await expectDenied(
      () => app.query("UPDATE life_cloud.replica_mutations SET payload='{}'::jsonb WHERE false"),
      "app_mutation_update",
    );
    await expectDenied(
      () => app.query("DELETE FROM life_cloud.replica_mutations WHERE false"),
      "app_mutation_delete",
    );
    await expectDenied(
      () => app.query("DELETE FROM life_cloud.backups WHERE false"),
      "app_backup_delete",
    );

    console.log("replica_permissions_ok");
    if (process.argv.includes("--otp")) {
      if (!origin || !email) throw new Error("test_configuration_required");
      const response = await fetch(`${origin}/api/replica/auth/email/start`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error(`otp_http_${response.status}`);
      console.log("OTP requested for the configured test recipient. Set CLOUD_TEST_OTP locally, then run cloud:replica-drill.");
    }
  } finally {
    await app.end();
    await worker.end();
  }
}

void main().catch(() => {
  process.exitCode = 1;
  console.error("Replica acceptance failed. Credentials and payloads are not logged.");
});
