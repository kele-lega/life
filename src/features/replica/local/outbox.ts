import Dexie, { type Table } from "dexie";

import type { Attachment } from "@/features/attachment/model/types";
import { db, type LifeDatabase } from "@/lib/db/client";
import { createEntityId } from "@/lib/identity/create-entity-id";
import { nowTimestamp } from "@/lib/time/timestamps";

import {
  BACKFILL_BATCH,
  ENTITY_TABLE,
  MAX_REPLICA_BLOB_BYTES,
  mutationPayloadSha256,
  replicaRecord,
  REPLICA_ENTITIES,
  type ReplicaEntity,
  type ReplicaOp,
} from "../shared/protocol";
import { hashBytes } from "../shared/protocol";
import type { ReplicaBlobRow, ReplicaMutationRow, ReplicaStateRow } from "./types";

export const SIDECAR_TABLE_NAMES = ["replicaMutations", "replicaState", "replicaBlobs"] as const;

export function replicaWrites(database: LifeDatabase, ...tables: Table[]): Table[] {
  return [...tables, database.replicaMutations, database.replicaState, database.replicaBlobs];
}

export async function ensureReplicaState(database: LifeDatabase): Promise<ReplicaStateRow> {
  return database.transaction("rw", database.replicaState, async () => {
    const existing = await database.replicaState.get("current");
    if (existing) return existing;
    const row: ReplicaStateRow = {
      id: "current", writerId: createEntityId(), epoch: 0, accountId: null,
      lastAckedMutationId: null, lastCommitSeq: 0, fenced: false, backfillComplete: false,
      nextSequence: 1, lastSyncedAt: null, lastAttemptAt: null, lastError: null, pausedReason: null,
    };
    await database.replicaState.add(row);
    return row;
  });
}

async function keepAlive<T>(work: Promise<T>): Promise<T> {
  return Dexie.currentTransaction ? Dexie.waitFor(work) : work;
}

async function readAttachmentBytes(blob: Attachment["blob"]): Promise<Uint8Array | null> {
  try {
    if (blob && typeof blob.arrayBuffer === "function") {
      return new Uint8Array(await blob.arrayBuffer());
    }
  } catch {
    return null;
  }
  return null;
}

export async function replicaAttachmentRecord(attachment: Attachment, database: LifeDatabase = db): Promise<Record<string, unknown>> {
  const { blob, ...metadata } = attachment;
  const bytes = await keepAlive(readAttachmentBytes(blob));
  if (bytes) {
    return replicaRecord({
      ...metadata,
      blobType: blob.type,
      sha256: await keepAlive(hashBytes(bytes)),
      byteLength: bytes.byteLength,
    });
  }
  const existing = await database.replicaBlobs.get(attachment.id);
  if (existing?.sha256) {
    return replicaRecord({
      ...metadata,
      blobType: blob.type,
      sha256: existing.sha256,
      byteLength: existing.byteLength,
    });
  }
  throw new Error("Attachment blob is unreadable.");
}

async function upsertReplicaBlob(database: LifeDatabase, record: Record<string, unknown>): Promise<void> {
  const attachmentId = String(record.id);
  const digest = String(record.sha256 ?? "");
  const byteLength = Number(record.byteLength ?? 0);
  if (!digest || !Number.isFinite(byteLength)) return;
  const existing = await database.replicaBlobs.get(attachmentId);
  if (existing && existing.sha256 === digest && existing.status === "verified") return;
  const row: ReplicaBlobRow = {
    attachmentId,
    sha256: digest,
    byteLength,
    objectKey: existing?.sha256 === digest ? existing.objectKey : null,
    status: byteLength > MAX_REPLICA_BLOB_BYTES ? "too_large" : "pending",
    verifiedAt: null,
  };
  await database.replicaBlobs.put(row);
}

export async function enqueueReplicaMutation(database: LifeDatabase, ops: ReplicaOp[]): Promise<void> {
  if (ops.length === 0) return;
  await database.transaction("rw", replicaWrites(database), async () => {
  const state = await ensureReplicaState(database);
  const sequence = state.nextSequence ?? 1;
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= Number.MAX_SAFE_INTEGER) throw new Error("Replica sequence exhausted.");
  await database.replicaState.update("current", { nextSequence: sequence + 1 });
  const createdAt = nowTimestamp();
  const payload = {
    mutationId: createEntityId(),
    createdAt,
    ops: ops.map((op) => ({
      entity: op.entity,
      op: "upsert" as const,
      id: op.id,
      record: replicaRecord(op.record),
    })),
  };
  for (const op of payload.ops) {
    if (op.entity === "attachment") await upsertReplicaBlob(database, op.record);
  }
  const row: ReplicaMutationRow = {
    mutationId: payload.mutationId,
    status: "pending",
    payloadSha256: await keepAlive(mutationPayloadSha256(payload)),
    payload,
    createdAt,
    nextRetryAt: createdAt,
    attemptCount: 0,
    lastError: null,
    ackedCommitSeq: null,
    sequence,
  };
  await database.replicaMutations.add(row);
  });
}

export async function enqueueEntity(database: LifeDatabase, entity: ReplicaEntity, record: Record<string, unknown>): Promise<void> {
  await enqueueReplicaMutation(database, [{ entity, op: "upsert", id: String(record.id), record }]);
}

