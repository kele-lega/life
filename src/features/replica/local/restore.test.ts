// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { control, type LocalContext, type LocalLibrary } from "@/features/cloud-backup/local/control";
import { encodeJson, TABLE_NAMES } from "@/features/cloud-backup/shared/format";
import { seedBackupFixture } from "@/features/cloud-backup/test/fixture";
import { db, LifeDatabase } from "@/lib/db/client";

import type { ReplicaTransport } from "../client/transport";
import { ENTITY_TABLE, hashBytes, ReplicaError, REPLICA_ENTITIES } from "../shared/protocol";
import { withReplicaPushLock } from "./push";
import { activateRestoredReplica, restoreReplicaFromCloud, restoreReplicaSnapshot, type ReplicaSnapshot } from "./restore";

const lock = vi.hoisted(() => ({ unavailable: false, events: [] as string[] }));
vi.mock("@/features/cloud-backup/local/control", async (original) => {
  const actual = await original<typeof import("@/features/cloud-backup/local/control")>();
  return {
    ...actual,
    exclusiveLibrary: vi.fn(async (work: () => Promise<unknown>) => {
      lock.events.push("exclusive");
      if (lock.unavailable) throw new Error("other_tabs");
      return work();
    }),
    reloadLibrary: vi.fn(() => { lock.events.push("reload"); }),
  };
});

const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ACCOUNT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SOURCE_WRITER = "11111111-1111-4111-8111-111111111111";
const databases: LifeDatabase[] = [];
const estimate = vi.fn(async () => ({ quota: 1024 * 1024 * 1024, usage: 0 }));
function newDatabase(name = `test-replica-${crypto.randomUUID()}`) {
  const database = new LifeDatabase(name);
  databases.push(database);
  return database;
}

beforeEach(() => {
  lock.unavailable = false;
  lock.events.length = 0;
  estimate.mockReset().mockResolvedValue({ quota: 1024 * 1024 * 1024, usage: 0 });
  vi.stubGlobal("navigator", { storage: { estimate } });
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const database of databases.splice(0)) {
    database.close();
    await LifeDatabase.delete(database.name);
  }
  control.close();
  await control.delete();
  vi.unstubAllGlobals();
});

async function fixture() {
  const original = newDatabase();
  await seedBackupFixture(original);
  const records = {} as ReplicaSnapshot["records"];
  const images = new Map<string, Uint8Array>();
  const objects: ReplicaSnapshot["objects"] = [];
  for (const entity of REPLICA_ENTITIES) {
    records[entity] = [];
    for (const row of await original.table(ENTITY_TABLE[entity]).toArray()) {
      if (entity !== "attachment") {
        records[entity].push(row);
      } else {
        const { blob, ...metadata } = row;
        const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
        const sha256 = await hashBytes(bytes);
        records[entity].push({ ...metadata, sha256, byteLength: bytes.byteLength, blobType: (blob as Blob).type });
        objects.push({ attachmentId: row.id, sha256, byteLength: bytes.byteLength, objectKey: `test/replica/${ACCOUNT}/${row.id}/object` });
        images.set(row.id, bytes);
      }
    }
  }
  const snapshot: ReplicaSnapshot = { writerId: SOURCE_WRITER, epoch: 2, commitSeq: 4, records, objects };
  const transport = {
    request: vi.fn(async (path: string, body?: unknown) => {
      if (path === "snapshot") return snapshot;
      if (path === "attachments/downloads") {
        const image = objects.find(({ attachmentId }) => attachmentId === (body as { attachmentId: string }).attachmentId)!;
        return { url: `https://objects.invalid/${image.attachmentId}`, bytes: image.byteLength, sha256: image.sha256 };
      }
      if (path === "writers/promote") {
        lock.events.push("promote");
        return { writerId: (body as { writerId: string }).writerId, epoch: 3, fenced: false, headCommitSeq: snapshot.commitSeq };
      }
      throw new Error(path);
    }),
    put: vi.fn(async () => {}),
    download: vi.fn(async (url: string) => images.get(new URL(url).pathname.slice(1))!),
  } as ReplicaTransport;
  return { original, snapshot, transport, images };
}

