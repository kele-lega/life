import { Unzip, UnzipInflate, Zip, ZipPassThrough } from "fflate";
import { LifeDatabase } from "@/lib/db/client";
import { BackupError, byteArray, decodeJson, describeFile, DEXIE_VERSION, emptyRecords, encodeJson, ensure, IMAGE_PATH, LIMITS, PART_BYTES, sha256, TABLE_NAMES, validateManifest, type BackupArchive, type BackupManifest, type BackupRecords, type BackupRow } from "../shared/format";
import { validateRecords } from "../shared/records";

export type Progress = (message: string) => void;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function captureArchive(database: LifeDatabase, libraryId: string, progress: Progress = () => {}): Promise<BackupArchive> {
  progress("正在取得本机记录快照…");
  let capturedAt = "";
  const records = emptyRecords();
  await database.transaction("r", TABLE_NAMES.map((name) => database.table(name)), async () => {
    for (const name of TABLE_NAMES) records[name] = await database.table(name).toArray();
    capturedAt = new Date().toISOString();
  });
  ensure(TABLE_NAMES.reduce((sum, name) => sum + records[name].length, 0) <= LIMITS.records, "record_limit");
  const blobs = new Map<string, Blob>();
  let total = 0;
  records.attachments = records.attachments.map((row) => {
    const { blob, ...metadata } = row;
    ensure(blob instanceof Blob, "missing_image");
    total += blob.size;
    ensure(total <= LIMITS.archive, "capacity");
    blobs.set(row.id, blob);
    return metadata as BackupRow;
  });
  validateRecords(records);
  const files = new Map<string, Blob>();
  const descriptors: BackupManifest["files"] = [];
  for (const name of TABLE_NAMES) {
    let part: string[] = [];
    let partBytes = 2;
    let index = 1;
    const flush = async () => {
      const path = `records/${name}/${String(index++).padStart(6, "0")}.json`;
      const blob = new Blob([`[${part.join(",")}]`], { type: "application/json" });
      total += blob.size; ensure(total <= LIMITS.archive, "capacity");
      files.set(path, blob); descriptors.push(await describeFile(path, blob, { table: name }));
      part = []; partBytes = 2; await pause();
    };
    for (const row of records[name]) {
      const text = encodeJson(row);
      const bytes = new TextEncoder().encode(text).byteLength;
      ensure(bytes + 2 <= PART_BYTES, "record_too_large");
      if (partBytes + bytes + 1 > PART_BYTES && part.length) await flush();
      part.push(text); partBytes += bytes + 1;
    }
    if (part.length || index === 1) await flush();
  }
  let done = 0;
  for (const [id, blob] of blobs) {
    progress(`正在校验图片 ${++done} / ${blobs.size}`);
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif", "image/heic": "heic" } as Record<string, string>)[blob.type] ?? "bin";
    const path = `images/${crypto.randomUUID()}.${extension}`;
    files.set(path, blob);
    descriptors.push(await describeFile(path, blob, { attachmentId: id, blobType: blob.type }));
    await pause();
  }
  const manifest = validateManifest({ format: "life-backup", version: 1, dexieVersion: DEXIE_VERSION, exporterVersion: "16A.1", libraryId, capturedAt,
    counts: Object.fromEntries(TABLE_NAMES.map((name) => [name, records[name].length])), files: descriptors });
  return { manifest, files };
}

export async function packArchive(archive: BackupArchive, progress: Progress = () => {}): Promise<Blob> {
  const chunks: BlobPart[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, data) => { if (error) failure = error; else chunks.push(byteArray(data)); });
  const entries = new Map(archive.files);
  entries.set("manifest.json", new Blob([encodeJson(archive.manifest)]));
  for (const [path, blob] of entries) {
    progress("正在打包完整数据…");
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    for (let start = 0; start < blob.size || (start === 0 && blob.size === 0); start += PART_BYTES) {
      const part = new Uint8Array(await blob.slice(start, start + PART_BYTES).arrayBuffer());
      entry.push(part, start + PART_BYTES >= blob.size);
      if (failure) throw failure;
      await pause();
    }
  }
  zip.end();
  if (failure) throw failure;
  return new Blob(chunks, { type: "application/zip" });
}

