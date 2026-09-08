"use client";

import { Cross2Icon } from "@radix-ui/react-icons";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ReadingPlaceholder } from "@/components/ui/reading-placeholder";
import { readRecordExtractionSource, type RecordExtractionSourceRef } from "../application/record-extraction-source";
import { reviewLifeEventProposal } from "../application/review-proposal";
import { runLifeExtraction } from "../application/run-life-extraction";
import { createHttpLifeEventExtractor, ExtractionHttpError } from "../extractor/http-life-event-extractor";
import { LifeEventProposalSourceError, ManualLifeEventConflictError } from "../model/errors";
import type { LifeEventProposal, LifeEventProposalSourceStatus, LifeExtractionJob, ProposalReviewRequest } from "../model/types";
import { lifeIntelligenceRepository } from "../repository/dexie-life-intelligence-repository";
import { RecordExtractionCandidate } from "./record-extraction-candidate";
import styles from "./record-extraction.module.css";

type SourceSnapshot = Awaited<ReturnType<typeof readRecordExtractionSource>>;
interface ReviewBatch { job: LifeExtractionJob; proposals: readonly LifeEventProposal[]; sourceStatuses: Record<string, LifeEventProposalSourceStatus | undefined> }

function localError(error: unknown, fallback: string) {
  if (error instanceof LifeEventProposalSourceError) return error.sourceStatus === "stale" ? "原记录已变化，请重新整理。当前候选仍可拒绝。" : "原记录已删除或无法找到，当前候选仍可拒绝。";
  if (error instanceof ManualLifeEventConflictError) return "已有手动记录包含这个事件，请核对后拒绝重复候选。";
  if (error instanceof Error && error.name === "QuotaExceededError") return "本机存储空间不足，审核结果尚未保存。请释放空间后重试。";
  return fallback;
}

function sourceReadMessage(error: unknown) {
  if (error instanceof Error && error.message === "这条记录已不存在或已移入回收站。") return "原记录已删除或无法找到。已有整理仍保存在本机。";
  return "原记录暂时无法读取。已有整理仍可查看，请稍后重新读取。";
}

function jobDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function evidenceFor(batch: ReviewBatch, proposal: LifeEventProposal, snapshot: SourceSnapshot | null) {
  if (batch.sourceStatuses[proposal.id] !== "current" || !snapshot || batch.job.input.kind !== "record" || snapshot.request.input.kind !== "record") return null;
  if (batch.job.input.source.contentFingerprint !== snapshot.request.input.source.contentFingerprint) return null;
  return snapshot.request.text;
}

