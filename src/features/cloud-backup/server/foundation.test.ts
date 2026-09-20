// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { LifeDatabase } from "@/lib/db/client";
import { captureArchive, restoreArchive } from "../local/archive";
import { BackupError, encodeJson, PART_BYTES, type BackupArchive } from "../shared/format";
import { seedBackupFixture } from "../test/fixture";
import { createCloudHandler } from "./handler";
import { CloudStore, digest, manifestOf } from "./store";
import { BackupService } from "./service";
import type { ObjectStorage } from "./objects";
import type { CloudConfig } from "./config";
import type { SqlDatabase } from "./sql";
import { assertApplicationRole } from "./role";

class MemoryObjects implements ObjectStorage {
  readonly data = new Map<string, Uint8Array>();
  fail = false;
  calls = 0;
  async uploadUrl(key: string) { return { url: `https://objects.invalid/${key}`, headers: {} }; }
  async downloadUrl(key: string) { return `https://objects.invalid/${key}`; }
  async read(key: string) {
    this.calls++;
    if (this.fail) throw new Error("synthetic storage unavailable");
    const value = this.data.get(key); if (!value) throw new Error("missing object"); return value;
  }
  async putManifest(key: string, bytes: Uint8Array) { this.data.set(key, bytes); }
}

const pg = new PGlite();
const database: SqlDatabase = {
  query: (text, params) => pg.query(text, params),
  transaction: (work) => pg.transaction((sql) => work({ query: (text, params) => sql.query(text, params) })),
};
const store = new CloudStore(database);
const objects = new MemoryObjects();
const service = new BackupService(store, objects);
const local = new LifeDatabase(`test-server-backup-${crypto.randomUUID()}`);
const config: CloudConfig = { databaseUrl: "unused", authUrl: "https://auth.invalid", authKey: "synthetic", origin: "https://life.example", bucket: "synthetic", region: "us-east-1", accessKeyId: "synthetic", secretAccessKey: "synthetic", accountQuotaBytes: 10_000_000, objectEnv: "dev" };
const auth = {
  start: vi.fn(async () => {}),
  verify: vi.fn(async (email: string, token: string) => { if (token !== "123456") throw new Error("synthetic provider error containing private tokens"); return { subject: email, email, accessToken: "synthetic-access-token-".padEnd(128, "x"), refreshToken: "synthetic-refresh-token-".padEnd(64, "y"), expiresAt: 2_000_000_000 }; }),
  verifyAccessToken: vi.fn(async (accessToken: string) => { if (accessToken !== "synthetic-access-token-".padEnd(128, "x")) throw new Error("synthetic provider error"); return { subject: "access-subject", email: "access@example.test" }; }),
  refresh: vi.fn(async (refreshToken: string) => { if (!refreshToken.startsWith("synthetic-refresh-token-")) throw new Error("synthetic provider error"); return { subject: "access-subject", email: "access@example.test", accessToken: "synthetic-access-token-".padEnd(128, "x"), refreshToken, expiresAt: 2_000_000_000 }; }),
  loginPassword: vi.fn(async (username: string, password: string) => { if (password !== "password1") throw new BackupError("otp_invalid", "账号或密码不正确。"); return { subject: username, email: username }; }),
};
const handler = createCloudHandler({ config, store, service, auth });
let archive: BackupArchive;
let accountA: { id: string; email: string };
let accountB: { id: string; email: string };
let cookieA: string;
let cookieB: string;
const libraryId = crypto.randomUUID();
const restored: LifeDatabase[] = [];

async function request(path: string, body?: unknown, cookie?: string, account?: string, origin = config.origin) {
  return handler(new Request(`${config.origin}/api/cloud/${path}`, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...(account ? { "X-Life-Account": account } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }));
}
async function login(email: string) {
  const response = await request("auth/email/verify", { email, token: "123456" });
  expect(response.status).toBe(200);
  return { account: (await response.json()).account, cookie: response.headers.get("set-cookie")!.split(";")[0] };
}
async function upload(id: string) {
  await store.createBackup(accountA.id, id, archive.manifest, config.accountQuotaBytes);
  for (const part of await store.parts(accountA.id, id)) {
    const bytes = new Uint8Array(await archive.files.get(part.path)!.slice(part.part_index * PART_BYTES, (part.part_index + 1) * PART_BYTES).arrayBuffer());
    objects.data.set(part.object_key, bytes);
    await service.acknowledge(accountA.id, id, part.path, part.part_index);
  }
}

