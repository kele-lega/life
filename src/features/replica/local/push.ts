import { control, bindLocalLibrary, initializeControl, type ControlDatabase } from "@/features/cloud-backup/local/control";
import { BUSINESS_TABLE_NAMES, db, type LifeDatabase } from "@/lib/db/client";
import { isNativeApp } from "@/lib/runtime/platform";
import {
  ensureReplicaBackfill, ensureReplicaState, listDueReplicaMutations, markReplicaAcked,
  markReplicaFenced, markReplicaRetry, matchesReplicaScope, pendingReplicaCount,
  replicaWrites, type ReplicaStateScope,
} from "./outbox";
import { replicaUserTransport } from "../client/account";
import { createReplicaTransport, replicaApiOrigin, type ReplicaTransport } from "../client/transport";
import {
  readPendingReplicaLogout, readReplicaSession, replicaSessionExpiry, replicaSessionGeneration,
  writeReplicaSession,
} from "../client/session";
import { hashBytes, ReplicaError, type ReplicaReceipt } from "../shared/protocol";
import type { ReplicaStateRow } from "./types";

export interface ReplicaPushClient {
  transport: ReplicaTransport;
  accountId: string;
  assertCurrent?: () => Promise<void>;
}
export interface ReplicaPushOptions { forceRetry?: boolean }
export interface ReplicaSyncStatus {
  pending: number;
  fenced: boolean;
  syncing: boolean;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  pausedReason: string | null;
  localCounts: Record<typeof BUSINESS_TABLE_NAMES[number], number>;
  accountId: string | null;
}

const lockTails = new Map<string, Promise<unknown>>();
const pushing = new Set<string>();
let refreshFlight: Promise<void> | undefined;

/** Also used by explicit restore activation. Browser releases its lock on termination. */
export async function withReplicaPushLock<T>(database: Pick<LifeDatabase, "name">, work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => typeof navigator !== "undefined" && navigator.locks
    ? await navigator.locks.request(`life-replica-push:${database.name}`, { mode: "exclusive" }, work) : await work();
  const previous = lockTails.get(database.name) ?? Promise.resolve();
  const result = previous.then(run, run);
  lockTails.set(database.name, result);
  try { return await result; }
  finally { if (lockTails.get(database.name) === result) lockTails.delete(database.name); }
}

function backoff(attempt: number): number { return Math.min(60_000 * 2 ** Math.max(0, attempt), 3_600_000); }
function scopeChanged(): never { throw new ReplicaError("account_changed", "账户或生活库已切换，本机记录已保留。"); }

async function refreshNativeSession(force: boolean): Promise<void> {
  const generation = replicaSessionGeneration();
  const session = await readReplicaSession();
  if (!session || session.authMode === "test-password" || !session.refreshToken) return;
  if (!force && (replicaSessionExpiry(session.expiresAt) ?? Infinity) > Date.now() + 60_000) return;
  const origin = replicaApiOrigin();
  if (origin === null) return;
  const initial = await initializeControl();
  if (initial.context.logoutPending || initial.context.account?.id !== session.accountId) return;
  const current = async () => {
    const context = (await initializeControl()).context;
    const latest = await readReplicaSession();
    if (replicaSessionGeneration() !== generation || context.logoutPending
      || context.account?.id !== session.accountId || context.activeLibraryId !== initial.context.activeLibraryId
      || latest?.accessToken !== session.accessToken) scopeChanged();
  };
  try {
    await current();
    const refreshed = await createReplicaTransport({ origin, native: true, assertCurrent: current }).request<{
      account: { id: string; email: string; username?: string };
      accessToken: string; refreshToken: string; expiresAt?: number;
    }>("auth/refresh", { refreshToken: session.refreshToken });
    await current();
    if (refreshed.account.id !== session.accountId) scopeChanged();
    await writeReplicaSession({
      accountId: refreshed.account.id, email: refreshed.account.email, username: refreshed.account.username,
      accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt, authMode: "supabase",
    }, generation);
  } catch { /* Offline/expired credentials pause networking; library ownership is retained. */ }
}

export async function refreshIfNeeded(force = false): Promise<ReplicaPushClient | null> {
  if (isNativeApp()) {
    if (!refreshFlight) {
      const run = refreshNativeSession(force);
      refreshFlight = run;
      try { await run; } finally { if (refreshFlight === run) refreshFlight = undefined; }
    } else await refreshFlight;
  }
  try { return await replicaUserTransport(); } catch { return null; }
}

