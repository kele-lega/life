// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createHash } from "node:crypto";
import { CloudStore, digest } from "@/features/cloud-backup/server/store";
import { createCloudHandler } from "@/features/cloud-backup/server/handler";
import type { CloudConfig } from "@/features/cloud-backup/server/config";
import type { ObjectStorage } from "@/features/cloud-backup/server/objects";
import type { SqlDatabase } from "@/features/cloud-backup/server/sql";
import { ReplicaStore } from "./store";
import { ReplicaService } from "./service";
import { createReplicaHandler } from "./handler";
import { mutationDigestInput, replicaRecord } from "../shared/protocol";

class MemoryObjects implements ObjectStorage {
  readonly data = new Map<string, Uint8Array>();
  async uploadUrl(key: string) { return { url: `https://objects.invalid/${key}`, headers: { "Content-Type": "application/octet-stream" } }; }
  async downloadUrl(key: string) { return `https://objects.invalid/${key}`; }
  async read(key: string) {
    const value = this.data.get(key);
    if (!value) throw new Error("missing object");
    return value;
  }
  async putManifest(key: string, bytes: Uint8Array) { this.data.set(key, bytes); }
}

const pg = new PGlite();
const database: SqlDatabase = {
  query: (text, params) => pg.query(text, params),
  transaction: (work) => pg.transaction((sql) => work({ query: (text, params) => sql.query(text, params) })),
};
const accounts = new CloudStore(database);
const store = new ReplicaStore(database);
const objects = new MemoryObjects();
const config: CloudConfig = {
  databaseUrl: "unused", authUrl: "https://auth.invalid", authKey: "synthetic", origin: "https://life.example",
  bucket: "synthetic", region: "us-east-1", accessKeyId: "synthetic", secretAccessKey: "synthetic",
  accountQuotaBytes: 10_000_000, objectEnv: "dev",
};
const service = new ReplicaService(store, objects, config);
const accessToken = "synthetic-access-token-".padEnd(128, "x");
const auth = {
  start: vi.fn(async () => {}),
  verify: vi.fn(async (email: string, token: string) => {
    if (token !== "123456") throw new Error("synthetic provider error containing private tokens");
    return { subject: email, email, accessToken, refreshToken: "synthetic-refresh-token-".padEnd(64, "y"), expiresAt: 2_000_000_000 };
  }),
  verifyAccessToken: vi.fn(async (token: string) => {
    if (token !== accessToken) throw new Error("synthetic provider error");
    return { subject: "native@example.test", email: "native@example.test" };
  }),
  refresh: vi.fn(async () => ({ subject: "native@example.test", email: "native@example.test", accessToken, refreshToken: "synthetic-refresh-token-".padEnd(64, "y") })),
};
const handler = createReplicaHandler({ config, accounts, store, service, auth });
const cloudHandler = createCloudHandler({ config, store: accounts, service: { upload() { throw new Error("unused"); } } as never, auth });

let cookie: string;
let accountId: string;
const writerId = "11111111-1111-4111-8111-111111111111";
const otherWriter = "22222222-2222-4222-8222-222222222222";

