import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { control, initializeControl, setLocalAccount } from "@/features/cloud-backup/local/control";
import { createMoment, createMomentWithAttachments } from "@/features/moment/repository/moment-repository";
import { db } from "@/lib/db/client";
import { writeReplicaSession } from "../client/session";
import { claimLibraryForReplica, pushReplica, getReplicaSyncStatus } from "./push";

const native = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/lib/runtime/platform", () => ({ isNativeApp: () => native(), hostedApiOrigin: () => native() ? "https://life.example" : "" }));
const fetcher = vi.fn();
const accountA = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "a@test" };
const accountB = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "b@test" };

beforeEach(async () => {
  localStorage.clear(); native.mockReturnValue(false); fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("Blob", NodeBlob);
  await control.delete(); await control.open(); await initializeControl();
  await db.delete(); await db.open();
});
afterEach(async () => { await db.delete(); await control.delete(); localStorage.clear(); vi.unstubAllGlobals(); });

describe("production account/library outbox isolation", () => {
  it("keeps first anonymous login unclaimed with zero network until explicit consent", async () => {
    await createMoment({ id: "guest", originalText: "anonymous local record" });
    await setLocalAccount(accountA);
    await pushReplica();
    expect(fetcher).not.toHaveBeenCalled();
    expect((await getReplicaSyncStatus()).pausedReason).toBe("claim_required");
    await claimLibraryForReplica(accountA.id);
    expect((await initializeControl()).library.accountId).toBe(accountA.id);
    expect((await db.replicaState.get("current"))?.accountId).toBe(accountA.id);
    fetcher.mockImplementation(async (_url: string, options: RequestInit) => {
      const payload = JSON.parse(String(options.body));
      return Response.json(payload.mutationId ? { mutationId: payload.mutationId, commitSeq: 1, epoch: 1 }
        : { writerId: payload.writerId, epoch: 1, fenced: false, headCommitSeq: 0 });
    });
    await pushReplica();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await getReplicaSyncStatus()).pending).toBe(0);
  });

  it.each([false, true])("A pending -> logout -> B makes zero requests from the old document native=%s", async (isNative) => {
    native.mockReturnValue(isNative);
    await createMoment({ id: "private-A", originalText: "private A" });
    await setLocalAccount(accountA);
    await claimLibraryForReplica(accountA.id);
    await setLocalAccount(null, true);
    await setLocalAccount(accountB);
    await writeReplicaSession({ accountId: accountB.id, email: accountB.email, accessToken: "b".repeat(64), authMode: "test-password", expiresAt: Date.now() + 3600_000 });
    await pushReplica();
    expect(fetcher).not.toHaveBeenCalled();
    expect((await db.replicaState.get("current"))?.accountId).toBe(accountA.id);
    expect((await db.replicaMutations.toArray())[0]).toMatchObject({ status: "pending", attemptCount: 0 });
    expect((await db.moments.get("private-A"))?.originalText).toBe("private A");
  });

  it("rejects an inconsistent sidecar owner without resetting it or binding the library", async () => {
    await createMoment({ id: "private-B", originalText: "B" });
    await db.replicaState.update("current", { accountId: accountB.id });
    await setLocalAccount(accountA);
    await expect(claimLibraryForReplica(accountA.id)).rejects.toMatchObject({ code: "account_changed" });
    expect((await initializeControl()).library.accountId).toBeNull();
    expect((await db.replicaState.get("current"))?.accountId).toBe(accountB.id);
    await pushReplica();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["attachments/uploads", "put", "attachments/finalize", "mutations"])("rechecks scope after %s before further I/O or ack", async (switchAt) => {
    await createMomentWithAttachments({ id: "photo", originalText: "private image", attachments: [{ id: "image", blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), fileName: "image.png", mimeType: "image/png" }] });
    await setLocalAccount(accountA); await claimLibraryForReplica(accountA.id);
    await db.replicaState.update("current", { epoch: 1 });
    const sent: string[] = [];
    fetcher.mockImplementation(async (url: string, options: RequestInit) => {
      const path = options.method === "PUT" ? "put" : url.replace("/api/replica/", "");
      sent.push(path);
      if (path === switchAt) { await setLocalAccount(null); await setLocalAccount(accountB); }
      if (path === "attachments/uploads") return Response.json({ verified: false, objectKey: "synthetic/image", url: "https://objects.invalid/upload", headers: {} });
      if (path === "put") return new Response(null, { status: 200 });
      if (path === "attachments/finalize") return Response.json({ verified: true });
      const payload = JSON.parse(String(options.body));
      return Response.json({ mutationId: payload.mutationId, commitSeq: 1, epoch: 1 });
    });
    await pushReplica();
    const all = ["attachments/uploads", "put", "attachments/finalize", "mutations"];
    expect(sent).toEqual(all.slice(0, all.indexOf(switchAt) + 1));
    expect((await db.replicaMutations.toArray())[0]).toMatchObject({ status: "pending", attemptCount: 0 });
    expect((await db.replicaState.get("current"))?.lastSyncedAt).toBeNull();
  });
});
