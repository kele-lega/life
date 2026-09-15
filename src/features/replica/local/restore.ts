import { LifeDatabase } from "@/lib/db/client";
import { registerReplicaRestoredLibrary, type LocalLibrary } from "@/features/cloud-backup/local/control";
import { encodeJson, ENTITY_TABLE, hashBytes, replicaBlobPart, ReplicaError, type ReplicaEntity } from "../shared/protocol";
import { ensureReplicaState, replicaWrites } from "./outbox";
import type { ReplicaTransport } from "../client/transport";

export interface ReplicaSnapshot {
  writerId: string;
  epoch: number;
  commitSeq: number;
  records: Record<ReplicaEntity, Record<string, unknown>[]>;
  objects: Array<{ attachmentId: string; sha256: string; byteLength: number; objectKey: string }>;
}

export async function restoreReplicaSnapshot(
  snapshot: ReplicaSnapshot,
  transport: ReplicaTransport,
  accountId: string,
): Promise<{ databaseName: string; writerId: string; warnings: string[] }> {
  const databaseName = `life-restore-${crypto.randomUUID()}`;
  if (await LifeDatabase.exists(databaseName)) throw new ReplicaError("restore_target_exists");
  const database = new LifeDatabase(databaseName);
  const warnings: string[] = [];
  try {
    await database.open();
    const blobs = new Map<string, Blob>();
    for (const object of snapshot.objects) {
      try {
        const download = await transport.request<{ url: string; bytes: number; sha256: string }>("attachments/downloads", {
          attachmentId: object.attachmentId,
          sha256: object.sha256,
        });
        const bytes = await transport.download(download.url);
        if (bytes.byteLength !== object.byteLength || await hashBytes(bytes) !== object.sha256) throw new ReplicaError("part_checksum");
        const attachment = snapshot.records.attachment.find((row) => row.id === object.attachmentId);
        const mime = typeof attachment?.mimeType === "string" ? attachment.mimeType : "application/octet-stream";
        blobs.set(object.attachmentId, new Blob([replicaBlobPart(bytes)], { type: mime }));
      } catch {
        warnings.push(object.attachmentId);
      }
    }
    const tables = ENTITY_TABLE;
    await database.transaction("rw", replicaWrites(database, ...Object.values(tables).map((name) => database.table(name))), async () => {
      for (const entity of Object.keys(tables) as ReplicaEntity[]) {
        const rows = snapshot.records[entity] ?? [];
        if (entity === "attachment") {
          const withBlobs = [];
          for (const row of rows) {
            const blob = blobs.get(String(row.id));
            if (!blob) { warnings.push(String(row.id)); continue; }
            const metadata = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "sha256" && key !== "byteLength"));
            withBlobs.push({ ...metadata, blob });
          }
          if (withBlobs.length) await database.attachments.bulkAdd(withBlobs as never);
          continue;
        }
        if (rows.length) await database.table(tables[entity]).bulkAdd(rows);
      }
      const state = await ensureReplicaState(database);
      await database.replicaState.put({
        ...state,
        accountId,
        backfillComplete: true,
        lastCommitSeq: snapshot.commitSeq,
        fenced: false,
      });
    });
    for (const entity of Object.keys(tables) as ReplicaEntity[]) {
      const restored = await database.table(tables[entity]).toArray() as Array<Record<string, unknown> & { id: string }>;
      if (entity === "attachment") {
        const expected = new Map((snapshot.records.attachment ?? []).map((row) => [String(row.id), row]));
        for (const row of restored) {
          const original = expected.get(row.id);
          if (!original) throw new ReplicaError("restore_readback");
          const blob = (row as { blob?: { arrayBuffer: () => Promise<ArrayBuffer> } }).blob;
          if (!blob || typeof blob.arrayBuffer !== "function") throw new ReplicaError("restore_image");
          if (await hashBytes(new Uint8Array(await blob.arrayBuffer())) !== String(original.sha256)) {
            throw new ReplicaError("restore_image");
          }
        }
        continue;
      }
      const expected = new Map((snapshot.records[entity] ?? []).map((row) => [String(row.id), row]));
      if (restored.length !== expected.size) throw new ReplicaError("restore_readback");
      for (const row of restored) {
        if (encodeJson(row) !== encodeJson(expected.get(row.id))) throw new ReplicaError("restore_readback");
      }
    }
    const writerId = (await ensureReplicaState(database)).writerId;
    database.close();
    return { databaseName, writerId, warnings: [...new Set(warnings)] };
  } catch (error) {
    database.close();
    await LifeDatabase.delete(databaseName);
    throw error;
  }
}

export async function restoreReplicaFromCloud(
  transport: ReplicaTransport,
  accountId: string,
): Promise<{ library: LocalLibrary; writerId: string; warnings: string[]; commitSeq: number }> {
  const snapshot = await transport.request<ReplicaSnapshot>("snapshot");
  const restored = await restoreReplicaSnapshot(snapshot, transport, accountId);
  const library = await registerReplicaRestoredLibrary(restored.databaseName, accountId, snapshot.commitSeq);
  return { library, writerId: restored.writerId, warnings: restored.warnings, commitSeq: snapshot.commitSeq };
}
