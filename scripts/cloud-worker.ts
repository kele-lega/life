import { runPendingVerifications } from "../src/features/cloud-backup/server/runtime";

async function main() {
  const result = await runPendingVerifications(120_000);
  if (!result.configured) throw new Error("worker_unconfigured");
  console.log(JSON.stringify(result));
}
void main().catch(() => { process.exitCode = 1; console.error("Cloud verification worker failed; check server configuration and stored error codes."); });