async function replica(path: string, body?: unknown, extra: HeadersInit = {}) {
  return handler(new Request(`${config.origin}/api/replica/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: config.origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}

function sha(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

beforeAll(async () => {
  await pg.exec(await readFile("infrastructure/cloud/001-foundation.sql", "utf8"));
  await pg.exec(await readFile("infrastructure/cloud/002-roles.sql", "utf8"));
  await pg.exec(await readFile("infrastructure/cloud/003-immutable-snapshots.sql", "utf8"));
  await pg.exec(await readFile("infrastructure/cloud/004-replica.sql", "utf8"));
  await pg.exec("SET ROLE life_cloud_app");
  const logged = await replica("auth/email/verify", { email: "web@example.test", token: "123456" });
  expect(logged.status).toBe(200);
  const created = await logged.json();
  accountId = created.account.id;
  const session = await accounts.createSession("web@example.test", "web@example.test", digest("a".repeat(64)));
  accountId = session.id;
  cookie = `${config.origin.startsWith("https:") ? "__Host-life_session" : "life_session_local"}=${"a".repeat(64)}`;
}, 30_000);

describe("Phase 16B.1 replica API", () => {
  it("registers a writer and applies an idempotent moment mutation over cookie auth", async () => {
    const registered = await replica("writers/register", { writerId }, { Cookie: cookie, "X-Life-Account": accountId });
    expect(registered.status).toBe(200);
    const moment = replicaRecord({
      id: "moment-1", originalText: "hello", isFavorite: false, location: null,
      createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z", deletedAt: null,
    });
    const payload = { mutationId: "33333333-3333-4333-8333-333333333333", createdAt: "2026-09-15T00:00:00.000Z", ops: [{ entity: "moment" as const, op: "upsert" as const, id: "moment-1", record: moment }] };
    const body = { ...payload, writerId, epoch: 1, payloadSha256: digest(mutationDigestInput(payload)) };
    const first = await replica("mutations", body, { Cookie: cookie, "X-Life-Account": accountId });
    expect(first.status).toBe(200);
    const second = await replica("mutations", body, { Cookie: cookie, "X-Life-Account": accountId });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
  });

  it("rejects a reused mutationId with a different payload", async () => {
    const moment = replicaRecord({
      id: "moment-1", originalText: "changed", isFavorite: false, location: null,
      createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:01.000Z", deletedAt: null,
    });
    const payload = { mutationId: "33333333-3333-4333-8333-333333333333", createdAt: "2026-09-15T00:00:00.000Z", ops: [{ entity: "moment" as const, op: "upsert" as const, id: "moment-1", record: moment }] };
    const response = await replica("mutations", { ...payload, writerId, epoch: 1, payloadSha256: digest(mutationDigestInput(payload)) }, { Cookie: cookie, "X-Life-Account": accountId });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("mutation_conflict");
  });

  it("rejects originalText mutation and keeps the stored original", async () => {
    const moment = replicaRecord({
      id: "moment-1", originalText: "tampered", isFavorite: false, location: null,
      createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:02.000Z", deletedAt: null,
    });
    const payload = { mutationId: "44444444-4444-4444-8444-444444444444", createdAt: "2026-09-15T00:00:02.000Z", ops: [{ entity: "moment" as const, op: "upsert" as const, id: "moment-1", record: moment }] };
    const response = await replica("mutations", { ...payload, writerId, epoch: 1, payloadSha256: digest(mutationDigestInput(payload)) }, { Cookie: cookie, "X-Life-Account": accountId });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("original_text_immutable");
  });

  it("requires a verified blob before attachment metadata can replicate", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const sha256 = sha(bytes);
    const attachment = replicaRecord({
      id: "img-1", ownerType: "moment", ownerId: "moment-1", kind: "image", fileName: "a.png", mimeType: "image/png",
      size: 3, width: null, height: null, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z", deletedAt: null,
      sha256, byteLength: 3,
    });
    const pendingPayload = { mutationId: "55555555-5555-4555-8555-555555555555", createdAt: "2026-09-15T00:00:03.000Z", ops: [{ entity: "attachment" as const, op: "upsert" as const, id: "img-1", record: attachment }] };
    const pending = await replica("mutations", { ...pendingPayload, writerId, epoch: 1, payloadSha256: digest(mutationDigestInput(pendingPayload)) }, { Cookie: cookie, "X-Life-Account": accountId });
    expect(pending.status).toBe(409);
    expect((await pending.json()).code).toBe("blob_pending");

    const upload = await replica("attachments/uploads", { attachmentId: "img-1", sha256, byteLength: 3 }, { Cookie: cookie, "X-Life-Account": accountId });
    const uploaded = await upload.json();
    objects.data.set(uploaded.objectKey, bytes);
    expect((await replica("attachments/finalize", { objectKey: uploaded.objectKey, sha256, byteLength: 3 }, { Cookie: cookie, "X-Life-Account": accountId })).status).toBe(200);
    const applied = await replica("mutations", { ...pendingPayload, writerId, epoch: 1, payloadSha256: digest(mutationDigestInput(pendingPayload)) }, { Cookie: cookie, "X-Life-Account": accountId });
    expect(applied.status).toBe(200);
  });

  it("accepts native Bearer auth and rejects localhost cookie CSRF against replica mutations", async () => {
    auth.verifyAccessToken.mockImplementationOnce(async () => ({ subject: "web@example.test", email: "web@example.test" }));
    const native = await replica("writers/register", { writerId }, { Origin: "https://localhost", Authorization: `Bearer ${accessToken}` });
    expect(native.status).toBe(200);
    const blocked = await replica("mutations", { writerId, epoch: 1, mutationId: "66666666-6666-4666-8666-666666666666", createdAt: "2026-09-15T00:00:00.000Z", payloadSha256: "a".repeat(64), ops: [] }, { Origin: "https://localhost", Cookie: cookie, "X-Life-Account": accountId });
    expect(blocked.status).toBe(403);
  });

  it("rejects expired or garbage Bearer tokens with 401 without trusting accountId", async () => {
    const snapshot = await replica("snapshot", undefined, { Origin: "https://localhost", Authorization: `Bearer ${"x".repeat(40)}` });
    expect(snapshot.status).toBe(401);
    expect((await snapshot.json()).code).toBe("unauthorized");
    const mutated = await replica("mutations", {
      writerId,
      epoch: 1,
      mutationId: "55555555-5555-4555-8555-555555555555",
      createdAt: "2026-09-15T00:00:00.000Z",
      payloadSha256: "a".repeat(64),
      ops: [],
    }, { Origin: "https://localhost", Authorization: `Bearer ${"x".repeat(40)}`, "X-Life-Account": accountId });
    expect(mutated.status).toBe(401);
  });

  it("accepts native OTP auth with no Origin header because CapacitorHttp is not a browser", async () => {
    const started = await handler(new Request(`${config.origin}/api/replica/auth/email/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "native-otp@example.test" }),
    }));
    expect(started.status).toBe(200);
    expect(auth.start).toHaveBeenCalledWith("native-otp@example.test", { emailRedirectTo: false });
    const verified = await handler(new Request(`${config.origin}/api/replica/auth/email/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "native-otp@example.test", token: "123456" }),
    }));
    expect(verified.status).toBe(200);
    expect((await verified.json()).accessToken).toEqual(accessToken);
  });

  it("exchanges a provider magic-link access token for replica Bearer session", async () => {
    auth.verifyAccessToken.mockImplementationOnce(async () => ({ subject: "native@example.test", email: "native@example.test" }));
    const callback = await replica("auth/email/callback", { accessToken }, { Origin: "https://localhost" });
    expect(callback.status).toBe(200);
    expect((await callback.json()).accessToken).toEqual(accessToken);
    const blocked = await replica("auth/email/callback", { accessToken: "y".repeat(128) }, { Origin: "https://localhost" });
    expect(blocked.status).toBe(401);
  });

  it("fences the old writer after promote and preserves local-unrelated 16A cookie CSRF", async () => {
    const promoted = await replica("writers/promote", { writerId: otherWriter }, { Cookie: cookie, "X-Life-Account": accountId });
    expect(promoted.status).toBe(200);
    const moment = replicaRecord({
      id: "moment-2", originalText: "stale device", isFavorite: false, location: null,
      createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z", deletedAt: null,
    });
    const payload = { mutationId: "77777777-7777-4777-8777-777777777777", createdAt: "2026-09-15T00:00:00.000Z", ops: [{ entity: "moment" as const, op: "upsert" as const, id: "moment-2", record: moment }] };
    const fenced = await replica("mutations", { ...payload, writerId, epoch: 1, payloadSha256: digest(mutationDigestInput(payload)) }, { Cookie: cookie, "X-Life-Account": accountId });
    expect(fenced.status).toBe(409);
    expect((await fenced.json()).code).toBe("fenced");
    const csrf = await cloudHandler(new Request(`${config.origin}/api/cloud/auth/email/start`, {
      method: "POST",
      headers: { Origin: "https://localhost", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "web@example.test" }),
    }));
    expect(csrf.status).toBe(403);
  });

  it("returns a snapshot that includes tombstones and verified objects", async () => {
    const deleted = replicaRecord({
      id: "moment-1", originalText: "hello", isFavorite: false, location: null,
      createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T02:00:00.000Z", deletedAt: "2026-09-15T02:00:00.000Z",
    });
    const payload = { mutationId: "88888888-8888-4888-8888-888888888888", createdAt: "2026-09-15T02:00:00.000Z", ops: [{ entity: "moment" as const, op: "upsert" as const, id: "moment-1", record: deleted }] };
    expect((await replica("mutations", { ...payload, writerId: otherWriter, epoch: 2, payloadSha256: digest(mutationDigestInput(payload)) }, { Cookie: cookie, "X-Life-Account": accountId })).status).toBe(200);
    const snapshot = await (await replica("snapshot", undefined, { Cookie: cookie, "X-Life-Account": accountId })).json();
    expect(snapshot.records.moment[0].deletedAt).toBe("2026-09-15T02:00:00.000Z");
    expect(snapshot.objects[0].sha256).toHaveLength(64);
  });
});
