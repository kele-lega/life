"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { exclusiveLibrary, type Account } from "@/features/cloud-backup/local/control";
import styles from "@/features/cloud-backup/components/account-page.module.css";
import { db } from "@/lib/db/client";

import { replicaUserTransport } from "../client/account";
import { claimLibraryForReplica, getReplicaSyncStatus, pushReplica } from "../local/push";
import { activateRestoredReplica, restoreReplicaFromCloud } from "../local/restore";
import { ReplicaError, type ReplicaCloudStatus } from "../shared/protocol";

const time = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })
  : "尚未同步";

function syncMessage(code: string): string {
  if (code === "unauthorized" || code === "otp_invalid") return "登录已过期，请重新登录。";
  if (code === "account_changed" || code === "binding_mismatch") return "账户已变化，请重新打开账户页。";
  if (code === "fenced" || code === "writer_exists") return "另一生活库正在上传。请先从云端恢复，再确认切换；本机记录仍保留。";
  if (code === "blob_too_large") return "有图片超过云端单文件限制，本机原图仍保留。";
  return "本机记录已保留。请检查网络后重试。";
}

type LocalStatus = Awaited<ReturnType<typeof getReplicaSyncStatus>>;
type Restored = Awaited<ReturnType<typeof restoreReplicaFromCloud>>;