export async function unpackArchive(zipBlob: Blob, progress: Progress = () => {}): Promise<BackupArchive> {
  ensure(zipBlob.size <= LIMITS.archive + LIMITS.manifest + 4 * 1024 * 1024, "capacity");
  ensure(zipBlob.size >= 22, "incomplete_zip");
  // v1 writes ordinary ZIP without comments/ZIP64. Require its complete central directory.
  const end = new DataView(await zipBlob.slice(-22).arrayBuffer());
  ensure(end.getUint32(0, true) === 0x06054b50 && end.getUint16(4, true) === 0 && end.getUint16(6, true) === 0 && end.getUint16(20, true) === 0, "incomplete_zip");
  ensure(end.getUint32(12, true) + end.getUint32(16, true) === zipBlob.size - 22, "incomplete_zip");
  const files = new Map<string, Blob>();
  const seen = new Set<string>();
  let total = 0;
  let failure: Error | null = null;
  const unzip = new Unzip((entry) => {
    if (failure) { entry.terminate(); return; }
    try {
      ensure(!seen.has(entry.name) && seen.size < LIMITS.files + 1, "duplicate_file");
      ensure(entry.name === "manifest.json" || /^records\/(moments|momentAppends|attachments|diaries|lifeEvents|lifeExtractionJobs|lifeEventProposals)\/[0-9]{6}\.json$/.test(entry.name) || IMAGE_PATH.test(entry.name), "unsafe_path");
      seen.add(entry.name);
      const chunks: BlobPart[] = [];
      let size = 0;
      entry.ondata = (error, data, final) => {
        if (failure) return;
        if (error) { failure = new BackupError("invalid_zip"); return; }
        size += data.length; total += data.length;
        const limit = entry.name === "manifest.json" ? LIMITS.manifest : entry.name.startsWith("records/") ? PART_BYTES : LIMITS.archive;
        if (size > limit || total > LIMITS.archive + LIMITS.manifest) { failure = new BackupError("capacity"); entry.terminate(); return; }
        chunks.push(byteArray(data));
        if (final) files.set(entry.name, new Blob(chunks));
      };
      entry.start();
    } catch (error) { failure = error as Error; entry.terminate(); }
  });
  unzip.register(UnzipInflate);
  try {
    for (let start = 0; start < zipBlob.size; start += 64 * 1024) {
      progress("正在读取归档…");
      unzip.push(new Uint8Array(await zipBlob.slice(start, start + 64 * 1024).arrayBuffer()), start + 64 * 1024 >= zipBlob.size);
      if (failure) throw failure;
      await pause();
    }
  } catch (error) { if (error instanceof BackupError) throw error; throw new BackupError("invalid_zip"); }
  ensure(files.size === seen.size && files.size === end.getUint16(10, true) && files.has("manifest.json"), "incomplete_zip");
  const manifest = validateManifest(decodeJson(new Uint8Array(await files.get("manifest.json")!.arrayBuffer())));
  files.delete("manifest.json");
  const archive = { manifest, files };
  await verifyArchive(archive, progress);
  return archive;
}

export async function verifyArchive(archive: BackupArchive, progress: Progress = () => {}): Promise<{ records: BackupRecords; warnings: string[] }> {
  const manifest = validateManifest(archive.manifest);
  ensure(archive.files.size === manifest.files.length, "file_count");
  const records = emptyRecords();
  for (const file of manifest.files) {
    progress("正在核对记录与图片…");
    const blob = archive.files.get(file.path);
    ensure(blob && blob.size === file.bytes && await sha256(blob) === file.sha256, "checksum");
    for (const part of file.parts) ensure(await sha256(blob.slice(part.index * PART_BYTES, (part.index + 1) * PART_BYTES)) === part.sha256, "part_checksum");
    if (file.table) {
      const rows = decodeJson(new Uint8Array(await blob.arrayBuffer()));
      ensure(Array.isArray(rows));
      records[file.table].push(...rows);
    }
  }
  for (const name of TABLE_NAMES) ensure(records[name].length === manifest.counts[name], "record_count");
  const warnings = validateRecords(records);
  const imageIds = new Set(manifest.files.filter((file) => file.attachmentId !== undefined).map((file) => file.attachmentId));
  ensure(records.attachments.every(({ id }) => imageIds.has(id)), "missing_image");
  return { records, warnings };
}

/** Only writes a newly named database. No live repository commands are replayed. */
export async function restoreArchive(archive: BackupArchive, progress: Progress = () => {}): Promise<{ databaseName: string; warnings: string[] }> {
  const { records, warnings } = await verifyArchive(archive, progress);
  const databaseName = `life-restore-${crypto.randomUUID()}`;
  const database = new LifeDatabase(databaseName);
  try {
    ensure(!(await LifeDatabase.exists(databaseName)), "restore_target_exists");
    progress("正在建立独立生活库…");
    const images = new Map(archive.manifest.files.filter((file) => file.attachmentId !== undefined).map((file) => [file.attachmentId, file]));
    const originals = records.attachments;
    const withBlobs = originals.map((row) => {
      const file = images.get(row.id)!;
      return { ...row, blob: new Blob([archive.files.get(file.path)!], { type: file.blobType }) };
    });
    await database.transaction("rw", TABLE_NAMES.map((name) => database.table(name)), async () => {
      for (const name of TABLE_NAMES) {
        const rows = name === "attachments" ? withBlobs : records[name];
        for (let index = 0; index < rows.length; index += 250) await database.table(name).bulkAdd(rows.slice(index, index + 250));
      }
    });
    progress("正在读回验证恢复结果…");
    for (const name of TABLE_NAMES) {
      const restored: BackupRow[] = await database.table(name).toArray();
      ensure(restored.length === records[name].length, "restore_readback");
      const expected = new Map(records[name].map((row) => [row.id, row]));
      for (const row of restored) {
        if (name === "attachments") {
          const { blob, ...metadata } = row;
          const file = images.get(row.id)!;
          ensure(blob instanceof Blob && blob.type === file.blobType && await sha256(blob) === file.sha256, "restore_image");
          ensure(encodeJson(metadata) === encodeJson(expected.get(row.id)), "restore_readback");
        } else ensure(encodeJson(row) === encodeJson(expected.get(row.id)), "restore_readback");
      }
    }
    return { databaseName, warnings };
  } finally { database.close(); }
}