/** Explicit upload consent only. Caller holds exclusiveLibrary; never runs on login. */
export async function claimLibraryForReplica(accountId: string, database: LifeDatabase = db, storage: ControlDatabase = control): Promise<void> {
  await withReplicaPushLock(database, async () => {
    const { context, library } = await initializeControl(storage);
    if (context.logoutPending || context.account?.id !== accountId || library.databaseName !== database.name
      || (library.accountId !== null && library.accountId !== accountId)) scopeChanged();
    const state = await ensureReplicaState(database);
    if (state.accountId !== null && state.accountId !== accountId) scopeChanged();
    await bindLocalLibrary(library.id, accountId, storage);
    await database.transaction("rw", database.replicaState, async () => {
      const live = await ensureReplicaState(database);
      if (live.accountId !== null && live.accountId !== accountId) scopeChanged();
      await database.replicaState.update("current", { accountId, pausedReason: null });
    });
  });
}

export async function getReplicaSyncStatus(database: LifeDatabase = db): Promise<ReplicaSyncStatus> {
  const [state, pending, counts] = await Promise.all([
    database.replicaState.get("current"), pendingReplicaCount(database),
    Promise.all(BUSINESS_TABLE_NAMES.map(async (name) => [name, await database.table(name).count()] as const)),
  ]);
  let syncing = pushing.has(database.name);
  if (!syncing && typeof navigator !== "undefined" && navigator.locks?.query) {
    const locks = await navigator.locks.query();
    syncing = locks.held?.some((lock) => lock.name === `life-replica-push:${database.name}`) ?? false;
  }
  return {
    pending, fenced: state?.fenced ?? false, syncing,
    lastSyncedAt: state?.lastSyncedAt ?? null, lastAttemptAt: state?.lastAttemptAt ?? null,
    lastError: state?.lastError ?? null, pausedReason: state?.pausedReason ?? null,
    accountId: state?.accountId ?? null,
    localCounts: Object.fromEntries(counts) as ReplicaSyncStatus["localCounts"],
  };
}

interface PushScope {
  client: ReplicaPushClient;
  state: ReplicaStateScope;
  libraryId: string | null;
  installationId: string | null;
  assertCurrent: () => Promise<void>;
}

async function productionLibrary(database: LifeDatabase, accountId: string) {
  const result = await initializeControl();
  if (result.context.logoutPending || readPendingReplicaLogout() || result.context.account?.id !== accountId
    || result.library.databaseName !== database.name || result.library.accountId !== accountId) scopeChanged();
  return result;
}

async function captureScope(database: LifeDatabase, state: ReplicaStateRow, client: ReplicaPushClient, injected: boolean): Promise<PushScope> {
  if (state.accountId !== client.accountId) scopeChanged();
  const local = injected ? null : await productionLibrary(database, client.accountId);
  const scope: PushScope = {
    client, state: { accountId: state.accountId, writerId: state.writerId, epoch: state.epoch },
    libraryId: local?.library.id ?? null, installationId: local?.context.installationId ?? null,
    assertCurrent: async () => {
      await client.assertCurrent?.();
      if (!injected) {
        const latest = await productionLibrary(database, client.accountId);
        if (latest.library.id !== scope.libraryId || latest.context.installationId !== scope.installationId) scopeChanged();
      }
      const live = await database.replicaState.get("current");
      if (!matchesReplicaScope(live, scope.state) || live?.fenced) scopeChanged();
    },
  };
  await scope.assertCurrent();
  return scope;
}

async function patchState(database: LifeDatabase, scope: PushScope, patch: Partial<ReplicaStateRow>): Promise<void> {
  await scope.assertCurrent();
  await database.transaction("rw", database.replicaState, async () => {
    if (!matchesReplicaScope(await database.replicaState.get("current"), scope.state)) scopeChanged();
    await database.replicaState.update("current", patch);
  });
}

async function registerWriter(database: LifeDatabase, scope: PushScope) {
  await scope.assertCurrent();
  const writer = await scope.client.transport.request<{ writerId: string; epoch: number; fenced: boolean; headCommitSeq: number }>("writers/register", {
    writerId: scope.state.writerId, libraryId: scope.libraryId, installationId: scope.installationId,
  });
  if (writer.writerId !== scope.state.writerId || !Number.isSafeInteger(writer.epoch) || writer.epoch < 1) throw new ReplicaError("invalid_response");
  if (writer.fenced) throw new ReplicaError("fenced");
  await patchState(database, scope, { epoch: writer.epoch, lastCommitSeq: writer.headCommitSeq });
  scope.state = { ...scope.state, epoch: writer.epoch };
}

