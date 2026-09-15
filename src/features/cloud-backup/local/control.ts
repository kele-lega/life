import Dexie, { type Table } from "dexie";
import { LIBRARY_BOOT_KEY } from "@/lib/db/bootstrap";
import { db, LifeDatabase } from "@/lib/db/client";
import { BackupError, type BackupArchive, type BackupManifest } from "../shared/format";

export interface Account { id: string; email: string }
export interface LocalLibrary { id: string; databaseName: string; accountId: string | null; createdAt: string; capturedAt?: string; restoredFrom?: string; ready: boolean }
export interface LocalContext { key: "context"; activeLibraryId: string; installationId: string; account: Account | null; logoutPending: boolean }
export interface Transfer { id: string; libraryId: string; accountId: string; manifest: BackupManifest; state: "ready" | "uploading" | "verifying" | "complete" | "failed"; error?: string; completedAt?: string }

export class ControlDatabase extends Dexie {
  libraries!: Table<LocalLibrary, string>;
  settings!: Table<LocalContext, string>;
  transfers!: Table<Transfer, string>;
  files!: Table<{ transferId: string; path: string; blob: Blob }, [string, string]>;
  constructor(name = "life-control") {
    super(name);
    this.version(1).stores({ libraries: "id, databaseName, accountId", settings: "key", transfers: "id, libraryId, accountId", files: "[transferId+path], transferId" });
  }
}
export const control = new ControlDatabase();

export async function initializeControl(storage = control): Promise<{ context: LocalContext; library: LocalLibrary }> {
  return storage.transaction("rw", storage.libraries, storage.settings, async () => {
    let context = await storage.settings.get("context");
    if (!context) {
      // An absent control database never silently claims an existing library for an account.
      const library: LocalLibrary = { id: crypto.randomUUID(), databaseName: "life", accountId: null, createdAt: new Date().toISOString(), ready: true };
      await storage.libraries.add(library);
      context = { key: "context", activeLibraryId: library.id, installationId: crypto.randomUUID(), account: null, logoutPending: false };
      await storage.settings.add(context);
    }
    const library = await storage.libraries.get(context.activeLibraryId);
    if (!library?.ready || (library.accountId !== null && library.accountId !== context.account?.id)) throw new BackupError("library_locked", "生活库已锁定。请重新登录所属账户。");
    return { context, library };
  });
}

export async function registerRestoredLibrary(databaseName: string, manifest: BackupManifest, accountId: string | null, restoredFrom?: string, storage = control): Promise<LocalLibrary> {
  const library: LocalLibrary = { id: crypto.randomUUID(), databaseName, accountId, createdAt: new Date().toISOString(), capturedAt: manifest.capturedAt, restoredFrom, ready: true };
  // Called only after the isolated restore passed its readback. No existing row is overwritten.
  await storage.libraries.add(library);
  return library;
}

export async function registerReplicaRestoredLibrary(databaseName: string, accountId: string, commitSeq: number, storage = control): Promise<LocalLibrary> {
  const library: LocalLibrary = {
    id: crypto.randomUUID(),
    databaseName,
    accountId,
    createdAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
    restoredFrom: `replica:${commitSeq}`,
    ready: true,
  };
  await storage.libraries.add(library);
  return library;
}

export async function activateLibrary(id: string, storage = control): Promise<LocalLibrary> {
  return storage.transaction("rw", storage.settings, storage.libraries, async () => {
    const context = await storage.settings.get("context");
    const library = await storage.libraries.get(id);
    if (!context || !library?.ready || (library.accountId !== null && library.accountId !== context.account?.id)) throw new BackupError("library_locked", "无法打开其他账户的生活库。");
    await storage.settings.put({ ...context, activeLibraryId: id });
    return library;
  });
}

export async function setLocalAccount(account: Account | null, logoutPending = false, storage = control): Promise<LocalLibrary> {
  return storage.transaction("rw", storage.settings, storage.libraries, async () => {
    const context = (await storage.settings.get("context"))!;
    let library = (await storage.libraries.get(context.activeLibraryId))!;
    if (library.accountId !== null && library.accountId !== account?.id) {
      library = { id: crypto.randomUUID(), databaseName: `life-local-${crypto.randomUUID()}`, accountId: null, createdAt: new Date().toISOString(), ready: true };
      await storage.libraries.add(library);
    }
    await storage.settings.put({ ...context, account, logoutPending, activeLibraryId: library.id });
    return library;
  });
}

