import { createHash, randomUUID } from "node:crypto";
import { expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import { encodeJson, TABLE_NAMES } from "../src/features/cloud-backup/shared/format";
import type { ReplicaEntity, ReplicaMutationEnvelope, ReplicaReceipt } from "../src/features/replica/shared/protocol";

export const ACCOUNT_IDS = {
  kele: "00000000-0000-4000-8000-00000000000a",
  wzj: "00000000-0000-4000-8000-00000000000b",
} as const;
export type Username = keyof typeof ACCOUNT_IDS;
export const ENTITY_TABLE = {
  moment: "moments", momentAppend: "momentAppends", attachment: "attachments", diary: "diaries",
  lifeEvent: "lifeEvents", lifeExtractionJob: "lifeExtractionJobs", lifeEventProposal: "lifeEventProposals",
} as const satisfies Record<ReplicaEntity, string>;
const ENTITIES = Object.keys(ENTITY_TABLE) as ReplicaEntity[];
const OBJECT_ORIGIN = "https://roundtrip-objects.invalid";
export const LOGIN_ERROR = "用户名或密码不正确。";
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

type JsonRow = Record<string, unknown> & { id: string };
interface CloudObject {
  attachmentId: string;
  objectKey: string;
  sha256: string;
  byteLength: number;
  bytes: Buffer | null;
  verified: boolean;
}
interface UserCloud {
  writerId: string | null;
  epoch: number;
  commitSeq: number;
  lastSyncedAt: string | null;
  records: Record<ReplicaEntity, Map<string, JsonRow>>;
  mutations: Map<string, { digest: string; receipt: ReplicaReceipt }>;
  objects: Map<string, CloudObject>;
}
function emptyCloud(): UserCloud {
  return {
    writerId: null, epoch: 0, commitSeq: 0, lastSyncedAt: null,
    records: Object.fromEntries(ENTITIES.map((entity) => [entity, new Map()])) as UserCloud["records"],
    mutations: new Map(), objects: new Map(),
  };
}

/** Browser workflow fake only. Real authentication, SQL/RLS and CSRF belong to server tests. */
export class AccountRoundtripCloud {
  readonly users: Record<Username, UserCloud> = { kele: emptyCloud(), wzj: emptyCloud() };
  readonly calls: Array<{ username: Username | null; path: string; mutationId?: string }> = [];
  readonly promotions: Array<{ username: Username; expectedCommitSeq: number }> = [];
  readonly unexpectedRequests: string[] = [];
  readonly aiRequests: string[] = [];
  readonly #passwords = { kele: `fixture-${randomUUID()}`, wzj: `fixture-${randomUUID()}` };
  online = true;
  rejectMutations = false;
  dropNextMutationReply = false;
  downloadFault: "corrupt" | "missing" | null = null;

  password(username: Username): string { return this.#passwords[username]; }
  rows(username: Username, entity: ReplicaEntity): JsonRow[] {
    return [...this.users[username].records[entity].values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  snapshot(username: Username) {
    const state = this.users[username];
    return {
      writerId: state.writerId, epoch: state.epoch, commitSeq: state.commitSeq,
      records: Object.fromEntries(ENTITIES.map((entity) => [entity, this.rows(username, entity)])),
      objects: [...state.objects.values()].filter((object) => object.verified).map(({ attachmentId, objectKey, sha256, byteLength }) => ({ attachmentId, objectKey, sha256, byteLength })),
    };
  }

  async install(context: BrowserContext, baseURL: string) {
    const localOrigin = new URL(baseURL).origin;
    let identity: Username | null = null;
    // Every non-app request is intercepted. No configured production API, storage,
    // provider, reverse geocoder or developer browser profile participates.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === localOrigin && !url.pathname.startsWith("/api/")) return route.continue();
      this.unexpectedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    });
    await context.route("**/api/location/reverse**", (route) => route.fulfill({ json: { city: null } }));
    await context.route("**/api/life-extraction**", (route) => {
      this.aiRequests.push(route.request().method());
      return route.fulfill({ status: 503, json: { code: "unconfigured", message: "Synthetic test: unavailable" } });
    });
    await context.route(`${OBJECT_ORIGIN}/**`, async (route) => {
      if (!this.online) return route.abort("internetdisconnected");
      const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "PUT, GET, OPTIONS", "access-control-allow-headers": "content-type" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const key = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      const object = Object.values(this.users).flatMap((user) => [...user.objects.values()]).find((entry) => entry.objectKey === key);
      if (!object) return route.fulfill({ status: 404, headers });
      if (route.request().method() === "PUT") {
        object.bytes = route.request().postDataBuffer();
        return route.fulfill({ status: 200, headers });
      }
      if (!object.verified || !object.bytes || this.downloadFault === "missing") return route.fulfill({ status: 404, headers });
      const bytes = Buffer.from(object.bytes);
      if (this.downloadFault === "corrupt") bytes[0] ^= 1;
      return route.fulfill({ status: 200, headers, body: bytes });
    });
    await context.route(/\/api\/(cloud|replica)\//, async (route) => {
      if (!this.online) return route.abort("internetdisconnected");
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api\/(?:cloud|replica)\//, "");
      const body = request.method() === "POST" ? request.postDataJSON() : {};
      // Deliberately record no auth body, password, cookie or bearer token.
      this.calls.push({ username: identity, path, ...(path === "mutations" ? { mutationId: body.mutationId } : {}) });
      const account = () => identity ? { id: ACCOUNT_IDS[identity], email: "", username: identity } : null;
      const fail = (code: string, status = 409, message = "云服务暂时不可用，本机记录已保留。") => route.fulfill({ status, json: { code, message } });
      if (path === "account") return route.fulfill({ json: { configured: true, authMode: "test-password", account: account() } });
      if (path === "auth/password/login") {
        const username = body.username as Username;
        if (!Object.hasOwn(ACCOUNT_IDS, username) || body.password !== this.#passwords[username]) return fail("invalid_credentials", 401, LOGIN_ERROR);
        identity = username;
        return route.fulfill({ json: { account: account(), authMode: "test-password" } });
      }
      if (path === "auth/logout") { identity = null; return route.fulfill({ json: { ok: true } }); }
      if (!identity) return fail("unauthorized", 401);
      if (request.headers()["x-life-account"] !== ACCOUNT_IDS[identity]) return fail("account_changed", 403);
      if (path === "backups") return route.fulfill({ json: { backups: [], nextCursor: null, latestForLibrary: null } });
      if (path === "libraries/bind") return route.fulfill({ json: { ok: true } });
      const state = this.users[identity];
      if (path === "status") return route.fulfill({ json: {
        counts: Object.fromEntries(ENTITIES.map((entity) => [entity, state.records[entity].size])),
        commitSeq: state.commitSeq, lastSyncedAt: state.lastSyncedAt, writerId: state.writerId, epoch: state.epoch,
        blobCount: [...state.objects.values()].filter((object) => object.verified).length,
        blobBytes: [...state.objects.values()].filter((object) => object.verified).reduce((sum, object) => sum + object.byteLength, 0),
      } });
      if (path === "writers/register" || path === "writers/promote") {
        if (path === "writers/promote") {
          if (body.expectedCommitSeq !== state.commitSeq) return fail("snapshot_stale");
          this.promotions.push({ username: identity, expectedCommitSeq: body.expectedCommitSeq });
          state.writerId = body.writerId;
          state.epoch += 1;
        } else {
          if (state.writerId && state.writerId !== body.writerId) return fail("writer_exists");
          state.writerId = body.writerId;
          state.epoch ||= 1;
        }
        return route.fulfill({ json: { writerId: state.writerId, epoch: state.epoch, fenced: false, headCommitSeq: state.commitSeq } });
      }
      if (path === "attachments/uploads") {
        let object = [...state.objects.values()].find((entry) => entry.attachmentId === body.attachmentId && entry.sha256 === body.sha256);
        if (!object) {
          const objectKey = `test/replica/${ACCOUNT_IDS[identity]}/${body.attachmentId}/${randomUUID()}`;
          object = { attachmentId: body.attachmentId, objectKey, sha256: body.sha256, byteLength: body.byteLength, bytes: null, verified: false };
          state.objects.set(objectKey, object);
        }
        return route.fulfill({ json: { verified: object.verified, objectKey: object.objectKey, url: `${OBJECT_ORIGIN}/${encodeURIComponent(object.objectKey)}`, headers: {} } });
      }
      if (path === "attachments/finalize") {
        const object = state.objects.get(body.objectKey);
        if (!object?.bytes || object.bytes.byteLength !== body.byteLength || object.byteLength !== body.byteLength
          || sha256(object.bytes) !== body.sha256 || object.sha256 !== body.sha256) return fail("part_checksum", 400);
        object.verified = true;
        return route.fulfill({ json: { verified: true, objectKey: object.objectKey } });
      }
      if (path === "attachments/downloads") {
        const object = [...state.objects.values()].find((entry) => entry.attachmentId === body.attachmentId && entry.sha256 === body.sha256 && entry.verified);
        if (!object) return fail("not_found", 404);
        return route.fulfill({ json: { url: `${OBJECT_ORIGIN}/${encodeURIComponent(object.objectKey)}`, bytes: object.byteLength, sha256: object.sha256 } });
      }
      if (path === "mutations") return this.applyMutation(route, identity, body as ReplicaMutationEnvelope);
      if (path === "snapshot") return route.fulfill({ json: this.snapshot(identity) });
      this.unexpectedRequests.push(`${request.method()} ${url.pathname}`);
      return fail("unhandled_test_route", 501);
    });
  }

  private async applyMutation(route: Route, username: Username, body: ReplicaMutationEnvelope) {
    const state = this.users[username];
    const fail = (code: string, status = 409) => route.fulfill({ status, json: { code, message: "本机记录已保留，请重试。" } });
    if (this.rejectMutations) return fail("cloud_unavailable", 503);
    if (body.writerId !== state.writerId || body.epoch !== state.epoch) return fail("fenced");
    const digest = sha256(encodeJson({ mutationId: body.mutationId, createdAt: body.createdAt, ops: body.ops }));
    if (digest !== body.payloadSha256) return fail("mutation_checksum", 400);
    const duplicate = state.mutations.get(body.mutationId);
    if (duplicate) return duplicate.digest === digest ? route.fulfill({ json: duplicate.receipt }) : fail("mutation_conflict");
    for (const op of body.ops) {
      if (op.entity === "attachment" && ![...state.objects.values()].some((object) => object.verified
        && object.attachmentId === op.id && object.sha256 === op.record.sha256 && object.byteLength === op.record.byteLength)) return fail("blob_pending");
    }
    for (const op of body.ops) state.records[op.entity].set(op.id, structuredClone(op.record) as JsonRow);
    const receipt = { mutationId: body.mutationId, commitSeq: ++state.commitSeq, epoch: state.epoch };
    state.mutations.set(body.mutationId, { digest, receipt });
    state.lastSyncedAt = new Date().toISOString();
    if (this.dropNextMutationReply) {
      this.dropNextMutationReply = false;
      return route.abort("failed");
    }
    return route.fulfill({ json: receipt });
  }
}

export async function readDatabase(page: Page, databaseName?: string): Promise<Record<string, JsonRow[]>> {
  return page.evaluate(async (requestedName) => {
    const name = requestedName ?? localStorage.getItem("life-library-bootstrap-v1") ?? "life";
    if (!(await indexedDB.databases()).some((entry) => entry.name === name)) throw new Error("Expected synthetic database does not exist");
    const open = indexedDB.open(name);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    try {
      const result: Record<string, Array<Record<string, unknown> & { id: string }>> = {};
      for (const table of Array.from(database.objectStoreNames)) {
        const request = database.transaction(table, "readonly").objectStore(table).getAll();
        const rows = await new Promise<Array<Record<string, unknown> & { id: string }>>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        result[table] = await Promise.all(rows.map(async (row) => row.blob instanceof Blob
          ? { ...row, blob: { type: row.blob.type, bytes: Array.from(new Uint8Array(await row.blob.arrayBuffer())) } } : row));
      }
      return result;
    } finally { database.close(); }
  }, databaseName);
}

export async function readOriginals(page: Page, databaseName?: string) {
  const database = await readDatabase(page, databaseName);
  return Object.fromEntries(TABLE_NAMES.map((table) => [table, database[table]]));
}
export async function activeDatabaseName(page: Page) {
  return page.evaluate(() => localStorage.getItem("life-library-bootstrap-v1") ?? "life");
}
export async function assertNoStoredPassword(page: Page, cloud: AccountRoundtripCloud) {
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  const databaseNames = await page.evaluate(async () => (await indexedDB.databases()).flatMap((entry) => entry.name ? [entry.name] : []));
  const databases = await Promise.all(databaseNames.map((name) => readDatabase(page, name)));
  // Assert booleans so failure diagnostics never echo credentials or stored values.
  const persisted = storage + JSON.stringify(databases);
  expect(Object.keys(ACCOUNT_IDS).some((name) => persisted.includes(cloud.password(name as Username)))).toBe(false);
}
export async function login(page: Page, cloud: AccountRoundtripCloud, username: Username = "kele") {
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
  await page.getByLabel("用户名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(cloud.password(username));
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "我的账户", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "立即上传", exact: true }).or(page.getByRole("button", { name: "重试上传", exact: true }))).toBeVisible();
}
export async function logout(page: Page) {
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "退出登录并保留本机库", exact: true }).click(),
  ]);
  await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
}
export const replicaSection = (page: Page) => page.getByRole("region", { name: "云副本", exact: true });
export async function claimAndUpload(page: Page, username: Username = "kele") {
  await page.getByRole("button", { name: "立即上传", exact: true }).click();
  await expect(page.getByRole("heading", { name: `将这份生活库上传到 ${username}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确认并上传", exact: true }).click();
}
export async function expectSynced(page: Page) {
  await expect(replicaSection(page).getByRole("status", { name: "同步状态" })).toHaveText("已同步", { timeout: 15_000 });
  await expect(replicaSection(page)).toContainText("0 条变更");
}
export async function reconnect(page: Page, context: BrowserContext, cloud: AccountRoundtripCloud) {
  cloud.online = true;
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}
export async function createMoment(page: Page, text: string, image = false) {
  await page.getByRole("button", { name: "写点什么", exact: true }).click();
  await page.getByRole("textbox", { name: "记录内容", exact: true }).fill(text);
  if (image) await page.getByLabel("选择图片", { exact: true }).setInputFiles("e2e/fixtures/test-image.svg");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "记录内容", exact: true })).toHaveCount(0);
  const article = page.getByRole("article").filter({ hasText: text });
  await expect(article).toBeVisible();
  return article;
}