async function contextFor(database: LifeDatabase, accountId = ACCOUNT) {
  await control.open();
  const library: LocalLibrary = { id: crypto.randomUUID(), databaseName: database.name, accountId, createdAt: "2026-09-17T00:00:00.000Z", ready: true };
  const context: LocalContext = { key: "context", activeLibraryId: library.id, installationId: crypto.randomUUID(), account: { id: accountId, email: "test@example.invalid" }, logoutPending: false };
  await control.libraries.add(library);
  await control.settings.put(context);
  return { library, context };
}

async function exactBusiness(database: LifeDatabase) {
  const result: Record<string, unknown[]> = {};
  for (const name of TABLE_NAMES) {
    result[name] = [];
    for (const row of await database.table(name).toArray()) {
      if (name === "attachments") {
        const { blob, ...metadata } = row;
        result[name].push({ ...metadata, blobType: blob.type, blobBytes: [...new Uint8Array(await blob.arrayBuffer())] });
      } else result[name].push(row);
    }
  }
  return result;
}

async function fromCloud(f: Awaited<ReturnType<typeof fixture>>) {
  const restored = await restoreReplicaFromCloud(f.transport, ACCOUNT);
  const database = newDatabase(restored.library.databaseName);
  return { restored, database };
}

describe("strict replica disaster restore", () => {
  it("preserves every entity, review state, tombstone, original field and Blob while the populated working library is untouched", async () => {
    const { original, snapshot, transport } = await fixture();
    const before = await exactBusiness(original);
    const workingOpen = vi.spyOn(db, "open");
    const restored = await restoreReplicaSnapshot(snapshot, transport, ACCOUNT);
    const isolated = newDatabase(restored.databaseName);
    expect(restored.databaseName).toMatch(/^life-restore-/);
    expect(restored.writerId).not.toBe(SOURCE_WRITER);
    expect(restored.warnings).toEqual([]);
    expect(workingOpen).not.toHaveBeenCalled();
    expect(await LifeDatabase.exists("life-control")).toBe(false);
    expect(await exactBusiness(isolated)).toEqual(before);
    expect(await exactBusiness(original)).toEqual(before);
    expect((await isolated.lifeEventProposals.toArray()).map(({ status }) => status)).toEqual(expect.arrayContaining(["pending", "accepted", "corrected", "rejected", "superseded"]));
    expect((await isolated.lifeEvents.get("event-record"))?.source?.contentFingerprint).toBe(`sha256:text-v1:${"0".repeat(64)}`);
    expect((await isolated.lifeExtractionJobs.get("job-one"))?.input).toMatchObject({ contentFingerprint: "original-fingerprint" });
    const image = (await isolated.attachments.get("image-one"))!;
    expect(image.blob.type).toBe("image/jpeg");
    expect(image.mimeType).toBe("image/png");
    expect(image.size).toBe(999);
    expect(image.deletedAt).not.toBeNull();
    for (const field of ["sha256", "byteLength", "blobType"]) expect(image).not.toHaveProperty(field);
    expect(await isolated.replicaState.get("current")).toMatchObject({
      id: "current", writerId: restored.writerId, epoch: 0, accountId: ACCOUNT,
      lastAckedMutationId: null, lastCommitSeq: snapshot.commitSeq, fenced: false, backfillComplete: true,
    });
    expect(await isolated.replicaMutations.count()).toBe(0);
    expect(await isolated.replicaBlobs.toArray()).toEqual([expect.objectContaining({
      ...snapshot.objects[0], status: "verified", verifiedAt: expect.any(String),
    })]);
    expect(estimate).toHaveBeenCalledOnce();
  });

  it("always creates an independent library for an empty snapshot without opening the working library", async () => {
    const { snapshot, transport } = await fixture();
    for (const entity of REPLICA_ENTITIES) snapshot.records[entity] = [];
    snapshot.objects = [];
    snapshot.commitSeq = 0;
    const workingOpen = vi.spyOn(db, "open");
    const first = await restoreReplicaSnapshot(snapshot, transport, ACCOUNT);
    const second = await restoreReplicaSnapshot(snapshot, transport, ACCOUNT);
    expect(first.databaseName).not.toBe(second.databaseName);
    for (const restored of [first, second]) {
      const isolated = newDatabase(restored.databaseName);
      for (const name of TABLE_NAMES) expect(await isolated.table(name).count()).toBe(0);
    }
    expect(workingOpen).not.toHaveBeenCalled();
    expect(transport.request).not.toHaveBeenCalled();
  });

  it.each([undefined, ""])("preserves old snapshot MIME fallback or explicitly empty Blob MIME (%s)", async (blobType) => {
    const { snapshot, transport } = await fixture();
    if (blobType === undefined) delete snapshot.records.attachment[0].blobType;
    else snapshot.records.attachment[0].blobType = blobType;
    const restored = await restoreReplicaSnapshot(snapshot, transport, ACCOUNT);
    const image = (await newDatabase(restored.databaseName).attachments.get("image-one"))!;
    expect(image.blob.type).toBe(blobType ?? "image/png");
    expect(image.mimeType).toBe("image/png");
  });

  it.each(REPLICA_ENTITIES)("rejects an absent %s array before downloading or creating any target", async (entity) => {
    const { snapshot, transport } = await fixture();
    delete (snapshot.records as Partial<ReplicaSnapshot["records"]>)[entity];
    const before = await LifeDatabase.getDatabaseNames();
    await expect(restoreReplicaSnapshot(snapshot, transport, ACCOUNT)).rejects.toMatchObject({ code: "invalid_snapshot" });
    expect(transport.request).not.toHaveBeenCalled();
    expect(await LifeDatabase.getDatabaseNames()).toEqual(before);
  });

  const invalid: Array<[string, (snapshot: ReplicaSnapshot) => void]> = [
    ["null snapshot", () => {}],
    ["invalid writer", (s) => { s.writerId = "writer"; }],
    ["invalid epoch", (s) => { s.epoch = 0; }],
    ["fractional sequence", (s) => { s.commitSeq = 1.5; }],
    ["negative sequence", (s) => { s.commitSeq = -1; }],
    ["non-array table", (s) => { s.records.diary = null as never; }],
    ["duplicate record ID", (s) => { s.records.moment.push(s.records.moment[0]); }],
    ["duplicate attachment ID", (s) => { s.records.attachment.push(s.records.attachment[0]); }],
    ["duplicate object", (s) => { s.objects.push(s.objects[0]); }],
    ["missing object", (s) => { s.objects = []; }],
    ["extra object", (s) => { s.objects.push({ ...s.objects[0], attachmentId: "absent", objectKey: "another" }); }],
    ["object hash disagrees", (s) => { s.objects[0].sha256 = "0".repeat(64); }],
    ["object length disagrees", (s) => { s.objects[0].byteLength++; }],
    ["attachment hash malformed", (s) => { s.records.attachment[0].sha256 = "invalid"; }],
    ["attachment byte length malformed", (s) => { s.records.attachment[0].byteLength = "5"; }],
    ["Blob MIME malformed", (s) => { s.records.attachment[0].blobType = null; }],
    ["noncanonical Blob MIME", (s) => { s.records.attachment[0].blobType = "IMAGE/PNG"; }],
    ["unsupported record value", (s) => { s.records.moment[0].originalText = undefined; }],
    ["broken accepted review", (s) => { s.records.lifeEventProposal.find((r) => r.status === "accepted")!.materializedLifeEventId = "missing"; }],
    ["broken review fingerprint", (s) => { (s.records.lifeEvent.find((r) => r.id === "event-record")!.source as Record<string, unknown>).contentFingerprint = "wrong"; }],
    ["missing job", (s) => { s.records.lifeExtractionJob = []; }],
    ["duplicate request key", (s) => { s.records.lifeExtractionJob[1].requestKey = s.records.lifeExtractionJob[0].requestKey; }],
    ["missing attachment parent", (s) => { s.records.attachment[0].ownerId = "missing"; }],
  ];
  it.each(invalid)("rejects %s without registering or changing any original", async (name, corrupt) => {
    const { original, snapshot, transport } = await fixture();
    await contextFor(original);
    const originalBefore = await exactBusiness(original);
    const librariesBefore = await control.libraries.toArray();
    const before = await LifeDatabase.getDatabaseNames();
    corrupt(snapshot);
    const value = name === "null snapshot" ? null as never : snapshot;
    await expect(restoreReplicaSnapshot(value, transport, ACCOUNT)).rejects.toBeInstanceOf(Error);
    expect(await LifeDatabase.getDatabaseNames()).toEqual(before);
    expect(await control.libraries.toArray()).toEqual(librariesBefore);
    expect(await exactBusiness(original)).toEqual(originalBefore);
    expect(transport.download).not.toHaveBeenCalled();
  });

  it("rejects duplicate object keys even for different attachment IDs", async () => {
    const { snapshot, transport } = await fixture();
    snapshot.records.attachment.push({ ...snapshot.records.attachment[0], id: "image-two" });
    snapshot.objects.push({ ...snapshot.objects[0], attachmentId: "image-two" });
    await expect(restoreReplicaSnapshot(snapshot, transport, ACCOUNT)).rejects.toMatchObject({ code: "duplicate_object" });
  });

  it.each(["missing", "failed", "hash", "length", "download manifest hash", "download manifest length"])("aborts the entire cloud restore for a %s image and registers no ready library", async (failure) => {
    const f = await fixture();
    await contextFor(f.original);
    const before = await LifeDatabase.getDatabaseNames();
    const libraries = await control.libraries.toArray();
    const original = await exactBusiness(f.original);
    if (failure === "missing") {
      vi.mocked(f.transport.request).mockImplementation(async (path) => {
        if (path === "snapshot") return f.snapshot as never;
        throw new ReplicaError("not_found");
      });
    } else if (failure === "failed") vi.mocked(f.transport.download).mockRejectedValue(new ReplicaError("download_interrupted"));
    else if (failure === "hash") vi.mocked(f.transport.download).mockResolvedValue(new Uint8Array([0, 1, 255, 17, 129]));
    else if (failure === "length") vi.mocked(f.transport.download).mockResolvedValue(new Uint8Array([0]));
    else {
      vi.mocked(f.transport.request).mockImplementation(async (path) => {
        if (path === "snapshot") return f.snapshot as never;
        return { url: "https://objects.invalid/image-one", bytes: failure.endsWith("length") ? 4 : 5, sha256: failure.endsWith("hash") ? "0".repeat(64) : f.snapshot.objects[0].sha256 } as never;
      });
    }
    await expect(restoreReplicaFromCloud(f.transport, ACCOUNT)).rejects.toBeInstanceOf(Error);
    expect(await control.libraries.toArray()).toEqual(libraries);
    expect(await LifeDatabase.getDatabaseNames()).toEqual(before);
    expect(await exactBusiness(f.original)).toEqual(original);
  });

  it("checks capacity before object I/O or creation of a target", async () => {
    const { snapshot, transport } = await fixture();
    estimate.mockResolvedValue({ quota: 1, usage: 1 });
    const before = await LifeDatabase.getDatabaseNames();
    await expect(restoreReplicaSnapshot(snapshot, transport, ACCOUNT)).rejects.toMatchObject({ code: "local_quota" });
    expect(transport.request).not.toHaveBeenCalled();
    expect(await LifeDatabase.getDatabaseNames()).toEqual(before);
  });

  it("never overwrites or deletes an existing restore target with a colliding name", async () => {
    const { snapshot, transport } = await fixture();
    const collision = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const original = newDatabase(`life-restore-${collision}`);
    await seedBackupFixture(original);
    const before = await exactBusiness(original);
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(collision);
    const deletion = vi.spyOn(LifeDatabase, "delete");
    await expect(restoreReplicaSnapshot(snapshot, transport, ACCOUNT)).rejects.toMatchObject({ code: "restore_target_exists" });
    expect(deletion).not.toHaveBeenCalled();
    expect(await exactBusiness(original)).toEqual(before);
  });

  it.each(["write", "metadata", "bytes", "count"])("deletes only the newly created partial target after %s failure, without ready registration", async (failure) => {
    const f = await fixture();
    await contextFor(f.original);
    const before = await LifeDatabase.getDatabaseNames();
    const libraries = await control.libraries.toArray();
    const source = await exactBusiness(f.original);
    const open = LifeDatabase.prototype.open;
    let target = "";
    vi.spyOn(LifeDatabase.prototype, "open").mockImplementation(function (this: LifeDatabase) {
      if (this.name.startsWith("life-restore-")) {
        target = this.name;
        if (failure === "count") this.on("ready", () => { vi.spyOn(this.table("attachments"), "toArray").mockResolvedValue([]); });
        else this.attachments.hook("creating", (_key, row) => {
          if (failure === "write") throw new Error("synthetic transaction failure");
          if (failure === "metadata") row.fileName = "silently changed";
          if (failure === "bytes") row.blob = new Blob([new Uint8Array([0, 1, 255, 17, 129])], { type: row.blob.type });
        });
      }
      return open.call(this);
    });
    const deletion = vi.spyOn(LifeDatabase, "delete");
    await expect(restoreReplicaFromCloud(f.transport, ACCOUNT)).rejects.toBeInstanceOf(Error);
    expect(target).toMatch(/^life-restore-/);
    expect(deletion).toHaveBeenCalledExactlyOnceWith(target);
    expect(await LifeDatabase.exists(target)).toBe(false);
    expect(await LifeDatabase.getDatabaseNames()).toEqual(before);
    expect(await control.libraries.toArray()).toEqual(libraries);
    expect(await exactBusiness(f.original)).toEqual(source);
  });

  it("registers a ready library only after full readback while leaving the active context intact", async () => {
    const f = await fixture();
    const { context } = await contextFor(f.original);
    const { restored, database } = await fromCloud(f);
    expect(restored.warnings).toEqual([]);
    expect(restored.commitSeq).toBe(4);
    expect(restored.library).toMatchObject({ ready: true, accountId: ACCOUNT, databaseName: database.name, restoredFrom: "replica:4" });
    expect(await control.settings.get("context")).toEqual(context);
    expect(await exactBusiness(database)).toEqual(await exactBusiness(f.original));
    expect(lock.events).toEqual([]);
  });

  it("owns the snapshot metadata and commit sequence across asynchronous downloads", async () => {
    const f = await fixture();
    await contextFor(f.original);
    const originalText = f.snapshot.records.moment[0].originalText;
    vi.mocked(f.transport.download).mockImplementation(async () => {
      f.snapshot.records.moment[0].originalText = "later mutation";
      f.snapshot.commitSeq = 999;
      return f.images.get("image-one")!;
    });
    const { restored, database } = await fromCloud(f);
    expect(restored.commitSeq).toBe(4);
    expect(restored.library.restoredFrom).toBe("replica:4");
    expect((await database.replicaState.get("current"))?.lastCommitSeq).toBe(4);
    expect((await database.moments.get("moment-原样"))?.originalText).toBe(originalText);
  });

  it.each(["account", "library", "logout", "session guard"])("aborts registration if the %s changes during download", async (change) => {
    const f = await fixture();
    const { context } = await contextFor(f.original);
    const before = await LifeDatabase.getDatabaseNames();
    const libraries = await control.libraries.toArray();
    vi.mocked(f.transport.download).mockImplementation(async () => {
      if (change === "account") await control.settings.put({ ...context, account: { id: OTHER_ACCOUNT, email: "other@example.invalid" } });
      if (change === "library") await control.settings.put({ ...context, activeLibraryId: "other-library" });
      if (change === "logout") await control.settings.put({ ...context, logoutPending: true });
      return f.images.get("image-one")!;
    });
    const guard = vi.fn(async () => {});
    if (change === "session guard") guard.mockResolvedValueOnce().mockRejectedValueOnce(new ReplicaError("account_mismatch"));
    await expect(restoreReplicaFromCloud(f.transport, ACCOUNT, guard)).rejects.toMatchObject({ code: "account_mismatch" });
    expect(await control.libraries.toArray()).toEqual(libraries);
    expect(await LifeDatabase.getDatabaseNames()).toEqual(before);
  });
});

