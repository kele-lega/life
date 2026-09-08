// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { LifeDatabase } from "@/lib/db/client";
import { seedBackupFixture } from "../test/fixture";
import { describeFile, emptyRecords, encodeJson, TABLE_NAMES, type BackupRow } from "../shared/format";
import { captureArchive, packArchive, restoreArchive, unpackArchive, verifyArchive } from "./archive";

const databases: LifeDatabase[] = [];
function newDatabase() { const database = new LifeDatabase(`test-backup-${crypto.randomUUID()}`); databases.push(database); return database; }
afterEach(async () => { for (const database of databases.splice(0)) await database.delete(); });

describe("Life portable backups", () => {
  it("round trips all seven stores, every review state and original Blob without touching the source", async () => {
    const original = newDatabase(); await seedBackupFixture(original);
    const archive = await captureArchive(original, "library-test");
    const before = await verifyArchive(archive);
    const zip = await packArchive(archive);
    const parsed = await unpackArchive(zip);
    expect(parsed.manifest.counts.lifeEventProposals).toBe(6);
    const result = await restoreArchive(parsed);
    const restored = new LifeDatabase(result.databaseName); databases.push(restored);
    expect(restored.name).not.toBe(original.name);
    expect(restored.verno).toBe(6);
    expect(restored.tables.map(({ name }) => name).sort()).toEqual([...TABLE_NAMES].sort());
    for (const name of TABLE_NAMES) {
      const source = await original.table(name).toArray();
      const copy = await restored.table(name).toArray();
      if (name !== "attachments") expect(copy).toEqual(source);
    }
    const image = (await restored.attachments.toArray())[0];
    expect(image.blob.type).toBe("image/jpeg"); expect(image.mimeType).toBe("image/png"); expect(image.size).toBe(999);
    expect(new Uint8Array(await image.blob.arrayBuffer())).toEqual(new Uint8Array([0, 1, 255, 17, 128]));
    expect(image.deletedAt).not.toBeNull();
    expect((await restored.lifeEvents.get("manual-one"))).not.toHaveProperty("extractionProposalId");
    expect((await verifyArchive(await captureArchive(original, "library-test"))).records).toEqual(before.records);
  });

  it("supports an empty v6 library", async () => {
    const archive = await captureArchive(newDatabase(), "empty");
    expect(archive.manifest.files).toHaveLength(7);
    expect((await verifyArchive(await unpackArchive(await packArchive(archive)))).records).toEqual(emptyRecords());
  });

  it("round trips an image larger than one upload part with independently checked chunks", async () => {
    const database = newDatabase(); await seedBackupFixture(database);
    const bytes = new Uint8Array(9 * 1024 * 1024 + 7); bytes.fill(71); bytes[bytes.length - 1] = 99;
    await database.attachments.update("image-one", { blob: new Blob([bytes], { type: "image/png" }) });
    const archive = await captureArchive(database, "chunked");
    const image = archive.manifest.files.find((file) => file.attachmentId)!;
    expect(image.parts.map(({ bytes }) => bytes)).toEqual([4194304, 4194304, 1048583]);
    const unpacked = await unpackArchive(await packArchive(archive));
    expect(Buffer.from(await unpacked.files.get(image.path)!.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true);
  }, 20_000); // Chunked I/O deliberately yields to the UI; allow contention in the full suite.

  it("freezes the snapshot before subsequent edits and preserves deleted rows", async () => {
    const original = newDatabase(); await seedBackupFixture(original);
    const archive = await captureArchive(original, "before-edit");
    await original.diaries.update("diary-one", { body: "later edit" });
    const snapshot = await verifyArchive(archive);
    expect(snapshot.records.diaries[0].body).toContain("未改写");
    expect(snapshot.records.momentAppends[0].deletedAt).not.toBeNull();
  });

  it("detects modified image bytes before creating any restore database", async () => {
    const original = newDatabase(); await seedBackupFixture(original);
    const archive = await captureArchive(original, "integrity");
    const before = await LifeDatabase.getDatabaseNames();
    const image = archive.manifest.files.find((file) => file.attachmentId)!;
    archive.files.set(image.path, new Blob([new Uint8Array([0, 1, 255, 17, 129])]));
    await expect(restoreArchive(archive)).rejects.toMatchObject({ code: "checksum" });
    expect(await LifeDatabase.getDatabaseNames()).toEqual(before);
    expect(await original.moments.count()).toBe(1);
  });

  it("rejects unsupported versions and missing files", async () => {
    const archive = await captureArchive(newDatabase(), "version");
    await expect(verifyArchive({ ...archive, manifest: { ...archive.manifest, version: 2 } as never })).rejects.toMatchObject({ code: "unsupported_version" });
    archive.files.delete(archive.manifest.files[0].path);
    await expect(verifyArchive(archive)).rejects.toMatchObject({ code: "file_count" });
  });

  it("rejects a broken accepted Proposal even when file hashes have been recomputed", async () => {
    const database = newDatabase(); await seedBackupFixture(database);
    const archive = await captureArchive(database, "graph");
    const file = archive.manifest.files.find((file) => file.table === "lifeEventProposals")!;
    const rows = JSON.parse(await archive.files.get(file.path)!.text()) as BackupRow[];
    rows.find(({ status }) => status === "accepted")!.materializedLifeEventId = "missing";
    const replacement = new Blob([encodeJson(rows)]);
    archive.files.set(file.path, replacement);
    Object.assign(file, await describeFile(file.path, replacement, { table: "lifeEventProposals" }));
    await expect(restoreArchive(archive)).rejects.toMatchObject({ code: "broken_review_link" });
  });

  it("rejects invalid UTF-8 instead of silently replacing original text even when hashes match", async () => {
    const database = newDatabase(); await seedBackupFixture(database);
    const archive = await captureArchive(database, "invalid-encoding");
    const file = archive.manifest.files.find((file) => file.table === "diaries")!;
    const bytes = new Uint8Array(await archive.files.get(file.path)!.arrayBuffer());
    const position = bytes.indexOf(0xe6); // First byte of an existing Chinese character.
    expect(position).toBeGreaterThan(-1); bytes[position] = 0xff;
    const replacement = new Blob([bytes]); archive.files.set(file.path, replacement);
    Object.assign(file, await describeFile(file.path, replacement, { table: "diaries" }));
    const before = await LifeDatabase.getDatabaseNames();
    await expect(restoreArchive(archive)).rejects.toMatchObject({ code: "invalid_json" });
    expect(await LifeDatabase.getDatabaseNames()).toEqual(before);
  });

  it("rejects traversal paths and truncated archives", async () => {
    const unsafe = zipSync({ "../manifest.json": strToU8("{}") });
    await expect(unpackArchive(new Blob([new Uint8Array(unsafe)]))).rejects.toMatchObject({ code: "unsafe_path" });
    const zip = await packArchive(await captureArchive(newDatabase(), "truncated"));
    await expect(unpackArchive(zip.slice(0, 50))).rejects.toBeInstanceOf(Error);
  });

  it("captures a transactionally consistent review while another write is committing", async () => {
    const database = newDatabase(); await seedBackupFixture(database);
    const write = database.transaction("rw", database.moments, database.momentAppends, async () => {
      await database.moments.update("moment-原样", { isFavorite: false });
      await database.momentAppends.update("append-one", { text: "committed together" });
    });
    const snapshot = captureArchive(database, "concurrent");
    await write;
    const { records } = await verifyArchive(await snapshot);
    expect(records.moments[0].isFavorite === false).toBe(records.momentAppends[0].text === "committed together");
  });
});
