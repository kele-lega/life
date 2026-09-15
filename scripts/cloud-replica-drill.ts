import "fake-indexeddb/auto";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LifeDatabase } from "../src/lib/db/client";
import { restoreReplicaSnapshot } from "../src/features/replica/local/restore";
import { mutationDigestInput, replicaRecord } from "../src/features/replica/shared/protocol";

const origin = process.env.CLOUD_APP_ORIGIN;
const email = process.env.CLOUD_TEST_EMAIL;
const token = process.env.CLOUD_TEST_OTP;
const magicLink = process.env.CLOUD_TEST_MAGIC_LINK;
const sessionFile = process.env.CLOUD_TEST_SESSION_FILE || ".scratch/replica-session.json";
if (!origin || !email) throw new Error("test_configuration_required");

function unwrapAuthUrl(raw: string): URL {
  const value = raw.trim().replace(/^['"]|['"]$/g, "");
  let url = new URL(value);
  if (url.hostname === "www.google.com" && url.pathname === "/url") {
    const nested = url.searchParams.get("q");
    if (nested) url = new URL(nested);
  }
  return url;
}

function sessionFromFile(): string | null {
  const direct = process.env.CLOUD_TEST_ACCESS_TOKEN?.trim();
  if (direct && direct.length >= 100) return direct;
  if (!existsSync(sessionFile)) return null;
  try {
    const parsed = JSON.parse(readFileSync(sessionFile, "utf8")) as { accessToken?: string };
    return parsed.accessToken && parsed.accessToken.length >= 100 ? parsed.accessToken : null;
  } catch {
    return null;
  }
}

async function sessionFromMagicLink(raw: string) {
  const url = unwrapAuthUrl(raw);
  const hash = url.hash.startsWith("#") ? new URLSearchParams(url.hash.slice(1)) : new URLSearchParams();
  const hashed = hash.get("access_token");
  if (hashed && hashed.length >= 100) return { accessToken: hashed, refreshToken: hash.get("refresh_token") ?? undefined };
  const tokenHash = url.searchParams.get("token") || url.searchParams.get("token_hash") || hash.get("token_hash");
  const type = url.searchParams.get("type") || hash.get("type") || "magiclink";
  const authUrl = process.env.CLOUD_AUTH_URL;
  const authKey = process.env.CLOUD_AUTH_KEY;
  if (!tokenHash || !authUrl || !authKey) throw new Error("auth_failed_magic_link");
  const response = await fetch(`${authUrl.replace(/\/$/, "")}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: authKey, Authorization: `Bearer ${authKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type, token_hash: tokenHash }),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("auth_failed_" + response.status);
  const session = await response.json() as { access_token?: string; refresh_token?: string };
  if (!session.access_token) throw new Error("auth_failed_session");
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}

function sha(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  let accessToken = "";
  let accountId = "";
  async function replica<T>(path: string, body?: unknown, extra: HeadersInit = {}): Promise<{ status: number; json: T }> {
    const response = await fetch(`${origin}/api/replica/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(accountId ? { "X-Life-Account": accountId } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
      redirect: "error",
    });
    return { status: response.status, json: await response.json() as T };
  }

  const recovered = sessionFromFile();
  if (!magicLink && !token && !recovered) throw new Error("test_otp_required");
  const verified = (magicLink || recovered)
    ? await replica<{ account: { id: string; email: string }; accessToken: string; refreshToken: string; expiresAt?: number }>(
      "auth/email/callback",
      { accessToken: recovered ?? (await sessionFromMagicLink(magicLink!)).accessToken },
    )
    : await replica<{ account: { id: string; email: string }; accessToken: string; refreshToken: string; expiresAt?: number }>(
      "auth/email/verify",
      { email, token },
    );
  if (verified.status !== 200 || !verified.json.accessToken) throw new Error("auth_failed_" + verified.status);
  accessToken = verified.json.accessToken;
  accountId = verified.json.account.id;
  writeFileSync(sessionFile, JSON.stringify({
    accountId,
    email: verified.json.account.email,
    accessToken: verified.json.accessToken,
    refreshToken: verified.json.refreshToken,
    expiresAt: verified.json.expiresAt,
    savedAt: new Date().toISOString(),
  }));

  const localhostCsrf = await replica("mutations", {
    writerId: randomUUID(),
    epoch: 1,
    mutationId: randomUUID(),
    createdAt: new Date().toISOString(),
    payloadSha256: "a".repeat(64),
    ops: [],
  }, { Origin: "https://localhost", Authorization: "", "X-Life-Account": accountId });
  if (localhostCsrf.status !== 403) throw new Error("localhost_cookie_csrf_not_rejected");

  const writerId = randomUUID();
  const otherWriter = randomUUID();
  const registered = await replica<{ writerId: string; epoch: number }>("writers/register", { writerId, libraryId: null, installationId: null });
  if (registered.status !== 200) throw new Error("register_failed");

  const moment = replicaRecord({
    id: `synthetic-moment-${randomUUID()}`,
    originalText: "synthetic replica drill text",
    isFavorite: false,
    location: null,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    deletedAt: null,
  });
  const payload = {
    mutationId: randomUUID(),
    createdAt: "2026-09-15T00:00:00.000Z",
    ops: [{ entity: "moment" as const, op: "upsert" as const, id: String(moment.id), record: moment }],
  };
  const envelope = { ...payload, writerId, epoch: registered.json.epoch, payloadSha256: sha(Buffer.from(mutationDigestInput(payload))) };
  const first = await replica<{ mutationId: string; commitSeq: number }>("mutations", envelope);
  if (first.status !== 200) throw new Error("mutation_failed");
  const replay = await replica<{ commitSeq: number }>("mutations", envelope);
  if (replay.status !== 200 || replay.json.commitSeq !== first.json.commitSeq) throw new Error("idempotent_replay_failed");
  const conflict = await replica("mutations", { ...envelope, ops: [{ ...payload.ops[0], record: { ...moment, originalText: "changed" } }] });
  if (conflict.status !== 409) throw new Error("mutation_conflict_failed");

  const bytes = Uint8Array.from([9, 8, 7, 6, 5]);
  const digest = sha(bytes);
  const attachmentId = `synthetic-image-${randomUUID()}`;
  const attachment = replicaRecord({
    id: attachmentId,
    ownerType: "moment",
    ownerId: moment.id,
    kind: "image",
    fileName: "drill.png",
    mimeType: "image/png",
    size: bytes.byteLength,
    width: null,
    height: null,
    createdAt: "2026-09-15T00:00:01.000Z",
    updatedAt: "2026-09-15T00:00:01.000Z",
    deletedAt: null,
    sha256: digest,
    byteLength: bytes.byteLength,
  });
  const pendingPayload = {
    mutationId: randomUUID(),
    createdAt: "2026-09-15T00:00:01.000Z",
    ops: [{ entity: "attachment" as const, op: "upsert" as const, id: attachmentId, record: attachment }],
  };
  const pendingEnvelope = { ...pendingPayload, writerId, epoch: registered.json.epoch, payloadSha256: sha(Buffer.from(mutationDigestInput(pendingPayload))) };
  const pending = await replica("mutations", pendingEnvelope);
  if (pending.status !== 409) throw new Error("blob_pending_failed");

  const upload = await replica<{ verified: boolean; objectKey: string; url?: string; headers?: Record<string, string> }>("attachments/uploads", {
    attachmentId, sha256: digest, byteLength: bytes.byteLength,
  });
  if (upload.status !== 200 || upload.json.verified || !upload.json.url) throw new Error("upload_url_failed");
  const interrupted = await replica("attachments/finalize", {
    objectKey: upload.json.objectKey, sha256: digest, byteLength: bytes.byteLength,
  });
  if (interrupted.status === 200) throw new Error("finalize_before_put_should_fail");
  const put = await fetch(upload.json.url, {
    method: "PUT",
    headers: upload.json.headers,
    body: Buffer.from(bytes),
    signal: AbortSignal.timeout(60_000),
    redirect: "error",
  });
  if (!put.ok) throw new Error("blob_put_failed");
  const finalized = await replica("attachments/finalize", {
    objectKey: upload.json.objectKey, sha256: digest, byteLength: bytes.byteLength,
  });
  if (finalized.status !== 200) throw new Error("blob_sha_failed");
  const attached = await replica("mutations", pendingEnvelope);
  if (attached.status !== 200) throw new Error("attachment_mutation_failed");

  const deleted = replicaRecord({ ...moment, deletedAt: "2026-09-15T00:00:02.000Z", updatedAt: "2026-09-15T00:00:02.000Z" });
  const deletePayload = {
    mutationId: randomUUID(),
    createdAt: "2026-09-15T00:00:02.000Z",
    ops: [{ entity: "moment" as const, op: "upsert" as const, id: String(moment.id), record: deleted }],
  };
  const deletedPush = await replica("mutations", { ...deletePayload, writerId, epoch: registered.json.epoch, payloadSha256: sha(Buffer.from(mutationDigestInput(deletePayload))) });
  if (deletedPush.status !== 200) throw new Error("delete_failed");

  const promoted = await replica<{ epoch: number }>("writers/promote", { writerId: otherWriter, libraryId: null, installationId: null });
  if (promoted.status !== 200) throw new Error("promote_failed");
  const fenced = await replica("mutations", envelope);
  if (fenced.status !== 409) throw new Error("fence_failed");

  const snapshot = await replica<{
    records: { moment: Array<{ id: string; deletedAt: string | null }>; attachment: Array<{ id: string }> };
    objects: Array<{ attachmentId: string; sha256: string; byteLength: number }>;
    commitSeq: number;
  }>("snapshot");
  if (snapshot.status !== 200) throw new Error("snapshot_failed");
  const restoredMoment = snapshot.json.records.moment.find((row) => row.id === moment.id);
  if (!restoredMoment || restoredMoment.deletedAt !== "2026-09-15T00:00:02.000Z") throw new Error("tombstone_missing");
  if (!snapshot.json.objects.some((object) => object.attachmentId === attachmentId && object.sha256 === digest)) throw new Error("verified_object_missing");

  const expired = await replica("snapshot", undefined, { Authorization: `Bearer ${"x".repeat(40)}` });
  if (expired.status !== 401) throw new Error("expired_token_not_rejected");

  const restored = await restoreReplicaSnapshot(snapshot.json as never, {
    request: async <T>(path: string, body?: unknown): Promise<T> => {
      const result = await replica<T>(path, body);
      if (result.status !== 200) throw new Error("download_failed");
      return result.json;
    },
    put: async () => undefined,
    download: async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "error" });
      if (!response.ok) throw new Error("download_http_failed");
      return new Uint8Array(await response.arrayBuffer());
    },
  }, accountId);
  if (!restored.databaseName.startsWith("life-restore-")) throw new Error("restore_not_isolated");
  const isolated = new LifeDatabase(restored.databaseName);
  try {
    const working = new LifeDatabase("life");
    await working.open();
    if (await working.moments.get(String(moment.id))) throw new Error("working_library_polluted");
    working.close();
    const image = await isolated.attachments.get(attachmentId);
    if (!image?.blob) throw new Error("restore_image_missing");
  } finally {
    isolated.close();
    await LifeDatabase.delete(restored.databaseName);
  }

  console.log("replica_drill_ok");
}

void main().catch((error) => {
  process.exitCode = 1;
  const message = error instanceof Error ? error.message.split(/[\r\n]/)[0] : "unknown";
  console.error("Replica drill failed at " + message + ". Credentials and payloads are not logged.");
});