async function uploadBlobs(database: LifeDatabase, scope: PushScope, attachmentIds: string[]) {
  for (const attachmentId of attachmentIds) {
    await scope.assertCurrent();
    const blobRow = await database.replicaBlobs.get(attachmentId);
    if (!blobRow || blobRow.status === "verified") continue;
    if (blobRow.status === "too_large") throw new ReplicaError("blob_too_large", "附件超过云副本单文件上限。本机图片已保留。");
    const attachment = await database.attachments.get(attachmentId);
    if (!attachment) throw new ReplicaError("blob_missing");
    const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
    if (bytes.byteLength !== blobRow.byteLength || await hashBytes(bytes) !== blobRow.sha256) throw new ReplicaError("blob_checksum");
    await scope.assertCurrent();
    const upload = await scope.client.transport.request<{ verified: boolean; objectKey: string; url?: string; headers?: Record<string, string> }>("attachments/uploads", {
      attachmentId, sha256: blobRow.sha256, byteLength: blobRow.byteLength,
    });
    if (!upload.verified) {
      if (!upload.url || !upload.headers) throw new ReplicaError("upload_interrupted");
      await scope.assertCurrent();
      await scope.client.transport.put(upload.url, upload.headers, bytes);
      await scope.assertCurrent();
      await scope.client.transport.request("attachments/finalize", { objectKey: upload.objectKey, sha256: blobRow.sha256, byteLength: blobRow.byteLength });
    }
    await scope.assertCurrent();
    await database.transaction("rw", replicaWrites(database), async () => {
      if (!matchesReplicaScope(await database.replicaState.get("current"), scope.state)) scopeChanged();
      const current = await database.replicaBlobs.get(attachmentId);
      if (current?.sha256 !== blobRow.sha256) scopeChanged();
      await database.replicaBlobs.put({ ...blobRow, objectKey: upload.objectKey, status: "verified", verifiedAt: new Date().toISOString() });
    });
  }
}

async function recordPause(database: LifeDatabase, state: ReplicaStateRow, reason: string): Promise<void> {
  await database.transaction("rw", database.replicaState, async () => {
    if (matchesReplicaScope(await database.replicaState.get("current"), state)) await database.replicaState.update("current", { pausedReason: reason });
  });
}

/** clientFactory is an explicit test seam: its state must already be owned by its account. */
export async function pushReplica(database: LifeDatabase = db, clientFactory?: () => Promise<ReplicaPushClient | null>, options: ReplicaPushOptions = {}): Promise<void> {
  if (pushing.has(database.name)) return;
  pushing.add(database.name);
  try {
    await withReplicaPushLock(database, async () => {
      await database.open();
      await ensureReplicaBackfill(database);
      const state = await ensureReplicaState(database);
      if (state.fenced) return;
      // Do not even refresh tokens or register a writer for unclaimed/mismatched data.
      if (!state.accountId) { await recordPause(database, state, "claim_required"); return; }
      if (!clientFactory) {
        try { await productionLibrary(database, state.accountId); }
        catch { await recordPause(database, state, "account_required"); return; }
      }
      const client = await (clientFactory ? clientFactory() : refreshIfNeeded());
      if (!client) { await recordPause(database, state, "session_required"); return; }
      const scope = await captureScope(database, state, client, !!clientFactory);
      const due = await listDueReplicaMutations(database, undefined, options.forceRetry);
      if (!due.length) return;
      await patchState(database, scope, { lastAttemptAt: new Date().toISOString(), pausedReason: null });
      try {
        if (scope.state.epoch < 1) await registerWriter(database, scope);
      } catch (error) {
        const code = error instanceof ReplicaError ? error.code : "cloud_unavailable";
        await scope.assertCurrent();
        if (code === "fenced") await markReplicaFenced(database, scope.state);
        else await patchState(database, scope, { lastError: code, pausedReason: code });
        return;
      }
      for (const mutation of due) {
        try {
          await scope.assertCurrent();
          await uploadBlobs(database, scope, mutation.payload.ops.filter((op) => op.entity === "attachment").map((op) => op.id));
          await scope.assertCurrent();
          const receipt = await client.transport.request<ReplicaReceipt>("mutations", {
            writerId: scope.state.writerId, epoch: scope.state.epoch, mutationId: mutation.mutationId,
            createdAt: mutation.payload.createdAt, payloadSha256: mutation.payloadSha256, ops: mutation.payload.ops,
          });
          await scope.assertCurrent();
          if (receipt.mutationId !== mutation.mutationId || receipt.epoch !== scope.state.epoch
            || !Number.isSafeInteger(receipt.commitSeq) || receipt.commitSeq < 1) throw new ReplicaError("invalid_response");
          await markReplicaAcked(database, mutation.mutationId, receipt.commitSeq, scope.state);
        } catch (error) {
          const code = error instanceof ReplicaError ? error.code : "cloud_unavailable";
          // A late response belongs to the old scope; do not mutate its outbox status
          // using the new account's credentials or continue to the next after-image.
          await scope.assertCurrent();
          if (code === "fenced") await markReplicaFenced(database, scope.state);
          else {
            await markReplicaRetry(database, mutation.mutationId, code, backoff(mutation.attemptCount), scope.state);
            if (code === "unauthorized" && isNativeApp()) await refreshIfNeeded(true);
          }
          return;
        }
      }
    });
  } catch { /* Fail-open: local records already committed. */ }
  finally { pushing.delete(database.name); }
}

export function resetReplicaPushLock(): void { pushing.clear(); }
