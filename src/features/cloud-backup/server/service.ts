import { createHash } from "node:crypto";
import { BackupError, decodeJson, emptyRecords, ensure, LIMITS, TABLE_NAMES, type BackupManifest } from "../shared/format";
import { validateRecords } from "../shared/records";
import { CloudStore, digest, manifestOf, type StoredPart } from "./store";
import type { ObjectStorage } from "./objects";

export class BackupService {
  constructor(readonly store: CloudStore, readonly objects: ObjectStorage) {}
  async upload(account: string, id: string, path: string, index: number) {
    const backup = await this.store.get(account, id);
    const part = (await this.store.parts(account, id)).find((part) => part.path === path && part.part_index === index);
    ensure(part, "unknown_part");
    if (part.verified) return { verified: true as const };
    ensure(backup.status === "uploading" || backup.status === "failed", "immutable_backup");
    return { verified: false as const, ...await this.objects.uploadUrl(part.object_key, part.byte_length, part.sha256) };
  }
  async acknowledge(account: string, id: string, path: string, index: number) {
    const part = (await this.store.parts(account, id)).find((part) => part.path === path && part.part_index === index);
    ensure(part, "unknown_part");
    if (part.verified) return;
    const bytes = await this.objects.read(part.object_key, part.byte_length);
    ensure(bytes.byteLength === part.byte_length && digest(bytes) === part.sha256, "part_checksum");
    await this.store.acknowledgePart(account, id, path, index);
  }
  async download(account: string, id: string, path: string, index: number) {
    const backup = await this.store.get(account, id);
    ensure(backup.status === "complete", "incomplete_backup");
    const part = (await this.store.parts(account, id)).find((part) => part.path === path && part.part_index === index);
    ensure(part?.verified, "incomplete_backup");
    return { url: await this.objects.downloadUrl(part.object_key), bytes: part.byte_length, sha256: part.sha256 };
  }

  private async readFile(file: BackupManifest["files"][number], parts: StoredPart[], keepBytes: boolean): Promise<Uint8Array> {
    const hash = createHash("sha256"); let total = 0;
    const chunks: Uint8Array[] = [];
    const selected = parts.filter((part) => part.path === file.path).sort((a, b) => a.part_index - b.part_index);
    ensure(selected.length === file.parts.length, "incomplete_upload");
    for (const part of selected) {
      ensure(part.verified, "incomplete_upload");
      const bytes = await this.objects.read(part.object_key, part.byte_length);
      ensure(bytes.byteLength === part.byte_length && digest(bytes) === part.sha256, "part_checksum");
      total += bytes.byteLength; ensure(total <= file.bytes, "object_size");
      hash.update(bytes); if (keepBytes) chunks.push(bytes);
    }
    ensure(total === file.bytes && hash.digest("hex") === file.sha256, "checksum");
    return keepBytes ? Buffer.concat(chunks) : new Uint8Array();
  }

  /** Durable, leased verification. Retries continue verified files; closing the browser loses no job. */
  async verifySlice(account: string, id: string, budgetMs = 12_000): Promise<void> {
    const token = await this.store.claim(account, id);
    if (!token) return;
    const deadline = Date.now() + budgetMs;
    try {
      const backup = await this.store.get(account, id);
      const manifest = manifestOf(backup);
      const parts = await this.store.parts(account, id);
      const pending = await this.store.pendingFiles(account, id);
      for (const path of pending) {
        if (Date.now() >= deadline) return;
        const file = manifest.files.find((file) => file.path === path)!;
        await this.readFile(file, parts, false);
        await this.store.verifiedFile(account, id, token, path);
      }
      if (Date.now() >= deadline || (await this.store.pendingFiles(account, id)).length) return;
      // Graph validation reads at most 32 MiB of JSON, never retains all image buffers.
      const records = emptyRecords(); let jsonBytes = 0;
      for (const file of manifest.files.filter((file) => file.table !== undefined)) {
        const bytes = await this.readFile(file, parts, true);
        jsonBytes += bytes.length; ensure(jsonBytes <= LIMITS.json);
        const value = decodeJson(bytes);
        ensure(Array.isArray(value)); records[file.table!].push(...value);
      }
      for (const table of TABLE_NAMES) ensure(records[table].length === manifest.counts[table], "record_count");
      const imageIds = new Set(manifest.files.filter((file) => file.attachmentId !== undefined).map((file) => file.attachmentId));
      ensure(records.attachments.every((row) => imageIds.has(row.id)), "missing_image");
      const warnings = validateRecords(records);
      const key = `${account}/${id}/manifest.json`;
      await this.objects.putManifest(key, backup.manifest_bytes, backup.manifest_sha256);
      await this.store.complete(account, id, token, warnings);
    } catch (error) {
      // Never retain provider errors: they may contain URLs or user-controlled values.
      await this.store.release(account, id, token, error instanceof BackupError ? error.code : "verification_unavailable");
      throw new BackupError("verification_failed", "云端校验尚未通过。快照和旧备份已保留，可以重试。");
    } finally { await this.store.release(account, id, token); }
  }
}