describe("explicit replica activation", () => {
  it("locks first, promotes the verified sequence and persists the returned epoch before switching and reloading", async () => {
    const f = await fixture();
    const { context } = await contextFor(f.original);
    const before = await exactBusiness(f.original);
    const { restored, database } = await fromCloud(f);
    const assertCurrent = vi.fn(async () => { lock.events.push("guard"); });
    const activated = await activateRestoredReplica(restored, { accountId: ACCOUNT, transport: f.transport, assertCurrent });
    expect(activated).toEqual(restored.library);
    expect(lock.events).toEqual(["exclusive", "guard", "promote", "guard", "reload"]);
    expect(f.transport.request).toHaveBeenLastCalledWith("writers/promote", {
      writerId: restored.writerId, libraryId: restored.library.id, installationId: context.installationId, expectedCommitSeq: restored.commitSeq,
    });
    expect(await database.replicaState.get("current")).toMatchObject({ writerId: restored.writerId, accountId: ACCOUNT, epoch: 3, lastCommitSeq: 4, backfillComplete: true, fenced: false, lastSyncedAt: expect.any(String), lastError: null, pausedReason: null });
    expect((await control.settings.get("context"))?.activeLibraryId).toBe(restored.library.id);
    expect(await exactBusiness(f.original)).toEqual(before);
  });

  it("activates a retained verified target reconstructed entirely from persisted control and sidecar state", async () => {
    const f = await fixture();
    await contextFor(f.original);
    const { database } = await fromCloud(f);
    database.close();
    await database.open();
    const library = (await control.libraries.where("databaseName").equals(database.name).first())!;
    const state = (await database.replicaState.get("current"))!;
    const retained = { library, writerId: state.writerId, commitSeq: Number(library.restoredFrom!.slice("replica:".length)) };
    expect(state.epoch).toBe(0);
    await activateRestoredReplica(retained, { accountId: ACCOUNT, transport: f.transport });
    expect((await control.settings.get("context"))?.activeLibraryId).toBe(library.id);
    expect((await database.replicaState.get("current"))?.epoch).toBe(3);
    expect(f.transport.request).toHaveBeenLastCalledWith("writers/promote", expect.objectContaining({ writerId: state.writerId, expectedCommitSeq: 4 }));
  });

  it("waits for an in-flight push to finish before promoting and never opens the working library", async () => {
    const f = await fixture();
    await contextFor(f.original);
    const { restored } = await fromCloud(f);
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const push = withReplicaPushLock({ name: f.original.name }, async () => {
      started();
      await new Promise<void>((resolve) => { release = resolve; });
    });
    await startedPromise;
    vi.mocked(f.transport.request).mockClear();
    const open = vi.spyOn(f.original, "open");
    const activation = activateRestoredReplica(restored, { accountId: ACCOUNT, transport: f.transport });
    await vi.waitFor(() => expect(lock.events).toEqual(["exclusive"]));
    expect(f.transport.request).not.toHaveBeenCalled();
    release();
    await push;
    await activation;
    expect(lock.events).toEqual(["exclusive", "promote", "reload"]);
    expect(open).not.toHaveBeenCalled();
  });

  it("does not promote when another document holds the library lock", async () => {
    const f = await fixture();
    const { context } = await contextFor(f.original);
    const { restored, database } = await fromCloud(f);
    lock.unavailable = true;
    vi.mocked(f.transport.request).mockClear();
    const before = await database.replicaState.get("current");
    await expect(activateRestoredReplica(restored, { accountId: ACCOUNT, transport: f.transport })).rejects.toThrow("other_tabs");
    expect(f.transport.request).not.toHaveBeenCalled();
    expect(await control.settings.get("context")).toEqual(context);
    expect(await database.replicaState.get("current")).toEqual(before);
    expect(lock.events).toEqual(["exclusive"]);
  });

  it.each(["account", "owner", "writer", "sequence", "missing target", "modified target"])("rejects %s mismatch before promotion", async (failure) => {
    const f = await fixture();
    const { context } = await contextFor(f.original);
    const { restored, database } = await fromCloud(f);
    if (failure === "owner") await database.replicaState.update("current", { accountId: OTHER_ACCOUNT });
    if (failure === "writer") restored.writerId = crypto.randomUUID();
    if (failure === "sequence") restored.commitSeq++;
    if (failure === "missing target") await database.delete();
    if (failure === "modified target") await database.replicaMutations.add({ mutationId: "pending", status: "pending", payloadSha256: "0".repeat(64), payload: { mutationId: "pending", createdAt: "2026-09-17T00:00:00.000Z", ops: [] }, createdAt: "2026-09-17T00:00:00.000Z", nextRetryAt: "2026-09-17T00:00:00.000Z", attemptCount: 0, lastError: null, ackedCommitSeq: null });
    vi.mocked(f.transport.request).mockClear();
    await expect(activateRestoredReplica(restored, { accountId: failure === "account" ? OTHER_ACCOUNT : ACCOUNT, transport: f.transport })).rejects.toBeInstanceOf(Error);
    expect(f.transport.request).not.toHaveBeenCalled();
    expect(await control.settings.get("context")).toEqual(context);
    expect(lock.events).toEqual(["exclusive"]);
    if (failure === "missing target") expect(await LifeDatabase.exists(database.name)).toBe(false);
  });

  it("leaves the isolated verified library available and the working context unchanged when the server rejects snapshot_stale", async () => {
    const f = await fixture();
    const { context } = await contextFor(f.original);
    const { restored, database } = await fromCloud(f);
    const before = await database.replicaState.get("current");
    vi.mocked(f.transport.request).mockRejectedValue(new ReplicaError("snapshot_stale"));
    await expect(activateRestoredReplica(restored, { accountId: ACCOUNT, transport: f.transport })).rejects.toMatchObject({ code: "snapshot_stale" });
    expect(await control.settings.get("context")).toEqual(context);
    expect(await database.replicaState.get("current")).toEqual(before);
    expect(await LifeDatabase.exists(database.name)).toBe(true);
    expect(lock.events).toEqual(["exclusive"]);
  });

  it("rechecks the account after promotion before persisting epoch or activating", async () => {
    const f = await fixture();
    const { context } = await contextFor(f.original);
    const { restored, database } = await fromCloud(f);
    const before = encodeJson(await database.replicaState.get("current"));
    const guard = vi.fn(async () => {});
    guard.mockResolvedValueOnce().mockRejectedValueOnce(new ReplicaError("account_mismatch"));
    await expect(activateRestoredReplica(restored, { accountId: ACCOUNT, transport: f.transport, assertCurrent: guard })).rejects.toMatchObject({ code: "account_mismatch" });
    expect(await control.settings.get("context")).toEqual(context);
    expect(encodeJson(await database.replicaState.get("current"))).toBe(before);
    expect(lock.events).toEqual(["exclusive", "promote"]);
  });
});