export function ReplicaAccountSection({
  account,
  sessionReady,
  busy,
  run,
  report,
}: {
  account: Account | null;
  sessionReady: boolean;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void> | void;
  report: (message: string) => void;
}) {
  const [local, setLocal] = useState<LocalStatus | null>(null);
  const [cloud, setCloud] = useState<ReplicaCloudStatus | null>(null);
  const [cloudError, setCloudError] = useState("");
  const [localError, setLocalError] = useState("");
  const [checkingCloud, setCheckingCloud] = useState(false);
  const [restored, setRestored] = useState<Restored | null>(null);
  const [confirmClaim, setConfirmClaim] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const accountId = account?.id;
  const accountName = account?.username || account?.email || "当前账户";

  const refreshLocal = useCallback(async () => {
    try {
      const next = await getReplicaSyncStatus(db);
      if (mounted.current) { setLocal(next); setLocalError(""); }
      return next;
    } catch {
      if (mounted.current) setLocalError("本机同步状态暂时无法读取，请稍后重试。");
      return null;
    }
  }, []);

  const refreshCloud = useCallback(async () => {
    if (!sessionReady || !accountId) return;
    const current = ++generation.current;
    setCheckingCloud(true);
    setCloudError("");
    try {
      const client = await replicaUserTransport();
      if (!client || client.accountId !== accountId) throw new ReplicaError("unauthorized");
      const result = await client.transport.request<ReplicaCloudStatus>("status");
      if (mounted.current && generation.current === current) setCloud(result);
    } catch (error) {
      if (mounted.current && generation.current === current) {
        setCloud(null);
        setCloudError(syncMessage(error instanceof ReplicaError ? error.code : "network"));
      }
    } finally {
      if (mounted.current && generation.current === current) setCheckingCloud(false);
    }
  }, [sessionReady, accountId]);

  useEffect(() => {
    mounted.current = true;
    let reading = false;
    const refresh = () => {
      if (reading) return;
      reading = true;
      void refreshLocal().finally(() => { reading = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 1_000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [refreshLocal]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshCloud(); }, 0);
    return () => { window.clearTimeout(timer); generation.current += 1; };
  }, [refreshCloud]);

  async function upload(claim: boolean): Promise<void> {
    if (!accountId || !sessionReady) throw new ReplicaError("unauthorized", "请先登录，本机记录仍可使用。");
    if (claim) await exclusiveLibrary(() => claimLibraryForReplica(accountId));
    setConfirmClaim(false);
    await pushReplica(db, undefined, { forceRetry: true });
    const result = await refreshLocal();
    if (result?.lastError) report(`同步未完成。${syncMessage(result.lastError)}`);
    else if (result?.pending === 0 && result.lastSyncedAt) report("已同步。本机记录和图片已获云端确认。");
    else report("已保存本机，等待上传。你可以继续记录。");
    await refreshCloud();
  }

  const claimed = !!accountId && local?.accountId === accountId;
  const status = local?.syncing ? "正在同步"
    : local?.fenced || local?.lastError ? "同步失败"
      : !sessionReady || !claimed ? "已保存本机"
        : local?.pending ? "等待上传"
          : local?.lastSyncedAt ? "已同步" : "已保存本机";
  const counts = local?.localCounts;
  const cloudRows = cloud ? Object.values(cloud.counts).reduce((sum, count) => sum + count, 0) : 0;

  return (
    <section className={styles.section} aria-labelledby="replica-title">
      <div className={styles.sectionHeading}><h2 id="replica-title">云副本</h2><span className={styles.syncState} role="status" aria-label="同步状态" aria-live="polite">{status}</span></div>
      <p>先保存本机，再安静地上传。断网也可以继续记录。</p>
      <dl className={styles.summary}>
        <div><dt>本机数据</dt><dd>{counts ? `${counts.moments} 条随笔 · ${counts.momentAppends} 条追加 · ${counts.diaries} 篇日记 · ${counts.attachments} 张图片` : "正在读取…"}</dd></div>
        {counts && <div><dt>生活整理</dt><dd>{counts.lifeEvents} 条事件 · {counts.lifeExtractionJobs} 次整理 · {counts.lifeEventProposals} 条提案</dd></div>}
        <div><dt>待上传</dt><dd>{local ? `${local.pending} 条变更` : "—"}</dd></div>
        <div><dt>最近同步</dt><dd>{time(local?.lastSyncedAt)}</dd></div>
        <div><dt>云端数据</dt><dd>{!sessionReady ? "登录后查看" : checkingCloud ? "正在检查…" : cloud ? `${cloudRows} 条数据 · ${cloud.blobCount} 张原图` : "暂时无法读取"}</dd></div>
        {sessionReady && cloud && <div><dt>云端更新</dt><dd>{time(cloud.lastSyncedAt)}</dd></div>}
      </dl>
      <p className={styles.note}>数量包含回收站与整理历史。云副本与手动完整备份各自保留。</p>
      {localError && <p role="alert">{localError}</p>}
      {local?.lastError && <p role="status">{syncMessage(local.lastError)}</p>}
      {cloudError && <p role="status">{cloudError}</p>}
      {sessionReady && <div className={styles.actions}>
        <button className={styles.primary} disabled={busy || !local || local.syncing || local.fenced} onClick={() => {
          if (!claimed) setConfirmClaim(true);
          else void run(() => upload(false));
        }}>{local?.lastError ? "重试上传" : "立即上传"}</button>
        <button className={styles.secondary} disabled={busy || checkingCloud} onClick={() => void refreshCloud()}>刷新云端状态</button>
        <button className={styles.secondary} disabled={busy || local?.syncing || !!restored} onClick={() => void run(async () => {
          const client = await replicaUserTransport();
          if (!client || client.accountId !== accountId) throw new ReplicaError("unauthorized", "请先登录云账户。本机记录仍可使用。");
          const result = await restoreReplicaFromCloud(client.transport, client.accountId, client.assertCurrent);
          if (!mounted.current) return;
          setRestored(result);
          report("云端记录与原图已完整校验，已放入新的独立生活库。当前生活库仍保留，请确认后切换。");
        })}>从云端恢复/同步</button>
      </div>}
      {sessionReady && confirmClaim && <div className={styles.preview}>
        <h3>将这份生活库上传到 {accountName}</h3>
        <p>包括随笔、日记、原图与整理历史。确认后，这份库归属该账户，后续记录会在联网时自动上传。</p>
        <div className={styles.actions}>
          <button className={styles.primary} disabled={busy} onClick={() => void run(() => upload(true))}>确认并上传</button>
          <button className={styles.secondary} disabled={busy} onClick={() => setConfirmClaim(false)}>暂不上传</button>
        </div>
      </div>}
      {sessionReady && restored && <div className={styles.preview}>
        <h3>云端生活库已准备好</h3>
        <p>切换后由这份库继续上传，之前的生活库会保留在本机。其他设备不会自动合并。</p>
        <div className={styles.actions}>
          <button className={styles.primary} disabled={busy} onClick={() => void run(async () => {
            const client = await replicaUserTransport();
            if (!client || client.accountId !== accountId) throw new ReplicaError("unauthorized", "请重新登录后切换。");
            await activateRestoredReplica(restored, client);
          })}>确认切换到恢复的生活库</button>
          <button className={styles.secondary} disabled={busy} onClick={() => setRestored(null)}>保留当前生活库</button>
        </div>
      </div>}
      {!sessionReady && <p>登录后可查看云端状态、上传本机记录，或取回完整云副本。</p>}
    </section>
  );
}