export async function bindLocalLibrary(libraryId: string, accountId: string, storage = control): Promise<void> {
  await storage.transaction("rw", storage.settings, storage.libraries, async () => {
    const context = await storage.settings.get("context");
    const library = await storage.libraries.get(libraryId);
    if (context?.account?.id !== accountId || !library || (library.accountId && library.accountId !== accountId)) throw new BackupError("binding_mismatch");
    await storage.libraries.put({ ...library, accountId });
  });
}

export async function stageTransfer(archive: BackupArchive, library: LocalLibrary, accountId: string): Promise<Transfer> {
  if (library.accountId !== accountId) throw new BackupError("binding_required", "请先绑定本机生活库。");
  const transfer: Transfer = { id: crypto.randomUUID(), libraryId: library.id, accountId, manifest: archive.manifest, state: "ready" };
  await control.transaction("rw", control.transfers, control.files, async () => {
    await control.transfers.add(transfer);
    for (const [path, blob] of archive.files) await control.files.add({ transferId: transfer.id, path, blob });
  });
  return transfer;
}
export async function transferArchive(transfer: Transfer): Promise<BackupArchive> {
  const entries = await control.files.where("transferId").equals(transfer.id).toArray();
  if (entries.length !== transfer.manifest.files.length) throw new BackupError("snapshot_missing", "备份暂存文件缺失，请重新创建完整备份。");
  return { manifest: transfer.manifest, files: new Map(entries.map(({ path, blob }) => [path, blob])) };
}
export async function finishTransfer(id: string, completedAt: string) {
  await control.transaction("rw", control.transfers, control.files, async () => {
    await control.transfers.update(id, { state: "complete", completedAt, error: undefined });
    // Only redundant upload staging is removed. All seven original stores and Blobs remain intact.
    await control.files.where("transferId").equals(id).delete();
  });
}

let releaseDocument: (() => void) | undefined;
let documentLock: Promise<void> | undefined;
let lockReady: Promise<void> | undefined;

export async function holdDocumentLibrary(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.locks) return;
  if (lockReady) return lockReady;
  let resolveReady!: () => void;
  let rejectReady!: (reason?: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  lockReady = ready;
  documentLock = navigator.locks.request("life-library-context", { mode: "shared", ifAvailable: true }, async (lock) => {
    // A queued exclusive request (or another tab that is switching libraries)
    // must never leave the boot screen waiting forever. The caller can retry
    // after that tab finishes without weakening the switching guard.
    if (!lock) {
      rejectReady(new BackupError("other_tabs", "请先保存并关闭其他 Life 标签页，再重新打开。"));
      return;
    }
    resolveReady();
    await new Promise<void>((release) => { releaseDocument = release; });
  }).then(() => undefined).catch((error) => {
    rejectReady(error);
  });
  try {
    await ready;
  } catch (error) {
    if (lockReady === ready) lockReady = undefined;
    documentLock = undefined;
    throw error;
  }
}

/** Refuse a context switch if another document is using any library. No draft is discarded. */
export async function exclusiveLibrary<T>(work: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new BackupError("locks_unavailable", "此浏览器暂不支持安全切换生活库，请使用支持 Web Locks 的浏览器。导出仍可使用。");
  releaseDocument?.(); releaseDocument = undefined;
  await documentLock;
  lockReady = undefined;
  try {
    return await navigator.locks.request("life-library-context", { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (!lock) throw new BackupError("other_tabs", "请先保存并关闭其他 Life 标签页，再切换账户或生活库。");
      return work();
    });
  } finally { await holdDocumentLibrary(); }
}

export function reloadLibrary(library: LocalLibrary) {
  localStorage.setItem(LIBRARY_BOOT_KEY, library.databaseName);
  db.close();
  // A document reload is required: client routing would retain the old database instance.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/account");
}

export async function ensureCapacity(bytes: number) {
  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.quota && estimate.usage !== undefined && estimate.quota - estimate.usage < bytes * 1.25) throw new BackupError("local_quota", "本机空间不足。原生活库已保留，请先释放设备空间。");
}

// Exported for isolated integration tests and recovery tools; never deletes user databases.
export async function libraryExists(library: LocalLibrary) { return LifeDatabase.exists(library.databaseName); }