export function RecordExtractionDialog({ source, onClose }: { source: RecordExtractionSourceRef; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const extractionLock = useRef(false);
  const reviewLock = useRef(false);
  const localRevision = useRef(0);
  const dirtyProposals = useRef(new Set<string>());
  const [snapshot, setSnapshot] = useState<SourceSnapshot | null>(null);
  const [batches, setBatches] = useState<ReviewBatch[]>([]);
  const [restoring, setRestoring] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const titleId = useId();
  const descriptionId = useId();

  const refreshLocal = useCallback(async () => {
    const revision = ++localRevision.current;
    const [sourceResult, jobsResult] = await Promise.allSettled([
      readRecordExtractionSource({ type: source.type, id: source.id }),
      lifeIntelligenceRepository.listJobsBySource({ type: source.type, id: source.id }),
    ]);
    if (!mountedRef.current || revision !== localRevision.current) return;
    setSnapshot(sourceResult.status === "fulfilled" ? sourceResult.value : null);
    setSourceError(sourceResult.status === "rejected" ? sourceReadMessage(sourceResult.reason) : null);
    if (jobsResult.status === "rejected") {
      setLoadError("本机整理记录暂时无法读取，请重试。");
      setRestoring(false);
      return;
    }
    try {
      const restored = await Promise.all(jobsResult.value.map(async (job): Promise<ReviewBatch> => {
        const proposals = await lifeIntelligenceRepository.listProposalsByJob(job.id);
        const sourceStatuses = Object.fromEntries(await Promise.all(proposals.map(async (proposal) => [proposal.id, await lifeIntelligenceRepository.getProposalSourceStatus(proposal.id)] as const)));
        return { job, proposals, sourceStatuses };
      }));
      if (!mountedRef.current || revision !== localRevision.current) return;
      setBatches(restored);
      setLoadError(null);
    } catch {
      if (mountedRef.current && revision === localRevision.current) setLoadError("候选审核状态暂时无法读取，请重试。");
    } finally {
      if (mountedRef.current && revision === localRevision.current) setRestoring(false);
    }
  }, [source.id, source.type]);

  useEffect(() => {
    mountedRef.current = true;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void refreshLocal();
    const refresh = () => { if (!extractionLock.current && !reviewLock.current) void refreshLocal(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyProposals.current.size) event.preventDefault(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mountedRef.current = false;
      localRevision.current += 1;
      abortRef.current?.abort();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("beforeunload", beforeUnload);
      document.body.style.overflow = previousOverflow;
      dialog?.close();
    };
  }, [refreshLocal]);

  const setDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyProposals.current.add(id);
    else dirtyProposals.current.delete(id);
  }, []);

  function requestClose() {
    if (reviewLock.current) return;
    if (dirtyProposals.current.size && !window.confirm("放弃尚未保存的修正并关闭整理？")) return;
    abortRef.current?.abort();
    dialogRef.current?.close();
    onClose();
  }

  async function startExtraction() {
    if (extractionLock.current || reviewLock.current) return;
    extractionLock.current = true;
    setExtracting(true);
    setExtractError(null);
    setMessage("");
    const controller = new AbortController();
    abortRef.current = controller;
    let phase: "source" | "service" | "save" = "source";
    try {
      const currentSource = await readRecordExtractionSource(source);
      if (controller.signal.aborted) return;
      phase = "service";
      const extractor = await createHttpLifeEventExtractor(controller.signal);
      if (controller.signal.aborted) return;
      phase = "save";
      const result = await runLifeExtraction(lifeIntelligenceRepository, extractor, currentSource.request);
      if (!mountedRef.current || controller.signal.aborted) return;
      setSnapshot(currentSource);
      await refreshLocal();
      if (!mountedRef.current) return;
      setMessage(result.proposals.length ? "整理结果已保存在本机，请逐条核对。" : "整理完成，这条记录没有产生候选事件。");
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setExtractError(error instanceof ExtractionHttpError ? error.message : phase === "source" ? sourceReadMessage(error) : phase === "save" ? localError(error, "整理结果未能保存到本机，请重试。原记录保持不变。") : "AI 服务暂时无法连接，请重试。");
      if (phase === "source") await refreshLocal();
    } finally {
      extractionLock.current = false;
      if (mountedRef.current) setExtracting(false);
    }
  }

  async function review(request: ProposalReviewRequest): Promise<boolean> {
    if (reviewLock.current || extractionLock.current) return false;
    reviewLock.current = true;
    setReviewing(true);
    setReviewErrors((current) => ({ ...current, [request.proposalId]: "" }));
    try {
      if (request.action !== "reject") {
        const status = await lifeIntelligenceRepository.getProposalSourceStatus(request.proposalId);
        if (status === "stale" || status === "missing") throw new LifeEventProposalSourceError(status);
        if (status !== "current") throw new Error("Source status unavailable");
      }
      const result = await reviewLifeEventProposal(lifeIntelligenceRepository, request);
      if (!mountedRef.current) return true;
      setBatches((current) => current.map((batch) => ({ ...batch, proposals: batch.proposals.map((proposal) => proposal.id === result.proposal.id ? result.proposal : proposal) })));
      setMessage(result.proposal.status === "rejected" ? "已拒绝，没有加入生活地图。" : "审核已保存，原记录保持不变。");
      await refreshLocal();
      return true;
    } catch (error) {
      if (mountedRef.current) {
        setReviewErrors((current) => ({ ...current, [request.proposalId]: localError(error, "审核未能保存，请重新读取后再试。修正内容仍然保留。") }));
        await refreshLocal();
      }
      return false;
    } finally {
      reviewLock.current = false;
      if (mountedRef.current) setReviewing(false);
    }
  }

  const busy = extracting || reviewing;

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); requestClose(); }}>
    <header className={styles.dialogHeader}><h2 id={titleId}>整理记录</h2><button type="button" className={styles.close} aria-label="关闭整理" disabled={reviewing} onClick={requestClose}><Cross2Icon aria-hidden="true" /></button></header>
    <div className={styles.dialogBody}>
      <p id={descriptionId} className={styles.introduction}>仅发送这条记录的文字给配置的 AI 服务。确认候选后才加入生活地图，原文保持不变。</p>
      <p className={styles.helper}>{source.type === "moment" ? "只整理随笔原文，不发送追加、图片或位置。" : "整理日记的完整标题和正文，不发送其他记录。"}查看和审核已有候选均在本机完成。</p>
      {restoring ? <ReadingPlaceholder label="正在读取本机整理记录…" /> : null}
      {sourceError ? <p className={styles.sourceWarning} role="status">{sourceError}</p> : null}
      {snapshot ? <div className={styles.sourceContext}>
        <p>参考日期 <time dateTime={snapshot.request.context.occurredOn}>{snapshot.request.context.occurredOn}</time><span>使用设备时区 {snapshot.request.context.timeZone}</span></p>
        <details className={styles.sourcePreview}><summary>本次发送的文字</summary><pre>{snapshot.request.text}</pre></details>
      </div> : null}
      <div className={styles.startActions}><button className={styles.primary} type="button" disabled={busy || restoring || !!sourceError || !!loadError} onClick={() => void startExtraction()}>{extracting ? "正在整理…" : "开始整理"}</button>{extracting ? <span className={styles.helper}>关闭可停止等待。</span> : null}</div>
      <p className={styles.announcement} role="status" aria-live="polite">{extracting ? "正在整理，请稍候。" : message}</p>
      {extractError ? <p className={styles.error} role="alert">{extractError}</p> : null}
      {loadError ? <p className={styles.error} role="alert">{loadError}</p> : null}
      {loadError || sourceError ? <button className={styles.retry} type="button" disabled={busy} onClick={() => void refreshLocal()}>重新读取</button> : null}
      {!restoring && !loadError && batches.length === 0 ? <p className={styles.empty}>还没有整理过这条记录。</p> : null}
      {batches.map((batch) => <section className={styles.batch} key={batch.job.id} aria-label={`${jobDate(batch.job.createdAt)}的整理`}>
        <header className={styles.batchHeader}><h2>候选事件</h2><time dateTime={batch.job.createdAt}>{jobDate(batch.job.createdAt)}</time></header>
        {batch.proposals.length === 0 ? <p className={styles.empty}>这次整理没有发现明确的生活事件。</p> : batch.proposals.map((proposal) => <div key={proposal.id}>
          <RecordExtractionCandidate proposal={proposal} sourceStatus={batch.sourceStatuses[proposal.id]} evidenceText={evidenceFor(batch, proposal, snapshot)} busy={busy} onReview={review} onDirtyChange={setDirty} />
          {reviewErrors[proposal.id] ? <p className={styles.error} role="alert">{reviewErrors[proposal.id]}</p> : null}
        </div>)}
      </section>)}
    </div>
  </dialog>;
}
