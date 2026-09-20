"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { db } from "@/lib/db/client";
import { BackupError, LIMITS, TABLE_NAMES, type BackupArchive } from "../shared/format";
import { captureArchive, packArchive, restoreArchive, unpackArchive, verifyArchive } from "../local/archive";
import { activateLibrary, bindLocalLibrary, control, ensureCapacity, exclusiveLibrary, finishTransfer, initializeControl, registerRestoredLibrary, reloadLibrary, setLocalAccount, type LocalContext, type LocalLibrary, type Transfer } from "../local/control";
import { cloudApi, type CloudAccount, type CloudBackup } from "../client/api";
import { downloadBackup, runCloudBackup } from "../client/backup";
import { ReplicaAccountSection } from "@/features/replica/components/replica-account-section";
import { ReplicaError } from "@/features/replica/shared/protocol";
import { clearReplicaLogin, loadReplicaAccount, loginReplicaPassword } from "@/features/replica/client/account";
import { replicaApiOrigin } from "@/features/replica/client/transport";
import { isNativeApp } from "@/lib/runtime/platform";
import styles from "./account-page.module.css";

const date = (value: string) => new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;
const backupStatus = { uploading: "上传中", verifying: "校验中", complete: "已完成校验", failed: "未完成，可重试" };

export function AccountPage() {
  const [local, setLocal] = useState<{ context: LocalContext; library: LocalLibrary } | null>(null);
  const [libraries, setLibraries] = useState<LocalLibrary[]>([]);
  const [cloud, setCloud] = useState<CloudAccount | null>(null);
  const [backups, setBackups] = useState<CloudBackup[]>([]);
  const [backupCursor, setBackupCursor] = useState<string | null>(null);
  const [latestBackup, setLatestBackup] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<BackupArchive | null>(null);
  const [restored, setRestored] = useState<LocalLibrary | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const operation = useRef(false);

  const refreshLocal = useCallback(async () => {
    const next = await initializeControl();
    if (!mounted.current) return;
    setLocal(next);
    setLibraries((await control.libraries.toArray()).filter((library) => library.ready && (library.accountId === null || library.accountId === next.context.account?.id)));
    setTransfers((await control.transfers.where("libraryId").equals(next.library.id).toArray()).filter((item) => item.accountId === next.context.account?.id));
  }, []);
  const refreshCloud = useCallback(async () => {
    const current = await initializeControl();
    if (isNativeApp()) {
      try {
        const replica = await loadReplicaAccount();
        if (!mounted.current) return;
        setCloud({ configured: replica.configured, account: replica.account });
        setBackups([]); setBackupCursor(null); setLatestBackup(null);
      } catch {
        if (mounted.current) setCloud({ configured: replicaApiOrigin() !== null, account: null });
      }
      return;
    }
    if (current.context.logoutPending) {
      await cloudApi("auth/logout", {});
      await control.settings.update("context", { logoutPending: false });
    }
    const account = await cloudApi<CloudAccount>("account");
    if (!mounted.current) return;
    setCloud(account);
    if (account.account?.id && account.account.id === current.context.account?.id) {
      const result = await cloudApi<{ backups: CloudBackup[]; nextCursor?: string | null; latestForLibrary?: string | null }>(`backups?libraryId=${current.library.id}`, undefined, account.account.id);
      if (mounted.current) { setBackups(result.backups); setBackupCursor(result.nextCursor ?? null); setLatestBackup(result.latestForLibrary ?? null); }
      for (const backup of result.backups) {
        if (backup.status !== "complete" || !backup.completedAt) continue;
        const transfer = await control.transfers.get(backup.id);
        if (transfer?.accountId === account.account.id && transfer.state !== "complete") await finishTransfer(transfer.id, backup.completedAt);
      }
      await refreshLocal();
    } else { setBackups([]); setBackupCursor(null); setLatestBackup(null); }
  }, [refreshLocal]);
  const native = useSyncExternalStore(() => () => undefined, isNativeApp, () => false);
  useEffect(() => {
    mounted.current = true;
    void refreshLocal().then(() => refreshCloud()).catch(() => { if (mounted.current) setStatus("云服务暂时不可用，本地导出和恢复仍可使用。"); });
    return () => { mounted.current = false; };
  }, [refreshLocal, refreshCloud]);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);

  async function run(work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setStatus("");
    try { await work(); }
    catch (cause) { if (mounted.current) setError(cause instanceof BackupError || cause instanceof ReplicaError ? cause.message : "操作未完成，原生活库已保留。请重试。"); }
    finally { operation.current = false; if (mounted.current) { setBusy(false); try { await refreshLocal(); } catch { setError("本机状态暂时无法读取，请刷新重试。"); } } }
  }
  const report = (message: string) => { if (mounted.current) setStatus(message); };
  const account = local?.context.account;
  const sessionReady = !!account && cloud?.account?.id === account.id;
  const lastKnownBackup = latestBackup ?? transfers.filter((item) => item.state === "complete").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0]?.manifest.capturedAt;

  return <main className={`ui-page ${styles.page}`}>
    <nav className="ui-page-nav" aria-label="账户页面导航"><Link href="/">返回记录</Link></nav>
    <header className={styles.header}><h1>账户与备份</h1><p>记录始终保存在本机。为珍贵的生活，留一份可以带走的副本。</p></header>
    <div className={styles.status} role="status" aria-live="polite">{busy && !status ? "正在处理…" : status}</div>
    {error && <p role="alert">{error}</p>}

    <section className={styles.section} aria-labelledby="export-title">
      <h2 id="export-title">带走完整数据</h2>
      <p>导出已保存的记录、原图与整理审核历史，包含软删除内容。未保存的编辑不在其中。无需登录。</p>
      <div className={styles.actions}>
        <button className={styles.primary} disabled={busy || !local} onClick={() => void run(async () => {
          const archive = await captureArchive(db, local!.library.id, report);
          const blob = await packArchive(archive, report);
          setDownload({ url: URL.createObjectURL(blob), name: `Life-${archive.manifest.capturedAt.slice(0, 10)}.life.zip` });
          report("完整归档已准备好。请选择下方链接保存到设备。");
        })}>导出 .life.zip</button>
        <button className={styles.secondary} disabled={busy} onClick={() => fileInput.current?.click()}>从文件恢复</button>
        <input ref={fileInput} className="visually-hidden" type="file" accept=".zip,.life.zip,application/zip" aria-label="选择 Life 备份文件" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (file) void run(async () => { setPreview(null); setRestored(null); setPreview(await unpackArchive(file, report)); report("归档校验通过，请确认恢复范围。"); });
        }} />
      </div>
      {download && <a className={styles.download} href={download.url} download={download.name}>下载 {download.name}</a>}
      <p className={styles.note}>文件包含私人数据，默认不加密。当前单份完整归档支持至 {bytes(LIMITS.archive)}；超出时会明确停止，不截断内容。</p>
      {preview && <div className={styles.preview}>
        <h3>恢复预览</h3><p>{date(preview.manifest.capturedAt)} 的生活快照</p>
        <p className={styles.count}>{preview.manifest.counts.moments} 条随笔 · {preview.manifest.counts.diaries} 篇日记 · {preview.manifest.counts.attachments} 张图片<br />七表共 {TABLE_NAMES.reduce((sum, name) => sum + preview.manifest.counts[name], 0)} 条数据，包含原有删除状态和审核历史。</p>
        <p>恢复到独立生活库，当前生活库保留。较早快照可能包含当时尚未删除的记录。</p>
        <div className={styles.actions}><button className={styles.primary} disabled={busy || !!restored} onClick={() => void run(async () => {
          await ensureCapacity(preview.manifest.files.reduce((sum, file) => sum + file.bytes, 0));
          const checked = await verifyArchive(preview, report);
          const result = await restoreArchive(preview, report);
          const library = await registerRestoredLibrary(result.databaseName, preview.manifest, account?.id ?? null);
          setRestored(library); report(checked.warnings.length ? "独立库恢复并读回验证通过。归档中存在原有孤立子项，已原样保留。" : "独立库恢复并读回验证通过，原库已保留。");
        })}>恢复到独立生活库</button>
        {restored && <button className={styles.primary} disabled={busy} onClick={() => void run(() => exclusiveLibrary(async () => reloadLibrary(await activateLibrary(restored.id))))}>打开恢复后的生活库</button>}
        <button className={styles.secondary} disabled={busy} onClick={() => { setPreview(null); setRestored(null); }}>关闭预览</button></div>
      </div>}
    </section>

    <section className={styles.section} aria-labelledby="account-title"><h2 id="account-title">{account ? "我的账户" : "账号登录"}</h2>
      {account && <p>{account.email}<br />{sessionReady ? "云会话可用" : "云会话暂不可用，本机记录仍可使用"}</p>}
      {!sessionReady && <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void run(async () => {
        await exclusiveLibrary(async () => {
          const result = native
            ? { account: await loginReplicaPassword(username, password) }
            : await cloudApi<{ account: NonNullable<typeof account> }>("auth/password", { username, password });
          reloadLibrary(await setLocalAccount(result.account));
        });
      }); }}>
        <label htmlFor="life-username">账号</label><input id="life-username" className={styles.input} type="text" autoComplete="username" required minLength={3} maxLength={32} value={username} disabled={busy} onChange={(event) => setUsername(event.target.value)} />
        <label htmlFor="life-password">密码</label><input id="life-password" className={styles.input} type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
        <div className={styles.actions}><button className={styles.secondary} disabled={busy || (native ? replicaApiOrigin() === null : cloud?.configured === false)}>登录</button></div>
      </form>}
      {cloud?.configured === false && <p>云服务尚未配置，完整导出和本地恢复可直接使用。</p>}
      {account && <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => void run(() => exclusiveLibrary(async () => {
        let pending = false;
        try {
          if (native) await clearReplicaLogin();
          else await cloudApi("auth/logout", {});
        } catch { pending = true; }
        if (native) await clearReplicaLogin();
        reloadLibrary(await setLocalAccount(null, pending));
      }))}>退出登录并保留本机库</button><button className={styles.secondary} disabled={busy} onClick={() => void run(refreshCloud)}>刷新云状态</button></div>}
    </section>

    <ReplicaAccountSection sessionReady={sessionReady} busy={busy} run={run} report={report} />
    {!native && <section className={styles.section} aria-labelledby="cloud-title"><h2 id="cloud-title">云备份</h2>
      <p>仅在点击时备份。完整快照包含文字、原图、位置和审核历史；采用传输与云存储加密，第一版不是端到端加密。</p>
      {sessionReady && local && local.library.accountId === null && <>
        <p>此生活库尚未绑定。绑定到 {account!.email} 后可以手动备份；绑定本身不上传记录。</p>
        <button className={styles.secondary} disabled={busy} onClick={() => void run(() => exclusiveLibrary(async () => {
          await cloudApi("libraries/bind", { libraryId: local.library.id, installationId: local.context.installationId }, account!.id);
          await bindLocalLibrary(local.library.id, account!.id); reloadLibrary(local.library);
        }))}>将本机生活库绑定到此账户</button>
      </>}
      {sessionReady && local?.library.accountId === account?.id && <div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => void run(async () => {
        await runCloudBackup(local!.library, account!.id, undefined, report); await refreshCloud();
      })}>备份现在</button></div>}
      {!account && <p>登录并绑定本机生活库后，可以使用云备份。</p>}
      <p>本库最近成功备份：{lastKnownBackup ? date(lastKnownBackup) : "暂无已确认的成功备份"}{!sessionReady && lastKnownBackup ? "（本机上次确认）" : ""}</p>
      <ul className={styles.list}>{transfers.filter((transfer) => transfer.state !== "complete").map((transfer) => <li className={styles.item} key={transfer.id}>
        <div><p>{date(transfer.manifest.capturedAt)} 的本机快照</p><small>{transfer.state === "failed" ? "上次未完成，快照已保留" : "有一份备份等待继续"}</small></div>
        <button className={styles.secondary} disabled={busy || !sessionReady} onClick={() => void run(async () => { await runCloudBackup(local!.library, account!.id, transfer, report); await refreshCloud(); })}>重试备份</button>
      </li>)}</ul>
      {backupCursor && <button className={styles.secondary} disabled={busy || !sessionReady} onClick={() => void run(async () => {
        const result = await cloudApi<{ backups: CloudBackup[]; nextCursor: string | null }>(`backups?before=${backupCursor}`, undefined, account!.id);
        setBackups((previous) => [...previous, ...result.backups]); setBackupCursor(result.nextCursor);
      })}>更早的备份</button>}
      <ul className={styles.list}>{backups.map((backup) => <li className={styles.item} key={backup.id}>
        <div><p>{date(backup.capturedAt)}</p><small>{backup.libraryId === local?.library.id ? "当前库" : "其他生活库"} · {backupStatus[backup.status]} · {bytes(backup.totalBytes)}</small></div>
        {backup.status === "complete" && <button className={styles.secondary} disabled={busy || !sessionReady} onClick={() => void run(async () => {
          setRestored(null); setPreview(null); setPreview(await downloadBackup(backup.id, account!.id, report)); report("云快照已下载并校验，请确认恢复范围。");
        })}>预览恢复</button>}
      </li>)}</ul>
    </section>}

    {libraries.length > 1 && <section className={styles.section}><h2>本机保留的生活库</h2><p>每次恢复保留独立副本。打开另一库不会合并或删除当前记录。</p><ul className={styles.list}>{libraries.map((library) => <li key={library.id} className={styles.item}>
      <div><p>{library.id === local?.library.id ? "当前生活库" : library.capturedAt ? `${date(library.capturedAt)} 的恢复库` : "本机生活库"}</p><small>{library.accountId ? "已归属当前账户" : "尚未绑定账户"} · 建立于 {date(library.createdAt)}</small></div>
      {library.id !== local?.library.id && <button className={styles.secondary} disabled={busy} onClick={() => void run(() => exclusiveLibrary(async () => reloadLibrary(await activateLibrary(library.id))))}>打开此库</button>}
    </li>)}</ul></section>}
  </main>;
}
