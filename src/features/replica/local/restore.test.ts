// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMoment } from "@/features/moment/repository/moment-repository";
import { db, LifeDatabase } from "@/lib/db/client";

import type { ReplicaTransport } from "../client/transport";
import { hashBytes, replicaRecord } from "../shared/protocol";
import { restoreReplicaSnapshot, type ReplicaSnapshot } from "./restore";

const databases: LifeDatabase[] = [];

afterEach(async () => {
  if (db.isOpen()) db.close();
  await db.delete();
  for (const database of databases.splice(0)) {
    database.close();
    await LifeDatabase.delete(database.name);
  }
});

describe("replica disaster restore", () => {
  it("writes a new isolated library and leaves the working database unchanged", async () => {
    await db.open();
    await createMoment({ id: "local-only", originalText: "working copy", createdAt: "2026-09-15T00:00:00.000Z" });
    const bytes = new Uint8Array([9, 8, 7]);
    const digest = await hashBytes(bytes);
    const moment = replicaRecord({
      id: "moment-1",
      originalText: "from replica",
      isFavorite: false,
      location: null,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
      deletedAt: null,
    });
    const attachment = replicaRecord({
      id: "img-1",
      ownerType: "moment",
      ownerId: "moment-1",
      kind: "image",
      fileName: "a.png",
      mimeType: "image/png",
      size: 3,
      width: null,
      height: null,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
      deletedAt: null,
      sha256: digest,
      byteLength: 3,
    });
    const snapshot: ReplicaSnapshot = {
      writerId: "11111111-1111-4111-8111-111111111111",
      epoch: 2,
      commitSeq: 4,
      records: {
        moment: [moment],
        momentAppend: [],
        attachment: [attachment],
        diary: [],
        lifeEvent: [],
        lifeExtractionJob: [],
        lifeEventProposal: [],
      },
      objects: [{ attachmentId: "img-1", sha256: digest, byteLength: 3, objectKey: "dev/replica/acc/img-1/u" }],
    };
    const transport = {
      request: vi.fn(async (path: string) => {
        if (path === "attachments/downloads") return { url: "https://objects.invalid/img-1", bytes: 3, sha256: digest };
        throw new Error(path);
      }),
      put: vi.fn(async () => {}),
      download: vi.fn(async () => bytes),
    } as ReplicaTransport;
    const restored = await restoreReplicaSnapshot(snapshot, transport, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const isolated = new LifeDatabase(restored.databaseName);
    databases.push(isolated);
    await isolated.open();
    expect(isolated.name).not.toBe(db.name);
    expect((await isolated.moments.get("moment-1"))?.originalText).toBe("from replica");
    expect(await db.moments.get("moment-1")).toBeUndefined();
    expect((await db.moments.get("local-only"))?.originalText).toBe("working copy");
    const stored = await isolated.attachments.get("img-1");
    expect(new Uint8Array(await stored!.blob.arrayBuffer())).toEqual(bytes);
    expect((await isolated.replicaState.get("current"))?.backfillComplete).toBe(true);
    expect((await isolated.replicaMutations.count())).toBe(0);
  });

  it("can restore text while warning about a missing image instead of overwriting the working library", async () => {
    const moment = replicaRecord({
      id: "moment-2",
      originalText: "text only",
      isFavorite: false,
      location: null,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
      deletedAt: "2026-09-15T02:00:00.000Z",
    });
    const attachment = replicaRecord({
      id: "missing-img",
      ownerType: "moment",
      ownerId: "moment-2",
      kind: "image",
      fileName: "gone.png",
      mimeType: "image/png",
      size: 1,
      width: null,
      height: null,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
      deletedAt: null,
      sha256: "a".repeat(64),
      byteLength: 1,
    });
    const snapshot: ReplicaSnapshot = {
      writerId: "11111111-1111-4111-8111-111111111111",
      epoch: 1,
      commitSeq: 1,
      records: {
        moment: [moment],
        momentAppend: [],
        attachment: [attachment],
        diary: [],
        lifeEvent: [],
        lifeExtractionJob: [],
        lifeEventProposal: [],
      },
      objects: [{ attachmentId: "missing-img", sha256: "a".repeat(64), byteLength: 1, objectKey: "dev/replica/acc/missing/u" }],
    };
    const transport = {
      request: vi.fn(async () => { throw new Error("missing object"); }),
      put: vi.fn(async () => {}),
      download: vi.fn(async () => { throw new Error("missing object"); }),
    } as ReplicaTransport;
    const restored = await restoreReplicaSnapshot(snapshot, transport, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(restored.warnings).toContain("missing-img");
    const isolated = new LifeDatabase(restored.databaseName);
    databases.push(isolated);
    await isolated.open();
    expect((await isolated.moments.get("moment-2"))?.deletedAt).toBe("2026-09-15T02:00:00.000Z");
    expect(await isolated.attachments.count()).toBe(0);
  });
});
