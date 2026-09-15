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
  const existing = await database.replicaState.get("current");
  if (existing) return existing;
  const row: ReplicaStateRow = {
    id: "current",
    writerId: createEntityId(),
    epoch: 0,
    accountId: null,
    lastAckedMutationId: null,
    lastCommitSeq: 0,
    fenced: false,
    backfillComplete: false,
  };
  await database.replicaState.add(row);
  return row;
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
      sha256: await keepAlive(hashBytes(bytes)),
      byteLength: bytes.byteLength,
    });
  }
  const existing = await database.replicaBlobs.get(attachment.id);
  if (existing?.sha256) {
    return replicaRecord({
      ...metadata,
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
  await ensureReplicaState(database);
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
  };
  await database.replicaMutations.add(row);
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
        pending.push({ entity, op: "upsert", id: row.id, record: await replicaAttachmentRecord(row as unknown as Attachment) });
      } else {
        pending.push({ entity, op: "upsert", id: row.id, record: replicaRecord(row) });
      }
      if (pending.length >= BACKFILL_BATCH) await flush();
    }
    await flush();
  }
  await database.replicaState.put({ ...state, backfillComplete: true });
}

export async function pendingReplicaCount(database: LifeDatabase): Promise<number> {
  return database.replicaMutations.where("status").equals("pending").count();
}

export async function listDueReplicaMutations(database: LifeDatabase, now = nowTimestamp()): Promise<ReplicaMutationRow[]> {
  const rows = await database.replicaMutations.where("status").equals("pending").sortBy("createdAt");
  return rows.filter((row) => row.nextRetryAt <= now);
}

export async function markReplicaAcked(database: LifeDatabase, mutationId: string, commitSeq: number): Promise<void> {
  const row = await database.replicaMutations.get(mutationId);
  if (!row) return;
  const state = await ensureReplicaState(database);
  await database.transaction("rw", replicaWrites(database), async () => {
    await database.replicaMutations.put({
      ...row,
      status: "acked",
      ackedCommitSeq: commitSeq,
      lastError: null,
      nextRetryAt: row.createdAt,
    });
    await database.replicaState.put({
      ...state,
      lastAckedMutationId: mutationId,
      lastCommitSeq: commitSeq,
    });
  });
}

export async function markReplicaRetry(database: LifeDatabase, mutationId: string, error: string, delayMs: number): Promise<void> {
  const row = await database.replicaMutations.get(mutationId);
  if (!row || row.status !== "pending") return;
  const attemptCount = row.attemptCount + 1;
  await database.replicaMutations.put({
    ...row,
    attemptCount,
    lastError: error,
    nextRetryAt: new Date(Date.now() + delayMs).toISOString(),
  });
}

export async function markReplicaFenced(database: LifeDatabase): Promise<void> {
  const state = await ensureReplicaState(database);
  await database.replicaState.put({ ...state, fenced: true });
}