function coveredIds(rows: ReplicaMutationRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const op of row.payload.ops) ids.add(`${op.entity}:${op.id}`);
  }
  return ids;
}

export async function ensureReplicaBackfill(database: LifeDatabase): Promise<void> {
  await database.open();
  const state = await ensureReplicaState(database);
  if (state.backfillComplete) return;
  const covered = coveredIds(await database.replicaMutations.toArray());
  for (const entity of REPLICA_ENTITIES) {
    const tableName = ENTITY_TABLE[entity];
    const rows = await database.table(tableName).toArray() as Array<Record<string, unknown> & { id: string }>;
    const pending: ReplicaOp[] = [];
    const flush = async () => {
      if (!pending.length) return;
      const batch = pending.splice(0, pending.length);
      await database.transaction("rw", replicaWrites(database, database.table(tableName)), async () => {
        const live = coveredIds(await database.replicaMutations.toArray());
        const ops = batch.filter((op) => !live.has(`${op.entity}:${op.id}`));
        if (ops.length) await enqueueReplicaMutation(database, ops);
      });
    };
    for (const row of rows) {
      if (covered.has(`${entity}:${row.id}`)) continue;
      covered.add(`${entity}:${row.id}`);
      if (entity === "attachment") {
        pending.push({ entity, op: "upsert", id: row.id, record: await replicaAttachmentRecord(row as unknown as Attachment, database) });
      } else {
        pending.push({ entity, op: "upsert", id: row.id, record: replicaRecord(row) });
      }
      if (pending.length >= BACKFILL_BATCH) await flush();
    }
    await flush();
  }
  await database.replicaState.update("current", { backfillComplete: true });
}

export async function pendingReplicaCount(database: LifeDatabase): Promise<number> {
  return database.replicaMutations.where("status").equals("pending").count();
}

export function compareReplicaMutations(a: ReplicaMutationRow, b: ReplicaMutationRow): number {
  if (a.sequence !== undefined && b.sequence !== undefined) return a.sequence - b.sequence;
  // Legacy entries precede newly sequenced rows. Equal legacy timestamps have no
  // recoverable causal order; the ID makes the fallback deterministic only.
  if (a.sequence !== undefined) return 1;
  if (b.sequence !== undefined) return -1;
  return a.createdAt.localeCompare(b.createdAt) || a.mutationId.localeCompare(b.mutationId);
}

export async function listDueReplicaMutations(database: LifeDatabase, now = nowTimestamp(), forceRetry = false): Promise<ReplicaMutationRow[]> {
  const rows = (await database.replicaMutations.where("status").equals("pending").toArray()).sort(compareReplicaMutations);
  const blocked = forceRetry ? -1 : rows.findIndex((row) => row.nextRetryAt > now);
  return blocked < 0 ? rows : rows.slice(0, blocked);
}

export type ReplicaStateScope = Pick<ReplicaStateRow, "accountId" | "writerId" | "epoch">;
export function matchesReplicaScope(state: ReplicaStateRow | undefined, scope: ReplicaStateScope): boolean {
  return !!state && state.accountId === scope.accountId && state.writerId === scope.writerId && state.epoch === scope.epoch;
}

export async function markReplicaAcked(database: LifeDatabase, mutationId: string, commitSeq: number, scope?: ReplicaStateScope): Promise<void> {
  await database.transaction("rw", replicaWrites(database), async () => {
    const row = await database.replicaMutations.get(mutationId);
    const state = await ensureReplicaState(database);
    if (!row || row.status !== "pending" || (scope && !matchesReplicaScope(state, scope))) return;
    await database.replicaMutations.put({ ...row, status: "acked", ackedCommitSeq: commitSeq, lastError: null, nextRetryAt: row.createdAt });
    await database.replicaState.update("current", {
      lastAckedMutationId: mutationId, lastCommitSeq: Math.max(state.lastCommitSeq, commitSeq),
      lastSyncedAt: nowTimestamp(), lastError: null, pausedReason: null,
    });
  });
}

export async function markReplicaRetry(database: LifeDatabase, mutationId: string, error: string, delayMs: number, scope?: ReplicaStateScope): Promise<void> {
  await database.transaction("rw", replicaWrites(database), async () => {
    const row = await database.replicaMutations.get(mutationId);
    const state = await ensureReplicaState(database);
    if (!row || row.status !== "pending" || (scope && !matchesReplicaScope(state, scope))) return;
    await database.replicaMutations.put({
      ...row, attemptCount: row.attemptCount + 1, lastError: error,
      nextRetryAt: new Date(Date.now() + delayMs).toISOString(),
    });
    await database.replicaState.update("current", { lastError: error, pausedReason: error });
  });
}

export async function markReplicaFenced(database: LifeDatabase, scope?: ReplicaStateScope): Promise<void> {
  await database.transaction("rw", database.replicaState, async () => {
    const state = await ensureReplicaState(database);
    if (scope && !matchesReplicaScope(state, scope)) return;
    await database.replicaState.update("current", { fenced: true, lastError: "fenced", pausedReason: "fenced" });
  });
}