beforeAll(async () => {
  await pg.exec(await readFile("infrastructure/cloud/001-foundation.sql", "utf8"));
  await pg.exec(await readFile("infrastructure/cloud/002-roles.sql", "utf8"));
  await pg.exec(await readFile("infrastructure/cloud/003-immutable-snapshots.sql", "utf8"));
  // Exercise the actual schema under the non-owner web role, including RLS.
  await pg.exec("SET ROLE life_cloud_app");
  ({ account: accountA, cookie: cookieA } = await login("a@example.test"));
  ({ account: accountB, cookie: cookieB } = await login("b@example.test"));
  await store.bind(accountA.id, libraryId, crypto.randomUUID());
  await seedBackupFixture(local); archive = await captureArchive(local, libraryId);
}, 30_000);
afterAll(async () => { await pg.close(); await local.delete(); for (const item of restored) await item.delete(); });

describe("PostgreSQL foundation + HTTP boundaries", () => {
  it("rejects owner credentials for the public API and accepts the restricted runtime role", async () => {
    await expect(assertApplicationRole(database)).resolves.toBeUndefined();
    await pg.exec("RESET ROLE");
    try { await expect(assertApplicationRole(database)).rejects.toMatchObject({ code: "unsafe_database_role" }); }
    finally { await pg.exec("SET ROLE life_cloud_app"); }
  });
  it("issues opaque HttpOnly Secure sessions and rejects unauthenticated/cross-origin requests", async () => {
    const logged = await request("auth/email/verify", { email: "third@example.test", token: "123456" });
    expect(logged.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Lax");
    expect(logged.headers.get("set-cookie")).toContain("Secure");
    expect((await logged.json())).not.toHaveProperty("token");
    expect((await request("backups")).status).toBe(401);
    expect((await request("libraries/bind", { libraryId, installationId: crypto.randomUUID() }, cookieA, accountA.id, "https://attacker.invalid")).status).toBe(403);
    expect((await request("backups", undefined, cookieA, accountB.id)).status).toBe(403);
  });
  it("logs in with username and password without sending email", async () => {
    const response = await request("auth/password", { username: "kele", password: "password1" });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Lax");
    expect((await response.json()).account.email).toBe("kele");
    expect(auth.loginPassword).toHaveBeenCalledWith("kele", "password1");
    expect((await request("auth/password", { username: "kele", password: "wrong-password" })).status).toBe(400);
  });
  it("exchanges a provider magic-link token for the same opaque Life session", async () => {
    const response = await request("auth/email/callback", { email: "access@example.test", accessToken: "synthetic-access-token-".padEnd(128, "x") });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Lax");
    expect((await response.json()).account.email).toBe("access@example.test");
    expect(auth.verifyAccessToken).toHaveBeenCalledWith("synthetic-access-token-".padEnd(128, "x"));
  });

  it("preserves one immutable snapshot, resumes duplicate operations and performs an isolated cloud restore drill", async () => {
    const id = crypto.randomUUID(); await upload(id);
    await store.createBackup(accountA.id, id, archive.manifest, config.accountQuotaBytes);
    await store.finalize(accountA.id, id); await store.finalize(accountA.id, id);
    await service.verifySlice(accountA.id, id, 20_000);
    const backup = await store.get(accountA.id, id); expect(backup.status).toBe("complete");
    expect((await store.list(accountA.id)).filter((row) => row.id === id)).toHaveLength(1);
    const files = new Map<string, Blob>();
    for (const file of archive.manifest.files) {
      const chunks = [];
      for (const part of (await store.parts(accountA.id, id)).filter((part) => part.path === file.path)) chunks.push(new Uint8Array(await objects.read(part.object_key)));
      files.set(file.path, new Blob(chunks));
    }
    const result = await restoreArchive({ manifest: manifestOf(backup), files });
    const copy = new LifeDatabase(result.databaseName); restored.push(copy);
    expect(await copy.diaries.toArray()).toEqual(await local.diaries.toArray());
    expect(await copy.lifeEvents.toArray()).toEqual(await local.lifeEvents.toArray());
    expect(await copy.lifeEventProposals.toArray()).toEqual(await local.lifeEventProposals.toArray());
    expect((await copy.attachments.get("image-one"))!.blob.size).toBe(5);
    await expect(store.createBackup(accountA.id, id, { ...archive.manifest, exporterVersion: "changed" }, config.accountQuotaBytes)).rejects.toMatchObject({ code: "idempotency_mismatch" });
  });

  it("enforces account ownership in APIs and RLS even when a caller knows another backup ID", async () => {
    const id = crypto.randomUUID(); await upload(id);
    expect((await request(`backups/${id}`, undefined, cookieB, accountB.id)).status).toBe(404);
    expect((await request(`backups/${id}/uploads`, { path: archive.manifest.files[0].path, index: 0 }, cookieB, accountB.id)).status).toBe(404);
    expect(await store.tenant(accountB.id, async (sql) => (await sql.query("SELECT id FROM life_cloud.backups WHERE id=$1", [id])).rows)).toEqual([]);
    expect(await store.sql.query("SELECT id FROM life_cloud.backups").then(({ rows }) => rows)).toEqual([]);
    await expect(store.bind(accountB.id, libraryId, crypto.randomUUID())).rejects.toMatchObject({ code: "binding_mismatch" });
  });

  it("never completes missing/corrupted uploads and preserves the existing complete backup", async () => {
    const id = crypto.randomUUID(); await store.createBackup(accountA.id, id, archive.manifest, config.accountQuotaBytes);
    await expect(store.finalize(accountA.id, id)).rejects.toMatchObject({ code: "incomplete_upload" });
    const part = (await store.parts(accountA.id, id))[0];
    objects.data.set(part.object_key, new Uint8Array([99]));
    await expect(service.acknowledge(accountA.id, id, part.path, part.part_index)).rejects.toMatchObject({ code: "part_checksum" });
    expect((await store.get(accountA.id, id)).status).toBe("uploading");
    expect((await store.list(accountA.id)).some((row) => row.status === "complete")).toBe(true);
  });

  it("records failure without object/provider body logs and resumes verification on explicit retry", async () => {
    const id = crypto.randomUUID(); await upload(id); await store.finalize(accountA.id, id);
    const log = vi.spyOn(console, "log"); const errorLog = vi.spyOn(console, "error");
    objects.fail = true;
    await expect(service.verifySlice(accountA.id, id)).rejects.toMatchObject({ code: "verification_failed" });
    expect((await store.get(accountA.id, id)).error_code).toBe("verification_unavailable");
    objects.fail = false; await store.finalize(accountA.id, id); await service.verifySlice(accountA.id, id);
    expect((await store.get(accountA.id, id)).status).toBe("complete");
    expect(log).not.toHaveBeenCalled(); expect(errorLog).not.toHaveBeenCalled(); log.mockRestore(); errorLog.mockRestore();
  });

  it("rejects quota overflow without deleting previous snapshots", async () => {
    await expect(store.createBackup(accountA.id, crypto.randomUUID(), archive.manifest, 1)).rejects.toMatchObject({ code: "cloud_quota" });
    expect((await store.list(accountA.id)).some((row) => row.status === "complete")).toBe(true);
  });

  it("allocates unique immutable object keys for separate snapshots", async () => {
    const first = crypto.randomUUID(); const second = crypto.randomUUID();
    await upload(first); await upload(second);
    const firstKeys = (await store.parts(accountA.id, first)).map((part) => part.object_key);
    const secondKeys = (await store.parts(accountA.id, second)).map((part) => part.object_key);
    expect(new Set([...firstKeys, ...secondKeys]).size).toBe(firstKeys.length + secondKeys.length);
    await store.finalize(accountA.id, first); await service.verifySlice(accountA.id, first);
    expect((await service.download(accountA.id, first, (await store.parts(accountA.id, first))[0].path, 0)).url).toContain(firstKeys[0]);
  });

  it("stores only a digest of Session tokens and revocation takes effect", async () => {
    const logged = await login("logout@example.test");
    const token = logged.cookie.split("=")[1];
    expect(await store.session(digest(token))).toEqual(logged.account);
    const result = await request("auth/logout", {}, logged.cookie, logged.account.id);
    expect(result.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await store.session(digest(token))).toBeNull();
  });

  it("keeps the exact canonical manifest bytes independently from the SQL directory", async () => {
    const id = crypto.randomUUID(); await upload(id);
    const row = await store.get(accountA.id, id);
    expect(Buffer.from(row.manifest_bytes).toString("utf8")).toBe(encodeJson(archive.manifest));
    expect(row.manifest_sha256).toBe(digest(encodeJson(archive.manifest)));
  });

  it("prevents SQL updates to completed snapshots even inside the correct account context", async () => {
    const id = crypto.randomUUID(); await upload(id); await store.finalize(accountA.id, id); await service.verifySlice(accountA.id, id);
    await expect(store.tenant(accountA.id, (sql) => sql.query("UPDATE life_cloud.backups SET status='failed' WHERE id=$1", [id]))).rejects.toThrow("immutable_backup");
    expect((await store.get(accountA.id, id)).status).toBe("complete");
  });
});
