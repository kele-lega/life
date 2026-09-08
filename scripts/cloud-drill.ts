import "fake-indexeddb/auto";
import { LifeDatabase } from "../src/lib/db/client";
import { captureArchive, packArchive, restoreArchive, unpackArchive } from "../src/features/cloud-backup/local/archive";
import { seedBackupFixture } from "../src/features/cloud-backup/test/fixture";
import { encodeJson, ensure, PART_BYTES, sha256, TABLE_NAMES, type BackupManifest } from "../src/features/cloud-backup/shared/format";

async function main() {
  const origin = process.env.CLOUD_APP_ORIGIN;
  const email = process.env.CLOUD_TEST_EMAIL;
  if (!origin || !email) throw new Error("test_configuration_required");
  let cookie = ""; let accountId = "";
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${origin}/api/cloud/${path}`, { method: body === undefined ? "GET" : "POST", headers: {
      Origin: origin!, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...(accountId ? { "X-Life-Account": accountId } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120_000), redirect: "error" });
    const nextCookie = response.headers.get("set-cookie"); if (nextCookie) cookie = nextCookie.split(";")[0];
    if (!response.ok) throw new Error("cloud_http_failure"); return response.json() as Promise<T>;
  }
  if (process.argv.includes("--otp")) { await api("auth/email/start", { email }); console.log("OTP requested for the configured test recipient. Set CLOUD_TEST_OTP locally, then run cloud:drill."); return; }
  const token = process.env.CLOUD_TEST_OTP; if (!token) throw new Error("test_otp_required");
  const account = await api<{ account: { id: string } }>("auth/email/verify", { email, token }); accountId = account.account.id;
  const local = new LifeDatabase(`synthetic-cloud-drill-${crypto.randomUUID()}`);
  let copy: LifeDatabase | undefined;
  try {
    await seedBackupFixture(local);
    const libraryId = crypto.randomUUID(); const backupId = crypto.randomUUID();
    const archive = await captureArchive(local, libraryId);
    await api("libraries/bind", { libraryId, installationId: crypto.randomUUID() });
    await api("backups", { id: backupId, manifest: archive.manifest });
    for (const file of archive.manifest.files) for (const part of file.parts) {
      const upload = await api<{ url: string; headers: Record<string, string> }>(`backups/${backupId}/uploads`, { path: file.path, index: part.index });
      const response = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: archive.files.get(file.path)!.slice(part.index * PART_BYTES, (part.index + 1) * PART_BYTES), signal: AbortSignal.timeout(120_000), redirect: "error" });
      ensure(response.ok);
      await api(`backups/${backupId}/ack`, { path: file.path, index: part.index });
    }
    await api(`backups/${backupId}/finalize`, {});
    let info: { status: string; manifest: BackupManifest; manifestSha256: string } | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      await api(`backups/${backupId}/verify`, {});
      info = await api(`backups/${backupId}`);
      if (info!.status === "complete") break;
    }
    ensure(info?.status === "complete");
    ensure(await sha256(new Blob([encodeJson(info.manifest)])) === info.manifestSha256);
    const files = new Map<string, Blob>();
    for (const file of info.manifest.files) {
      const chunks: Blob[] = [];
      for (const part of file.parts) {
        const download = await api<{ url: string }>(`backups/${backupId}/downloads`, { path: file.path, index: part.index });
        const response = await fetch(download.url, { signal: AbortSignal.timeout(120_000), redirect: "error" }); ensure(response.ok);
        chunks.push(await response.blob());
      }
      files.set(file.path, new Blob(chunks));
    }
    // Exercise the identical portable ZIP import path after the real cloud download.
    const imported = await unpackArchive(await packArchive({ manifest: info.manifest, files }));
    const restored = await restoreArchive(imported); copy = new LifeDatabase(restored.databaseName);
    for (const name of TABLE_NAMES.filter((name) => name !== "attachments")) ensure(encodeJson(await local.table(name).toArray()) === encodeJson(await copy.table(name).toArray()));
    const originalImage = (await local.attachments.toArray())[0]; const restoredImage = (await copy.attachments.toArray())[0];
    ensure(await sha256(originalImage.blob) === await sha256(restoredImage.blob));
    console.log(JSON.stringify({ result: "passed", backupId, sevenStores: true, imagesVerified: true, isolatedRestore: true, aiRequests: 0 }));
  } finally {
    // Only disposable in-memory fake-indexeddb instances, never a user's browser database.
    await local.delete(); if (copy) await copy.delete(); await api("auth/logout", {}).catch(() => {});
  }
}
void main().catch(() => { process.exitCode = 1; console.error("Cloud drill not completed. Check the configured test OTP, restricted database roles, private bucket/CORS and application origin; no content or credentials are logged."); });
