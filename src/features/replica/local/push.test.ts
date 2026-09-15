// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMoment, createMomentWithAttachments } from "@/features/moment/repository/moment-repository";
import { db } from "@/lib/db/client";

import type { ReplicaTransport } from "../client/transport";
import { ReplicaError } from "../shared/protocol";
import { ensureReplicaState, pendingReplicaCount } from "./outbox";
import { pushReplica, resetReplicaPushLock } from "./push";

async function reset() {
  resetReplicaPushLock();
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
}

function client(transport: Pick<ReplicaTransport, "request"> & Partial<ReplicaTransport>): () => Promise<{ accountId: string; transport: ReplicaTransport }> {
  return async () => ({
    accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    transport: {
      put: vi.fn(async () => {}),
      download: vi.fn(async () => new Uint8Array()),
      ...transport,
    } as ReplicaTransport,
  });
}

beforeEach(reset);
afterEach(reset);

describe("replica push retry and fencing", () => {
  it("acks a mutation and keeps local records when a later push fails", async () => {
    await createMoment({ id: "m1", originalText: "hello", createdAt: "2026-09-15T00:00:00.000Z" });
    const request = vi.fn(async (path: string, body?: { mutationId?: string }) => {
      if (path === "writers/register") {
        const state = await ensureReplicaState(db);
        return { writerId: state.writerId, epoch: 1, fenced: false, headCommitSeq: 0 };
      }
      if (path === "mutations") return { mutationId: body?.mutationId, commitSeq: 1, epoch: 1 };
      throw new ReplicaError("cloud_unavailable");
    });
    await pushReplica(db, client({ request: request as ReplicaTransport["request"] }));
    expect(await pendingReplicaCount(db)).toBe(0);
    expect((await db.moments.get("m1"))?.originalText).toBe("hello");

    await createMoment({ id: "m2", originalText: "offline", createdAt: "2026-09-15T00:01:00.000Z" });
    const failing = vi.fn(async (path: string) => {
      if (path === "mutations") throw new ReplicaError("network");
      const state = await ensureReplicaState(db);
      return { writerId: state.writerId, epoch: 1, fenced: false, headCommitSeq: 1 };
    });
    await pushReplica(db, client({ request: failing as ReplicaTransport["request"] }));
    expect((await db.moments.get("m2"))?.originalText).toBe("offline");
    expect(await pendingReplicaCount(db)).toBe(1);
    const pending = await db.replicaMutations.where("status").equals("pending").first();
    expect(pending?.lastError).toBe("network");
    expect(pending?.attemptCount).toBe(1);
  });

  it("treats a repeated mutation receipt as idempotent", async () => {
    await createMoment({ id: "m1", originalText: "hello", createdAt: "2026-09-15T00:00:00.000Z" });
    let mutationCalls = 0;
    const request = vi.fn(async (path: string, body?: { mutationId?: string }) => {
      if (path === "writers/register") {
        const state = await ensureReplicaState(db);
        return { writerId: state.writerId, epoch: 1, fenced: false, headCommitSeq: 0 };
      }
      if (path === "mutations") {
        mutationCalls += 1;
        return { mutationId: body?.mutationId, commitSeq: 1, epoch: 1 };
      }
      throw new ReplicaError("cloud_unavailable");
    });
    await pushReplica(db, client({ request: request as ReplicaTransport["request"] }));
    const mutation = await db.replicaMutations.toCollection().first();
    expect(mutation?.status).toBe("acked");
    await db.replicaMutations.put({ ...mutation!, status: "pending", nextRetryAt: mutation!.createdAt });
    resetReplicaPushLock();
    await pushReplica(db, client({ request: request as ReplicaTransport["request"] }));
    expect(mutationCalls).toBe(2);
    expect(await pendingReplicaCount(db)).toBe(0);
    expect(await db.moments.count()).toBe(1);
  });

  it("marks the local writer fenced without deleting local records", async () => {
    await createMoment({ id: "m1", originalText: "keep", createdAt: "2026-09-15T00:00:00.000Z" });
    const request = vi.fn(async (path: string) => {
      if (path === "writers/register") throw new ReplicaError("fenced");
      throw new ReplicaError("cloud_unavailable");
    });
    await pushReplica(db, client({ request: request as ReplicaTransport["request"] }));
    expect((await ensureReplicaState(db)).fenced).toBe(true);
    expect((await db.moments.get("m1"))?.originalText).toBe("keep");
    expect(await pendingReplicaCount(db)).toBe(1);
  });

  it("uploads an attachment blob before acking the mutation", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await createMomentWithAttachments({
      id: "m3",
      originalText: "with image",
      createdAt: "2026-09-15T00:00:00.000Z",
      attachments: [{ id: "img-1", blob: new Blob([bytes], { type: "image/png" }), fileName: "a.png", mimeType: "image/png" }],
    });
    const put = vi.fn(async () => {});
    const request = vi.fn(async (path: string, body?: { mutationId?: string }) => {
      if (path === "writers/register") {
        const state = await ensureReplicaState(db);
        return { writerId: state.writerId, epoch: 1, fenced: false, headCommitSeq: 0 };
      }
      if (path === "attachments/uploads") {
        return { verified: false, objectKey: "dev/replica/acc/img-1/u", url: "https://objects.invalid/x", headers: { "Content-Type": "application/octet-stream" } };
      }
      if (path === "attachments/finalize") return { verified: true, objectKey: "dev/replica/acc/img-1/u" };
      if (path === "mutations") return { mutationId: body?.mutationId, commitSeq: 1, epoch: 1 };
      throw new ReplicaError("cloud_unavailable");
    });
    await pushReplica(db, client({ request: request as ReplicaTransport["request"], put }));
    expect(put).toHaveBeenCalledOnce();
    expect((await db.replicaBlobs.get("img-1"))?.status).toBe("verified");
    expect(await pendingReplicaCount(db)).toBe(0);
  });
});
