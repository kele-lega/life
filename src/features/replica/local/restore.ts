import { LifeDatabase } from "@/lib/db/client";
import {
  activateLibrary,
  control,
  ensureCapacity,
  exclusiveLibrary,
  registerReplicaRestoredLibrary,
  reloadLibrary,
  type LocalContext,
  type LocalLibrary,
} from "@/features/cloud-backup/local/control";
import { emptyRecords, isId, LIMITS, TABLE_NAMES, type BackupRecords, type BackupRow } from "@/features/cloud-backup/shared/format";
import { validateRecords } from "@/features/cloud-backup/shared/records";
import {
  decodeJson,
  encodeJson,
  ensureReplica,
  ENTITY_TABLE,
  hashBytes,
  isHash,
  isUuid,
  MAX_REPLICA_BLOB_BYTES,
  replicaBlobPart,
  REPLICA_ENTITIES,
  type ReplicaEntity,
} from "../shared/protocol";
import { ensureReplicaState, replicaWrites } from "./outbox";
import { withReplicaPushLock } from "./push";
import type { ReplicaTransport } from "../client/transport";
import type { ReplicaBlobRow } from "./types";

export interface ReplicaSnapshot {
  writerId: string;
  epoch: number;
  commitSeq: number;
  records: Record<ReplicaEntity, Record<string, unknown>[]>;
  objects: Array<{ attachmentId: string; sha256: string; byteLength: number; objectKey: string }>;
}

export interface RestoredReplica {
  library: LocalLibrary;
  writerId: string;
  warnings: string[];
  commitSeq: number;
}

export interface ReplicaRestoreClient {
  accountId: string;
  transport: ReplicaTransport;
  assertCurrent?: () => Promise<void>;
}

type Image = ReplicaSnapshot["objects"][number] & { blobType: string };
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const isSequence = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function validateSnapshot(value: unknown): { snapshot: ReplicaSnapshot; records: BackupRecords; images: Map<string, Image>; bytes: number } {
  ensureReplica(isObject(value) && isUuid(value.writerId) && isSequence(value.epoch) && value.epoch > 0 && isSequence(value.commitSeq), "invalid_snapshot");
  ensureReplica(isObject(value.records) && Object.keys(value.records).length === REPLICA_ENTITIES.length, "invalid_snapshot");
  for (const entity of REPLICA_ENTITIES) ensureReplica(Object.hasOwn(value.records, entity) && Array.isArray(value.records[entity]), "invalid_snapshot");
  ensureReplica(Array.isArray(value.objects) && value.objects.length <= LIMITS.files, "invalid_snapshot");
  // Own an immutable JSON copy throughout asynchronous downloads. This also rejects
  // values that JSON.stringify would silently discard or normalize.
  const json = encodeJson(value);
  let bytes = new TextEncoder().encode(json).byteLength;
  ensureReplica(bytes <= LIMITS.json, "capacity");
  const snapshot = decodeJson(json) as unknown as ReplicaSnapshot;
  const records = emptyRecords();
  const attachments = new Map<string, { sha256: string; byteLength: number; blobType: string }>();
  for (const entity of REPLICA_ENTITIES) {
    records[ENTITY_TABLE[entity]] = snapshot.records[entity].map((row) => {
      ensureReplica(isObject(row), "invalid_snapshot");
      if (entity !== "attachment") return row as BackupRow;
      ensureReplica(isId(row.id) && !attachments.has(row.id), "duplicate_id");
      ensureReplica(isHash(row.sha256) && isSequence(row.byteLength) && row.byteLength <= MAX_REPLICA_BLOB_BYTES, "invalid_image");
      ensureReplica(typeof row.mimeType === "string", "invalid_image");
      const suppliedType = Object.hasOwn(row, "blobType");
      ensureReplica(!suppliedType || (typeof row.blobType === "string" && row.blobType.length <= 255), "invalid_image");
      const type = suppliedType ? row.blobType as string : row.mimeType;
      const blobType = new Blob([], { type }).type;
      ensureReplica(!suppliedType || blobType === type, "invalid_image");
      attachments.set(row.id, { sha256: row.sha256, byteLength: row.byteLength, blobType });
      return Object.fromEntries(Object.entries(row).filter(([key]) => !["sha256", "byteLength", "blobType"].includes(key))) as BackupRow;
    });
  }
  ensureReplica(TABLE_NAMES.reduce((count, name) => count + records[name].length, 0) <= LIMITS.records, "record_limit");
  // The archive validator checks stored review links and candidates without replaying
  // commands, refreshing fingerprints, or rewriting stale/deleted history.
  ensureReplica(validateRecords(records).length === 0, "restore_graph");
  ensureReplica(snapshot.objects.length === attachments.size, "missing_image");
  const images = new Map<string, Image>();
  const objectKeys = new Set<string>();
  for (const object of snapshot.objects) {
    ensureReplica(isObject(object) && isId(object.attachmentId) && isHash(object.sha256) && isSequence(object.byteLength), "invalid_image");
    ensureReplica(typeof object.objectKey === "string" && object.objectKey.length > 0 && object.objectKey.length <= 4096, "invalid_image");
    ensureReplica(!images.has(object.attachmentId) && !objectKeys.has(object.objectKey), "duplicate_object");
    const attachment = attachments.get(object.attachmentId);
    ensureReplica(attachment && attachment.sha256 === object.sha256 && attachment.byteLength === object.byteLength, "image_manifest_mismatch");
    images.set(object.attachmentId, { ...object, blobType: attachment.blobType });
    objectKeys.add(object.objectKey);
    bytes += object.byteLength;
    ensureReplica(bytes <= LIMITS.archive, "capacity");
  }
  return { snapshot, records, images, bytes };
}

