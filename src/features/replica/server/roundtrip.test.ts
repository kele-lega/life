// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { cloudAuth, TEST_AUTH_PROVIDER } from "@/features/cloud-backup/server/auth";
import type { CloudConfig } from "@/features/cloud-backup/server/config";
import { createCloudHandler } from "@/features/cloud-backup/server/handler";
import type { ObjectStorage } from "@/features/cloud-backup/server/objects";
import { hashTestPassword } from "@/features/cloud-backup/server/password";
import { BackupService } from "@/features/cloud-backup/server/service";
import type { SqlDatabase } from "@/features/cloud-backup/server/sql";
import { CloudStore, digest } from "@/features/cloud-backup/server/store";
import { mutationDigestInput, REPLICA_ENTITIES, type ReplicaOp } from "../shared/protocol";
import { createReplicaHandler } from "./handler";
import { ReplicaService } from "./service";
import { ReplicaStore } from "./store";

const pg = new PGlite();
const database: SqlDatabase = {
  query: (text, params) => pg.query(text, params),
  transaction: (work) => pg.transaction((sql) => work({ query: (text, params) => sql.query(text, params) })),
};
const objects: ObjectStorage & { data: Map<string, Uint8Array> } = {
  data: new Map(),
  async uploadUrl(key) { return { url: `https://objects.invalid/${key}`, headers: {} }; },
  async downloadUrl(key) { return `https://objects.invalid/${key}`; },
  async read(key) { const value = this.data.get(key); if (!value) throw new Error("missing"); return value; },
  async putManifest(key, bytes) { this.data.set(key, bytes); },
};
const config: CloudConfig = {
  databaseUrl: "unused", authUrl: "", authKey: "", authMode: "test-password", origin: "https://life.example",
  bucket: "synthetic", region: "synthetic", accessKeyId: "synthetic", secretAccessKey: "synthetic", accountQuotaBytes: 10_000_000, objectEnv: "dev",
};
const accounts = new CloudStore(database);
const store = new ReplicaStore(database);
const service = new ReplicaService(store, objects, config);
const passwords = { kele: `synthetic-${randomUUID()}`, wzj: `synthetic-${randomUUID()}` };
let handler: ReturnType<typeof createReplicaHandler>;
let cloud: ReturnType<typeof createCloudHandler>;
let kele: { account: { id: string; email: string; username: string }; accessToken: string; expiresAt: number };
let wzj: typeof kele;
const writerA = randomUUID();
const writerB = randomUUID();
const createdAt = "2026-09-17T01:02:03.004Z";
const attachmentId = "../same/../attachment";
const bytesA = new Uint8Array([0, 1, 255, 128]);
const bytesB = new Uint8Array([7, 6, 5]);
let objectA: string;
let objectB: string;

