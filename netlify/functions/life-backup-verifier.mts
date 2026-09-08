import { runPendingVerifications } from "../../src/features/cloud-backup/server/runtime";

// Advances only snapshots explicitly finalized by a user. Never captures local records.
export default async function handler() {
  try { await runPendingVerifications(15_000); }
  catch { console.error("life_backup_worker_unavailable"); }
}
export const config = { schedule: "* * * * *" };