/** Only writes a fresh isolated database; never opens the working library or control context. */
export async function restoreReplicaSnapshot(
  input: ReplicaSnapshot,
  transport: ReplicaTransport,
  accountId: string,
): Promise<{ databaseName: string; writerId: string; warnings: string[] }> {
  ensureReplica(isUuid(accountId), "account_mismatch");
  const { snapshot, records, images, bytes: requiredBytes } = validateSnapshot(input);
  await ensureCapacity(requiredBytes);
  const blobs = new Map<string, Blob>();
  for (const image of images.values()) {
    const download = await transport.request<{ url: string; bytes: number; sha256: string }>("attachments/downloads", {
      attachmentId: image.attachmentId,
      sha256: image.sha256,
    });
    ensureReplica(isObject(download) && typeof download.url === "string" && download.url.length > 0
      && download.bytes === image.byteLength && download.sha256 === image.sha256, "image_manifest_mismatch");
    const bytes = await transport.download(download.url);
    ensureReplica(bytes instanceof Uint8Array && bytes.byteLength === image.byteLength && await hashBytes(bytes) === image.sha256, "part_checksum");
    blobs.set(image.attachmentId, new Blob([replicaBlobPart(bytes)], { type: image.blobType }));
  }

  const databaseName = `life-restore-${crypto.randomUUID()}`;
  ensureReplica(!(await LifeDatabase.exists(databaseName)), "restore_target_exists");
  const database = new LifeDatabase(databaseName);
  let created = false;
  database.on("populate", () => { created = true; });
  try {
    await database.open();
    // Also protect a pre-existing target that appeared between exists() and open().
    ensureReplica(created, "restore_target_exists");
    const verifiedAt = new Date().toISOString();
    const verifiedBlobs: ReplicaBlobRow[] = [...images.values()].map(({ attachmentId, sha256, byteLength, objectKey }) => ({
      attachmentId, sha256, byteLength, objectKey, status: "verified", verifiedAt,
    }));
    const state = await database.transaction("rw", replicaWrites(database, ...TABLE_NAMES.map((name) => database.table(name))), async () => {
      for (const name of TABLE_NAMES) {
        const rows = name === "attachments" ? records[name].map((row) => ({ ...row, blob: blobs.get(row.id)! })) : records[name];
        for (let index = 0; index < rows.length; index += 250) await database.table(name).bulkAdd(rows.slice(index, index + 250));
      }
      const state = {
        ...await ensureReplicaState(database),
        accountId,
        backfillComplete: true,
        lastCommitSeq: snapshot.commitSeq,
      };
      await database.replicaState.put(state);
      if (verifiedBlobs.length) await database.replicaBlobs.bulkAdd(verifiedBlobs);
      return state;
    });
    for (const name of TABLE_NAMES) {
      const restored: BackupRow[] = await database.table(name).toArray();
      ensureReplica(restored.length === records[name].length, "restore_readback");
      const expected = new Map(records[name].map((row) => [row.id, row]));
      for (const row of restored) {
        ensureReplica(expected.has(row.id), "restore_readback");
        if (name === "attachments") {
          const { blob, ...metadata } = row;
          const image = images.get(row.id)!;
          ensureReplica(blob instanceof Blob && blob.type === image.blobType && blob.size === image.byteLength
            && await hashBytes(new Uint8Array(await blob.arrayBuffer())) === image.sha256, "restore_image");
          ensureReplica(encodeJson(metadata) === encodeJson(expected.get(row.id)), "restore_readback");
        } else ensureReplica(encodeJson(row) === encodeJson(expected.get(row.id)), "restore_readback");
      }
    }
    ensureReplica(encodeJson(await database.replicaState.get("current")) === encodeJson(state), "restore_readback");
    const restoredBlobs = await database.replicaBlobs.toArray();
    const expectedBlobs = new Map(verifiedBlobs.map((row) => [row.attachmentId, row]));
    ensureReplica(restoredBlobs.length === verifiedBlobs.length && await database.replicaMutations.count() === 0, "restore_readback");
    for (const row of restoredBlobs) ensureReplica(encodeJson(row) === encodeJson(expectedBlobs.get(row.attachmentId)), "restore_readback");
    return { databaseName, writerId: state.writerId, warnings: [] };
  } catch (error) {
    database.close();
    if (created) await LifeDatabase.delete(databaseName);
    throw error;
  } finally {
    database.close();
  }
}

