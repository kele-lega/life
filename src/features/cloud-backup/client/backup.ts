import { db } from "@/lib/db/client";
import { BackupError, encodeJson, ensure, PART_BYTES, sha256, validateManifest, type BackupArchive, type BackupManifest } from "../shared/format";
import { captureArchive, verifyArchive, type Progress } from "../local/archive";
import { control, ensureCapacity, finishTransfer, initializeControl, stageTransfer, transferArchive, type LocalLibrary, type Transfer } from "../local/control";
import { cloudApi } from "./api";

async function scope(accountId: string, libraryId?: string) {
  const current = await initializeControl();
  if (current.context.logoutPending || current.context.account?.id !== accountId || (libraryId && current.library.id !== libraryId)) throw new BackupError("account_changed", "账户或生活库已切换，此任务已停止。");
  return current;
}

export async function runCloudBackup(library: LocalLibrary, accountId: string, existing: Transfer | undefined, report: Progress): Promise<void> {
  const current = await scope(accountId, library.id);
  ensure(db.name === library.databaseName && library.accountId === accountId, "binding_required");
  let transfer = existing;
  try {
    if (!transfer) {
      const archive = await captureArchive(db, library.id, report);
      await ensureCapacity(archive.manifest.files.reduce((sum, file) => sum + file.bytes, 0));
      transfer = await stageTransfer(archive, library, accountId);
    }
    ensure(transfer.accountId === accountId && transfer.libraryId === library.id && transfer.manifest.libraryId === library.id, "binding_mismatch");
    if (transfer.state === "complete") { report("这份备份已完成。可在云备份列表预览恢复。"); return; }
    const archive = await transferArchive(transfer);
    await verifyArchive(archive, report);
    await scope(accountId, library.id);
    // Also registers an explicitly restored fork; it never reuses the source library identity.
    await cloudApi("libraries/bind", { libraryId: library.id, installationId: current.context.installationId }, accountId);
    const created = await cloudApi<{ manifestSha256: string }>("backups", { id: transfer.id, manifest: archive.manifest }, accountId);
    ensure(created.manifestSha256 === await sha256(new Blob([encodeJson(archive.manifest)])), "manifest_checksum");
    let state = await cloudApi<{ status: string; completedAt: string | null }>(`backups/${transfer.id}`, undefined, accountId);
    if (state.status !== "complete") {
      await control.transfers.update(transfer.id, { state: "uploading", error: undefined });
      if (state.status !== "verifying") {
        const totalParts = archive.manifest.files.reduce((sum, file) => sum + file.parts.length, 0); let done = 0;
        for (const file of archive.manifest.files) {
          for (const part of file.parts) {
            await scope(accountId, library.id);
            report(`正在上传分块 ${++done} / ${totalParts}`);
            const request = { path: file.path, index: part.index };
            const upload = await cloudApi<{ verified: boolean; url?: string; headers?: Record<string, string> }>(`backups/${transfer.id}/uploads`, request, accountId);
            if (upload.verified) continue;
            const blob = archive.files.get(file.path)!.slice(part.index * PART_BYTES, (part.index + 1) * PART_BYTES);
            let response: Response;
            try { response = await fetch(upload.url!, { method: "PUT", headers: upload.headers, body: blob, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(120_000) }); }
            catch { throw new BackupError("upload_interrupted", "图片或记录上传中断，完整快照已保留，可稍后重试。"); }
            if (!response.ok) throw new BackupError("upload_interrupted", "分块上传未完成，请重试。");
            await scope(accountId, library.id);
            await cloudApi(`backups/${transfer.id}/ack`, request, accountId);
          }
        }
        await cloudApi(`backups/${transfer.id}/finalize`, {}, accountId);
      }
      await control.transfers.update(transfer.id, { state: "verifying" });
      // Explicitly advances an already requested backup; this never captures new records.
      for (let attempt = 0; attempt < 100; attempt++) {
        await scope(accountId, library.id); report("上传完成，正在进行云端完整性校验…");
        await cloudApi(`backups/${transfer.id}/verify`, {}, accountId);
        state = await cloudApi(`backups/${transfer.id}`, undefined, accountId);
        if (state.status === "complete") break;
        if (state.status === "failed") throw new BackupError("verification_failed", "云端校验未完成，原快照已保留，可重试。");
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      }
      if (state.status !== "complete") { report("备份仍在云端校验，可稍后刷新状态。当前记录不受影响。"); return; }
    }
    await finishTransfer(transfer.id, state.completedAt ?? new Date().toISOString());
    report(`已完成备份：${new Date(transfer.manifest.capturedAt).toLocaleString("zh-CN")} 的记录。`);
  } catch (error) {
    if (transfer) await control.transfers.update(transfer.id, { state: "failed", error: error instanceof BackupError ? error.code : "cloud_failure" });
    throw error;
  }
}

export async function downloadBackup(id: string, accountId: string, report: Progress): Promise<BackupArchive> {
  await scope(accountId);
  const info = await cloudApi<{ status: string; manifest: BackupManifest; manifestSha256: string }>(`backups/${id}`, undefined, accountId);
  ensure(info.status === "complete", "incomplete_backup");
  const manifest = validateManifest(info.manifest);
  ensure(await sha256(new Blob([encodeJson(manifest)])) === info.manifestSha256, "manifest_checksum");
  await ensureCapacity(manifest.files.reduce((sum, file) => sum + file.bytes, 0));
  const files = new Map<string, Blob>(); let done = 0;
  for (const file of manifest.files) {
    const chunks: Blob[] = [];
    for (const part of file.parts) {
      await scope(accountId); report(`正在下载备份文件 ${done + 1} / ${manifest.files.length}`);
      const download = await cloudApi<{ url: string }>(`backups/${id}/downloads`, { path: file.path, index: part.index }, accountId);
      const response = await fetch(download.url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(120_000) });
      ensure(response.ok, "download_failed");
      const blob = await response.blob();
      ensure(blob.size === part.bytes && await sha256(blob) === part.sha256, "download_checksum");
      chunks.push(blob);
    }
    files.set(file.path, new Blob(chunks)); done++;
  }
  const archive = { manifest, files }; await verifyArchive(archive, report); return archive;
}
