"use client";

import { useEffect, useState } from "react";

import { activateLibrary, exclusiveLibrary, reloadLibrary, type LocalLibrary } from "@/features/cloud-backup/local/control";
import { db } from "@/lib/db/client";
import styles from "@/features/cloud-backup/components/account-page.module.css";

import { replicaUserTransport } from "../client/account";
import { ReplicaError } from "../shared/protocol";
import { ensureReplicaState, pendingReplicaCount } from "../local/outbox";
import { restoreReplicaFromCloud } from "../local/restore";

export function ReplicaAccountSection({
  sessionReady,
  busy,
  run,
  report,
}: {
  sessionReady: boolean;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void> | void;
  report: (message: string) => void;
}) {
  const [pending, setPending] = useState(0);
  const [fenced, setFenced] = useState(false);
  const [restored, setRestored] = useState<{ library: LocalLibrary; writerId: string; warnings: string[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void Promise.all([pendingReplicaCount(db), ensureReplicaState(db)]).then(([count, state]) => {
        if (cancelled) return;
        setPending(count);
        setFenced(state.fenced);
      }).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  return (
    <section className={styles.section} aria-labelledby="replica-title">
      <h2 id="replica-title">云副本</h2>
      <p>联网后自动把本机已保存的记录做成可靠云端副本。保存从不等待网络。这不替代手动不可变快照备份。</p>
      <p>待上传 {pending} 条变更{fenced ? "。此设备已不再是云副本写者，本机记录仍可查看。" : "。"}</p>
      {sessionReady && <div className={styles.actions}>
        <button className={styles.secondary} disabled={busy || !!restored} onClick={() => void run(async () => {
          const client = await replicaUserTransport();
          if (!client) throw new ReplicaError("unauthorized", "请先登录云账户。本机记录仍可使用。");
          const result = await restoreReplicaFromCloud(client.transport, client.accountId);
          setRestored(result);
          report(result.warnings.length
            ? "独立库已从云副本恢复。部分图片未下完，文字记录已保留。当前生活库未覆盖。"
            : "独立库已从云副本恢复并读回校验。当前生活库未覆盖。");
        })}>从云副本恢复到独立生活库</button>
        {restored && <button className={styles.primary} disabled={busy} onClick={() => void run(async () => {
          const client = await replicaUserTransport();
          if (!client) throw new ReplicaError("unauthorized", "请先登录云账户。本机记录仍可使用。");
          await client.transport.request("writers/promote", {
            writerId: restored.writerId,
            libraryId: restored.library.id,
            installationId: null,
          });
          await exclusiveLibrary(async () => reloadLibrary(await activateLibrary(restored.library.id)));
        })}>打开并成为云副本写者</button>}
      </div>}
      {!sessionReady && <p>登录后可以把本机记录复制到云端，或从云副本恢复到新的独立生活库。</p>}
    </section>
  );
}