function request(path: string, body?: unknown, token?: string, headers: HeadersInit = {}, origin: string | null = "https://localhost") {
  return handler(new Request(`${config.origin}/api/replica/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(origin ? { Origin: origin } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}
function cloudRequest(path: string, body?: unknown, cookie?: string, account?: string, origin = config.origin) {
  return cloud(new Request(`${config.origin}/api/cloud/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...(account ? { "X-Life-Account": account } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}
function ops(label: string, bytes: Uint8Array): ReplicaOp[] {
  const lifecycle = { createdAt, updatedAt: createdAt, deletedAt: createdAt };
  return REPLICA_ENTITIES.map((entity) => ({
    entity, op: "upsert", id: entity === "attachment" ? attachmentId : "same-id",
    record: {
      id: entity === "attachment" ? attachmentId : "same-id", ...lifecycle,
      ...(entity === "moment" ? { originalText: `原文\r\n${label} é `, isFavorite: true, location: null } : {}),
      ...(entity === "momentAppend" ? { momentId: "same-id", text: `追加 ${label}` } : {}),
      ...(entity === "diary" ? { title: "", body: `日记 ${label}`, isFavorite: false, location: null } : {}),
      ...(entity === "lifeEvent" ? { name: label, category: "learning", origin: "manual", source: null, metadata: {} } : {}),
      ...(entity === "lifeExtractionJob" ? { input: { kind: "scratch", text: label }, requestKey: "same-key", status: "succeeded" } : {}),
      ...(entity === "lifeEventProposal" ? { jobId: "same-id", candidateKey: "same-key", status: "rejected", candidate: { name: label } } : {}),
      ...(entity === "attachment" ? { ownerType: "moment", ownerId: "same-id", kind: "image", fileName: "原样.png", mimeType: "image/png", blobType: "image/jpeg", size: 999, width: null, height: 0, sha256: digest(bytes), byteLength: bytes.length } : {}),
    },
  }));
}
function mutation(operations: ReplicaOp[], writerId = writerA, epoch = 1) {
  const payload = { mutationId: randomUUID(), createdAt, ops: operations };
  return { ...payload, writerId, epoch, payloadSha256: digest(mutationDigestInput(payload)) };
}
async function upload(token: string, bytes: Uint8Array, id = attachmentId) {
  const response = await request("attachments/uploads", { attachmentId: id, sha256: digest(bytes), byteLength: bytes.length }, token);
  expect(response.status).toBe(200);
  const result = await response.json();
  objects.data.set(result.objectKey, bytes);
  const finalized = await request("attachments/finalize", { objectKey: result.objectKey, sha256: digest(bytes), byteLength: bytes.length }, token);
  expect(finalized.status).toBe(200);
  return result.objectKey as string;
}

beforeAll(async () => {
  for (const migration of ["001-foundation.sql", "002-roles.sql", "003-immutable-snapshots.sql", "004-replica.sql"]) await pg.exec(await readFile(`infrastructure/cloud/${migration}`, "utf8"));
  await pg.exec("SET ROLE life_cloud_app");
  config.testPasswordHashes = { kele: await hashTestPassword(passwords.kele), wzj: await hashTestPassword(passwords.wzj) };
  handler = createReplicaHandler({ config, accounts, store, service, auth: cloudAuth(config) });
  cloud = createCloudHandler({ config, store: accounts, service: new BackupService(accounts, objects), auth: cloudAuth(config) });
  kele = await (await request("auth/password/login", { username: "kele", password: passwords.kele })).json();
  wzj = await (await request("auth/password/login", { username: "wzj", password: passwords.wzj }, undefined, {}, null)).json();
}, 30_000);
afterAll(async () => { await pg.close(); });

describe("Life account + cloud roundtrip server", () => {
  it("discovers auth mode anonymously and issues only hashed revocable native sessions", async () => {
    expect(await (await request("account")).json()).toEqual({ configured: true, authMode: "test-password", account: null });
    expect(kele.account).toEqual({ id: expect.any(String), email: "", username: "kele" });
    expect(wzj.account.username).toBe("wzj");
    expect(wzj.account.id).not.toBe(kele.account.id);
    expect(kele.accessToken).toMatch(/^[a-f0-9]{64}$/);
    expect(kele.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(await accounts.session(digest(kele.accessToken), TEST_AUTH_PROVIDER)).toEqual(kele.account);
    expect(await accounts.session(kele.accessToken, TEST_AUTH_PROVIDER)).toBeNull();
    const stored = await pg.query<{ token_hash: string }>("SELECT token_hash FROM life_cloud.sessions");
    expect(stored.rows.map((row) => row.token_hash)).not.toContain(kele.accessToken);
    expect(await (await request("status", undefined, kele.accessToken)).json()).toEqual({
      counts: Object.fromEntries(REPLICA_ENTITIES.map((entity) => [entity, 0])), commitSeq: 0, lastSyncedAt: null, writerId: null, epoch: 0, blobCount: 0, blobBytes: 0,
    });
  });

  it("returns generic 401 for wrong passwords and unknown usernames and never logs credentials", async () => {
    const log = vi.spyOn(console, "log"); const error = vi.spyOn(console, "error");
    try {
      const wrong = await request("auth/password/login", { username: "kele", password: "wrong" });
      const unknown = await request("auth/password/login", { username: "other", password: passwords.kele });
      expect(wrong.status).toBe(401); expect(unknown.status).toBe(401);
      expect(await wrong.json()).toEqual(await unknown.json());
      const spoof = await request("mutations", { accountId: kele.account.id, ...mutation(ops("spoof", bytesA)) }, "f".repeat(64), { "X-Life-Account": kele.account.id });
      expect(spoof.status).toBe(401);
      expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    } finally { log.mockRestore(); error.mockRestore(); }
  });

  it("preserves cookie-only web auth and backup access, rejects localhost/cross-site cookie requests", async () => {
    const logged = await request("auth/password/login", { username: "kele", password: passwords.kele }, undefined, {}, config.origin);
    const cookie = logged.headers.get("set-cookie")!;
    expect(cookie).toContain("Path=/; HttpOnly; SameSite=Lax;");
    expect(cookie).toContain("Secure");
    expect(await logged.json()).toEqual({ account: kele.account, authMode: "test-password" });
    const tokenCookie = cookie.split(";")[0];
    expect(await (await cloudRequest("account", undefined, tokenCookie)).json()).toEqual({ configured: true, authMode: "test-password", account: kele.account });
    const libraryId = randomUUID();
    expect((await cloudRequest("libraries/bind", { libraryId, installationId: randomUUID() }, tokenCookie, kele.account.id)).status).toBe(200);
    expect((await cloudRequest("backups", undefined, tokenCookie, kele.account.id)).status).toBe(200);
    expect((await request("account", undefined, undefined, { Cookie: tokenCookie })).status).toBe(403);
    expect((await request("auth/password/login", { username: "kele", password: passwords.kele }, undefined, { Cookie: tokenCookie })).status).toBe(403);
    expect((await request("auth/password/login", { username: "kele", password: passwords.kele }, undefined, { Cookie: tokenCookie }, null)).status).toBe(403);
    expect((await request("writers/register", { writerId: writerA }, undefined, { Cookie: tokenCookie, "X-Life-Account": kele.account.id })).status).toBe(403);
    expect((await request("auth/password/login", { username: "kele", password: passwords.kele }, undefined, { "Sec-Fetch-Site": "cross-site" }, config.origin)).status).toBe(403);
    expect((await cloudRequest("libraries/bind", { libraryId, installationId: randomUUID() }, tokenCookie, kele.account.id, "https://localhost")).status).toBe(403);
    expect((await request("auth/logout", {}, undefined, { Cookie: tokenCookie }, config.origin)).status).toBe(200);
    expect((await cloudRequest("backups", undefined, tokenCookie, kele.account.id)).status).toBe(401);
  });

  it("disables provider login/refresh on both boundaries and rejects old provider sessions", async () => {
    for (const path of ["auth/email/start", "auth/email/verify", "auth/email/callback", "auth/refresh"]) {
      const result = await request(path, { email: "other@example.test", token: "123456", accessToken: "x".repeat(128), refreshToken: "x".repeat(64) });
      expect(result.status).toBe(400); expect((await result.json()).code).toBe("auth_mode_disabled");
      expect((await (await cloudRequest(path, {})).json()).code).toBe("auth_mode_disabled");
    }
    const old = "a".repeat(64);
    await accounts.createSession("other", "other@example.test", digest(old));
    expect((await request("snapshot", undefined, old)).status).toBe(401);
    expect((await (await cloudRequest("account", undefined, `__Host-life_session=${old}`)).json()).account).toBeNull();
  });

  it("isolates identical seven-entity IDs and image IDs by verified account, preserving raw/tombstone data", async () => {
    expect((await request("writers/register", { writerId: writerA, accountId: wzj.account.id }, kele.accessToken)).status).toBe(200);
    expect((await request("writers/register", { writerId: writerB }, wzj.accessToken)).status).toBe(200);
    objectA = await upload(kele.accessToken, bytesA);
    objectB = await upload(wzj.accessToken, bytesB);
    expect(objectA).toContain(`/replica/${kele.account.id}/${digest(attachmentId)}/`);
    expect(objectA).not.toContain("..");
    expect(objectB).toContain(`/replica/${wzj.account.id}/`);
    expect((await request("mutations", { ...mutation(ops("kele", bytesA)), accountId: wzj.account.id }, kele.accessToken)).status).toBe(200);
    expect((await request("mutations", mutation(ops("wzj", bytesB), writerB), wzj.accessToken)).status).toBe(200);
    const snapshotA = await (await request("snapshot", undefined, kele.accessToken)).json();
    const snapshotB = await (await request("snapshot", undefined, wzj.accessToken)).json();
    for (const operation of ops("kele", bytesA)) expect(snapshotA.records[operation.entity]).toEqual([operation.record]);
    for (const operation of ops("wzj", bytesB)) expect(snapshotB.records[operation.entity]).toEqual([operation.record]);
    expect(snapshotA.commitSeq).toBe(1); expect(snapshotB.commitSeq).toBe(1);
    expect(snapshotA.objects).toEqual([{ attachmentId, sha256: digest(bytesA), byteLength: bytesA.length, objectKey: objectA }]);
    expect(snapshotB.objects[0].objectKey).toBe(objectB);
    expect(await store.tenant(wzj.account.id, async (sql) => (await sql.query("SELECT record FROM life_cloud.replica_moments WHERE account_id=$1", [kele.account.id])).rows)).toEqual([]);
    expect((await pg.query("SELECT record FROM life_cloud.replica_moments")).rows).toEqual([]);
  });

  it("denies forged ownership, cross-account finalize/download and unverified attachment linkage", async () => {
    expect((await request("snapshot", undefined, wzj.accessToken, { "X-Life-Account": kele.account.id })).status).toBe(403);
    const crossFinalize = await request("attachments/finalize", { accountId: kele.account.id, objectKey: objectA, sha256: digest(bytesA), byteLength: bytesA.length }, wzj.accessToken);
    expect(crossFinalize.status).not.toBe(200);
    const crossDownload = await request("attachments/downloads", { accountId: kele.account.id, attachmentId, sha256: digest(bytesA) }, wzj.accessToken);
    expect(crossDownload.status).toBe(404);
    const crossMutation = await request("mutations", mutation([ops("kele", bytesA).find((op) => op.entity === "attachment")!], writerB), wzj.accessToken);
    expect(crossMutation.status).toBe(409); expect((await crossMutation.json()).code).toBe("blob_pending");
    const ownDownload = await request("attachments/downloads", { attachmentId, sha256: digest(bytesA) }, kele.accessToken);
    expect((await ownDownload.json()).url).toBe(`https://objects.invalid/${objectA}`);
    const attempt = await request("attachments/uploads", { attachmentId, sha256: digest(bytesA), byteLength: 999 }, kele.accessToken);
    expect((await attempt.json()).code).toBe("part_checksum");
  });

  it("checks submitted mutation digests and immutable retries without advancing the head on rejection", async () => {
    const payload = mutation([{ ...ops("kele", bytesA)[0], record: { ...ops("kele", bytesA)[0].record, isFavorite: false } }]);
    const wrong = await request("mutations", { ...payload, payloadSha256: "0".repeat(64) }, kele.accessToken);
    expect(wrong.status).toBe(400); expect((await wrong.json()).code).toBe("payload_checksum");
    const applied = await request("mutations", payload, kele.accessToken);
    expect(applied.status).toBe(200);
    const receipt = await applied.json();
    expect(await (await request("mutations", payload, kele.accessToken)).json()).toEqual(receipt);
    const changed = { ...payload, createdAt: "2026-09-17T02:00:00.000Z" };
    changed.payloadSha256 = digest(mutationDigestInput(changed));
    const conflicting = await request("mutations", changed, kele.accessToken);
    expect(conflicting.status).toBe(409); expect((await conflicting.json()).code).toBe("mutation_conflict");
    const malformedBlob = ops("kele", bytesA).find((op) => op.entity === "attachment")!;
    malformedBlob.record.byteLength = 100;
    expect((await (await request("mutations", mutation([malformedBlob]), kele.accessToken)).json()).code).toBe("part_checksum");
    expect((await (await request("status", undefined, kele.accessToken)).json()).commitSeq).toBe(receipt.commitSeq);
    await expect(store.tenant(kele.account.id, (sql) => sql.query("UPDATE life_cloud.replica_mutations SET payload_sha256=$2 WHERE account_id=$1", [kele.account.id, "f".repeat(64)]))).rejects.toThrow();
  });

  it("returns metadata-only status and excludes uncommitted orphan uploads from snapshot and blob totals", async () => {
    await upload(kele.accessToken, new Uint8Array([4, 3]), "orphan");
    await upload(kele.accessToken, new Uint8Array([9, 8]), attachmentId);
    const status = await (await request("status", undefined, kele.accessToken)).json();
    expect(status).toEqual({ counts: Object.fromEntries(REPLICA_ENTITIES.map((entity) => [entity, 1])), commitSeq: 2, lastSyncedAt: expect.any(String), writerId: writerA, epoch: 1, blobCount: 1, blobBytes: bytesA.length });
    expect(JSON.stringify(status)).not.toContain("原文");
    const snapshot = await (await request("snapshot", undefined, kele.accessToken)).json();
    expect(snapshot.objects).toHaveLength(1); expect(snapshot.objects[0].objectKey).toBe(objectA);
  });

  it("atomically refuses a stale restore promotion and fences only after matching the head", async () => {
    const previous = await (await request("snapshot", undefined, kele.accessToken)).json();
    const payload = mutation([{ entity: "diary", op: "upsert", id: "new-diary", record: { id: "new-diary", createdAt, updatedAt: createdAt, deletedAt: null, title: "", body: "new head" } }]);
    expect((await request("mutations", payload, kele.accessToken)).status).toBe(200);
    const nextWriter = randomUUID();
    const stale = await request("writers/promote", { writerId: nextWriter, expectedCommitSeq: previous.commitSeq }, kele.accessToken);
    expect(stale.status).toBe(409); expect((await stale.json()).code).toBe("snapshot_stale");
    const retained = await (await request("status", undefined, kele.accessToken)).json();
    expect(retained.writerId).toBe(writerA); expect(retained.epoch).toBe(1);
    const promoted = await request("writers/promote", { writerId: nextWriter, expectedCommitSeq: retained.commitSeq }, kele.accessToken);
    expect(promoted.status).toBe(200); expect((await promoted.json()).epoch).toBe(2);
    expect((await (await request("mutations", payload, kele.accessToken)).json()).code).toBe("fenced");
    const after = await (await request("status", undefined, kele.accessToken)).json();
    expect(after.commitSeq).toBe(retained.commitSeq); expect(after.lastSyncedAt).toBe(retained.lastSyncedAt);
  });

  it("retains account identity across process recreation/password rotation, revokes logout and rejects replay/expiry", async () => {
    const freshAccounts = new CloudStore(database);
    const rotated = `synthetic-${randomUUID()}`;
    const rotatedConfig = { ...config, testPasswordHashes: { ...config.testPasswordHashes!, kele: await hashTestPassword(rotated) } };
    const rotatedHandler = createReplicaHandler({ config: rotatedConfig, accounts: freshAccounts, store: new ReplicaStore(database), service, auth: cloudAuth(rotatedConfig) });
    const login = async (password: string) => rotatedHandler(new Request(`${config.origin}/api/replica/auth/password/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "kele", password }) }));
    expect((await login(passwords.kele)).status).toBe(401);
    const newSession = await login(rotated);
    expect(newSession.headers.has("set-cookie")).toBe(false);
    const identity = await newSession.json();
    expect(identity.account).toEqual(kele.account);
    expect((await request("auth/logout", {}, identity.accessToken)).status).toBe(200);
    expect((await request("account", undefined, identity.accessToken)).status).toBe(401);
    expect((await request("snapshot", undefined, identity.accessToken)).status).toBe(401);
    const expired = "e".repeat(64);
    await accounts.createSession("kele", "", digest(expired), TEST_AUTH_PROVIDER, new Date(0));
    expect((await request("status", undefined, expired)).status).toBe(401);
    expect((await request("account", undefined, wzj.accessToken)).status).toBe(200);
  });

  it("uses the persisted distributed login limit across handler instances", async () => {
    for (let attempt = 0; attempt < 10; attempt++) await request("auth/password/login", { username: "rate-limited-unknown", password: "synthetic" });
    const restarted = createReplicaHandler({ config, accounts: new CloudStore(database), store, service, auth: cloudAuth(config) });
    const result = await restarted(new Request(`${config.origin}/api/replica/auth/password/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "rate-limited-unknown", password: "synthetic" }),
    }));
    expect(result.status).toBe(429); expect((await result.json()).code).toBe("rate_limit");
  });
});