async function restoreContext(accountId: string, expected?: LocalContext): Promise<LocalContext> {
  const context = await control.settings.get("context");
  ensureReplica(context?.account?.id === accountId && !context.logoutPending, "account_mismatch");
  const active = await control.libraries.get(context.activeLibraryId);
  ensureReplica(active?.ready && (active.accountId === null || active.accountId === accountId), "account_mismatch");
  ensureReplica(!expected || (context.activeLibraryId === expected.activeLibraryId && context.installationId === expected.installationId), "account_mismatch");
  return context;
}

export async function restoreReplicaFromCloud(
  transport: ReplicaTransport,
  accountId: string,
  assertCurrent?: () => Promise<void>,
): Promise<RestoredReplica> {
  await assertCurrent?.();
  const context = await restoreContext(accountId);
  const snapshot = await transport.request<ReplicaSnapshot>("snapshot");
  const commitSeq = snapshot?.commitSeq;
  const restored = await restoreReplicaSnapshot(snapshot, transport, accountId);
  try {
    await assertCurrent?.();
    const library = await control.transaction("rw", control.settings, control.libraries, async () => {
      await restoreContext(accountId, context);
      return registerReplicaRestoredLibrary(restored.databaseName, accountId, commitSeq);
    });
    return { library, writerId: restored.writerId, warnings: [], commitSeq };
  } catch (error) {
    // This name belongs only to this successful-but-unregistered restoration.
    await LifeDatabase.delete(restored.databaseName);
    throw error;
  }
}

/** Explicit activation only: acquire the context lock before any writer promotion. */
export async function activateRestoredReplica(
  restored: Pick<RestoredReplica, "library" | "writerId" | "commitSeq">,
  client: ReplicaRestoreClient,
): Promise<LocalLibrary> {
  return exclusiveLibrary(async () => {
    const context = await restoreContext(client.accountId);
    const active = (await control.libraries.get(context.activeLibraryId))!;
    // Wait out the old writer before promotion. The lock needs only its name and
    // never opens the current working database.
    return withReplicaPushLock({ name: active.databaseName }, async () => {
      await client.assertCurrent?.();
      await restoreContext(client.accountId, context);
      const library = await control.libraries.get(restored.library.id);
      ensureReplica(library?.ready && library.accountId === client.accountId
        && library.databaseName === restored.library.databaseName && library.databaseName.startsWith("life-restore-")
        && library.id !== context.activeLibraryId && library.restoredFrom === `replica:${restored.commitSeq}`
        && isUuid(restored.writerId) && isSequence(restored.commitSeq), "restore_target_mismatch");
      ensureReplica(active.databaseName !== library.databaseName && await LifeDatabase.exists(library.databaseName), "restore_target_mismatch");
      const database = new LifeDatabase(library.databaseName);
      try {
        await database.open();
        const state = await database.replicaState.get("current");
        ensureReplica(state && state.accountId === client.accountId && state.writerId === restored.writerId
          && state.backfillComplete && !state.fenced && state.lastCommitSeq === restored.commitSeq
          && await database.replicaMutations.count() === 0, "restore_target_mismatch");
        const writer = await client.transport.request<{ writerId: string; epoch: number; fenced: boolean; headCommitSeq: number }>("writers/promote", {
          writerId: restored.writerId,
          libraryId: library.id,
          installationId: context.installationId,
          expectedCommitSeq: restored.commitSeq,
        });
        ensureReplica(isObject(writer) && writer.writerId === restored.writerId && isSequence(writer.epoch) && writer.epoch > 0
          && writer.fenced === false && writer.headCommitSeq === restored.commitSeq, "invalid_writer");
        await client.assertCurrent?.();
        await restoreContext(client.accountId, context);
        await database.transaction("rw", database.replicaState, database.replicaMutations, async () => {
          ensureReplica(encodeJson(await database.replicaState.get("current")) === encodeJson(state)
            && await database.replicaMutations.count() === 0, "restore_target_mismatch");
          await database.replicaState.put({
            ...state,
            accountId: client.accountId,
            epoch: writer.epoch,
            lastCommitSeq: writer.headCommitSeq,
            fenced: false,
            lastSyncedAt: new Date().toISOString(),
            lastError: null,
            pausedReason: null,
          });
        });
        const activated = await control.transaction("rw", control.settings, control.libraries, async () => {
          await restoreContext(client.accountId, context);
          const current = await control.libraries.get(library.id);
          ensureReplica(encodeJson(current) === encodeJson(library), "restore_target_mismatch");
          return activateLibrary(library.id);
        });
        database.close();
        reloadLibrary(activated);
        return activated;
      } finally {
        database.close();
      }
    });
  });
}
