import { db, type LifeDatabase } from "@/lib/db/client";
import { isNativeApp } from "@/lib/runtime/platform";
import {
  ensureReplicaBackfill,
  ensureReplicaState,
  listDueReplicaMutations,
  markReplicaAcked,
  markReplicaFenced,
  markReplicaRetry,
  replicaWrites,
} from "./outbox";
import { createReplicaTransport, replicaApiOrigin, type ReplicaTransport } from "../client/transport";
import { readReplicaSession, writeReplicaSession } from "../client/session";
import { ReplicaError, type ReplicaReceipt } from "../shared/protocol";
import type { ReplicaStateRow } from "./types";

export interface ReplicaPushClient {
  transport: ReplicaTransport;
  accountId: string;
}

let pushing = false;

function backoff(attempt: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempt), 3_600_000);
}

async function refreshIfNeeded(): Promise<ReplicaPushClient | null> {
  const origin = replicaApiOrigin();
  if (origin === null) return null;
  if (isNativeApp()) {
    const session = await readReplicaSession();
    if (!session?.accessToken) return null;
    return {
      accountId: session.accountId,
      transport: createReplicaTransport({ origin, accountId: session.accountId, accessToken: session.accessToken, native: true }),
    };
  }
  try {
    const { initializeControl } = await import("@/features/cloud-backup/local/control");
    const { context } = await initializeControl();
    if (!context.account) return null;
    return {
      accountId: context.account.id,
      transport: createReplicaTransport({ origin, accountId: context.account.id, native: false }),
    };
  } catch {
    return null;
  }
}

async function registerWriter(database: LifeDatabase, client: ReplicaPushClient, state: ReplicaStateRow) {
  const writer = await client.transport.request<{ writerId: string; epoch: number; fenced: boolean; headCommitSeq: number }>("writers/register", {
    writerId: state.writerId,
    libraryId: null,
    installationId: null,
  });
  await database.replicaState.put({
    ...state,
    accountId: client.accountId,
    writerId: writer.writerId,
    epoch: writer.epoch,
    fenced: writer.fenced,
    lastCommitSeq: writer.headCommitSeq,
  });
  return writer.epoch;
}

async function uploadBlobs(database: LifeDatabase, client: ReplicaPushClient, attachmentIds: string[]) {
  for (const attachmentId of attachmentIds) {
    const blobRow = await database.replicaBlobs.get(attachmentId);
    if (!blobRow || blobRow.status === "verified") continue;
    if (blobRow.status === "too_large") throw new ReplicaError("blob_too_large", "\u9644\u4ef6\u8d85\u8fc7\u4e91\u526f\u672c\u5355\u6587\u4ef6\u4e0a\u9650\u3002\u672c\u673a\u56fe\u7247\u5df2\u4fdd\u7559\u3002");
    const attachment = await database.attachments.get(attachmentId);
    if (!attachment) continue;
    const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
    const upload = await client.transport.request<{ verified: boolean; objectKey: string; url?: string; headers?: Record<string, string> }>("attachments/uploads", {
      attachmentId,
      sha256: blobRow.sha256,
      byteLength: blobRow.byteLength,
    });
    if (!upload.verified) {
      if (!upload.url || !upload.headers) throw new ReplicaError("upload_interrupted");
      await client.transport.put(upload.url, upload.headers, bytes);
      await client.transport.request("attachments/finalize", {
        objectKey: upload.objectKey,
        sha256: blobRow.sha256,
        byteLength: blobRow.byteLength,
      });
    }
    await database.transaction("rw", replicaWrites(database), async () => {
      await database.replicaBlobs.put({
        ...blobRow,
        objectKey: upload.objectKey,
        status: "verified",
        verifiedAt: new Date().toISOString(),
      });
    });
  }
}

export async function pushReplica(database: LifeDatabase = db, clientFactory: () => Promise<ReplicaPushClient | null> = () => refreshIfNeeded()): Promise<void> {
  if (pushing) return;
  pushing = true;
  try {
    await database.open();
    await ensureReplicaBackfill(database);
    let state = await ensureReplicaState(database);
    if (state.fenced) return;
    const client = await clientFactory();
    if (!client) return;
    if (state.epoch < 1) {
      try {
        await registerWriter(database, client, state);
        state = await ensureReplicaState(database);
      } catch (error) {
        if (error instanceof ReplicaError && error.code === "fenced") {
          await markReplicaFenced(database);
          return;
        }
        throw error;
      }
    }
    const due = await listDueReplicaMutations(database);
    for (const mutation of due) {
      state = await ensureReplicaState(database);
      if (state.fenced) return;
      try {
        const attachmentIds = mutation.payload.ops.filter((op) => op.entity === "attachment").map((op) => op.id);
        await uploadBlobs(database, client, attachmentIds);
        const receipt = await client.transport.request<ReplicaReceipt>("mutations", {
          writerId: state.writerId,
          epoch: state.epoch,
          mutationId: mutation.mutationId,
          createdAt: mutation.payload.createdAt,
          payloadSha256: mutation.payloadSha256,
          ops: mutation.payload.ops,
        });
        await markReplicaAcked(database, mutation.mutationId, receipt.commitSeq);
      } catch (error) {
        const code = error instanceof ReplicaError ? error.code : "cloud_unavailable";
        if (code === "fenced") { await markReplicaFenced(database); return; }
        if (code === "unauthorized") {
          const session = await readReplicaSession();
          if (session?.refreshToken) {
            try {
              const refreshed = await client.transport.request<{ account: { id: string; email: string }; accessToken: string; refreshToken: string; expiresAt?: number }>("auth/refresh", { refreshToken: session.refreshToken });
              await writeReplicaSession({
                accountId: refreshed.account.id,
                email: refreshed.account.email,
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                expiresAt: refreshed.expiresAt,
              });
            } catch { /* stay pending; local records remain */ }
          }
          await markReplicaRetry(database, mutation.mutationId, code, backoff(mutation.attemptCount));
          return;
        }
        await markReplicaRetry(database, mutation.mutationId, code, backoff(mutation.attemptCount));
        if (code === "writer_exists") return;
      }
    }
  } catch {
    // Replica push is fail-open. Local records already committed.
  } finally {
    pushing = false;
  }
}

export function resetReplicaPushLock(): void {
  pushing = false;
}
