"use client";

import { useEffect, useRef, useState } from "react";

import { runLifeExtraction } from "../application/run-life-extraction";
import { reviewLifeEventProposal } from "../application/review-proposal";
import { FakeLifeEventExtractor } from "../extractor/fake-life-event-extractor";
import type {
  LifeEventCandidate,
  LifeEventMaterialization,
  LifeEventProposal,
  LifeExtractionJob,
  ProposalReviewRequest,
} from "../model/types";
import { lifeIntelligenceRepository } from "../repository/dexie-life-intelligence-repository";
import styles from "./life-extraction-lab.module.css";

const categoryLabels: Record<LifeEventCandidate["category"], string> = {
  activity: "活动",
  learning: "学习",
  creation: "创作",
  place: "地点",
};

const statusLabels: Record<LifeEventProposal["status"], string> = {
  pending: "待审核",
  accepted: "已接受",
  corrected: "已修正",
  rejected: "已拒绝",
  superseded: "已过期",
};

const exampleText = "下午在咖啡馆看书40分钟，晚上跑步半小时。";

function localDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function durationText(seconds: number | null): string {
  if (seconds === null) return "未指定";
  if (seconds % 3_600 === 0) return `${seconds / 3_600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function CandidateDetails({ candidate }: { candidate: LifeEventCandidate }) {
  return (
    <dl className={styles.structure}>
      <div><dt>类别</dt><dd>{candidate.category} · {categoryLabels[candidate.category]}</dd></div>
      <div><dt>名称</dt><dd>{candidate.name}</dd></div>
      <div><dt>日期</dt><dd>{candidate.occurredOn}</dd></div>
      <div><dt>持续时间</dt><dd>{durationText(candidate.durationSeconds)}</dd></div>
      <div><dt>时间精度</dt><dd>{candidate.timePrecision}</dd></div>
      <div><dt>时区</dt><dd>{candidate.timeZone}</dd></div>
    </dl>
  );
}

function MaterializedEvent({ event }: { event: LifeEventMaterialization }) {
  return (
    <section className={styles.materialized} aria-label={`最终 LifeEvent：${event.name}`}>
      <div className={styles.materializedHeading}>
        <p>Materialized LifeEvent</p>
        <span data-origin={event.origin}>{event.origin}</span>
      </div>
      <CandidateDetails candidate={event} />
      <p className={styles.provenance}>Proposal · {event.extractionProposalId}</p>
    </section>
  );
}

interface ProposalCardProps {
  proposal: LifeEventProposal;
  event: LifeEventMaterialization | undefined;
  busy: boolean;
  onReview: (request: ProposalReviewRequest) => Promise<void>;
}

function ProposalCard({ proposal, event, busy, onReview }: ProposalCardProps) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(proposal.candidate.category);
  const [name, setName] = useState(proposal.candidate.name);
  const [occurredOn, setOccurredOn] = useState(proposal.candidate.occurredOn);
  const [timeZone, setTimeZone] = useState(proposal.candidate.timeZone);
  const [durationMinutes, setDurationMinutes] = useState(
    proposal.candidate.durationSeconds === null ? "" : String(proposal.candidate.durationSeconds / 60),
  );
  const isPending = proposal.status === "pending";
  const titleId = `proposal-${proposal.id}`;

  async function submitCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = durationMinutes === "" ? null : Number(durationMinutes);
    await onReview({
      action: "correct",
      proposalId: proposal.id,
      lifeEventId: crypto.randomUUID(),
      reviewedAt: new Date().toISOString(),
      correction: {
        ...proposal.candidate,
        category,
        name,
        occurredOn,
        timeZone,
        durationSeconds: minutes === null ? null : Math.round(minutes * 60),
      },
    });
    setEditing(false);
  }

  return (
    <li>
      <article className={styles.proposal} aria-labelledby={titleId}>
        <header className={styles.proposalHeader}>
          <div>
            <p>候选 LifeEvent</p>
            <h2 id={titleId}>{proposal.candidate.name}</h2>
          </div>
          <span className={styles.status} data-status={proposal.status}>{statusLabels[proposal.status]}</span>
        </header>

        <CandidateDetails candidate={proposal.candidate} />

        {isPending && !editing ? (
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => onReview({
              action: "accept",
              proposalId: proposal.id,
              lifeEventId: crypto.randomUUID(),
              reviewedAt: new Date().toISOString(),
            })}>Accept</button>
            <button type="button" disabled={busy} onClick={() => setEditing(true)}>Correct</button>
            <button type="button" disabled={busy} onClick={() => onReview({
              action: "reject",
              proposalId: proposal.id,
              reviewedAt: new Date().toISOString(),
            })}>Reject</button>
          </div>
        ) : null}

        {isPending && editing ? (
          <form className={styles.correction} onSubmit={submitCorrection}>
            <fieldset disabled={busy}>
              <legend>修正候选</legend>
              <label>修正类别<select value={category} onChange={(event) => setCategory(event.target.value as LifeEventCandidate["category"])}>
                {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label>修正名称<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label>修正日期<input required type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} /></label>
              <label>修正持续时间（分钟）<input type="number" min="0" step="1" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></label>
              <label>修正时区<input required value={timeZone} onChange={(event) => setTimeZone(event.target.value)} /></label>
              <div className={styles.actions}>
                <button type="submit">保存修正</button>
                <button type="button" onClick={() => setEditing(false)}>取消</button>
              </div>
            </fieldset>
          </form>
        ) : null}

        {event ? <MaterializedEvent event={event} /> : null}
        {proposal.status === "rejected" ? <p className={styles.noEvent}>已拒绝，没有生成 LifeEvent。</p> : null}
      </article>
    </li>
  );
}

interface ReviewBatch {
  jobId: string;
  sourceText: string;
  proposals: readonly LifeEventProposal[];
}

async function restoreBatch(
  job: LifeExtractionJob,
  proposals: readonly LifeEventProposal[] = [],
): Promise<{ batch: ReviewBatch; events: Record<string, LifeEventMaterialization> }> {
  if (job.input.kind !== "scratch") throw new Error("The Lab can only restore scratch extraction jobs.");
  const restoredProposals = proposals.length
    ? proposals
    : await lifeIntelligenceRepository.listProposalsByJob(job.id);
  const materialized = await Promise.all(restoredProposals.map(async (proposal) => [
    proposal.id,
    await lifeIntelligenceRepository.getMaterializedLifeEvent(proposal.id),
  ] as const));
  return {
    batch: { jobId: job.id, sourceText: job.input.text, proposals: restoredProposals },
    events: Object.fromEntries(materialized.filter((entry): entry is readonly [string, LifeEventMaterialization] => Boolean(entry[1]))),
  };
}

export function LifeExtractionLab() {
  const extractorRef = useRef(new FakeLifeEventExtractor());
  const [text, setText] = useState(exampleText);
  const [occurredOn, setOccurredOn] = useState(localDate);
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [batch, setBatch] = useState<ReviewBatch | null>(null);
  const [events, setEvents] = useState<Record<string, LifeEventMaterialization>>({});
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [message, setMessage] = useState("正在从本机恢复审核状态…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const job = await lifeIntelligenceRepository.getLatestJob("scratch");
        if (cancelled) return;
        if (!job) {
          setMessage("等待提取。本页状态会保存到本机 IndexedDB。");
          return;
        }
        const restored = await restoreBatch(job);
        if (cancelled) return;
        setText(job.input.kind === "scratch" ? job.input.text : exampleText);
        setOccurredOn(job.context.occurredOn);
        setTimeZone(job.context.timeZone);
        setBatch(restored.batch);
        setEvents(restored.events);
        setMessage(`已恢复 ${restored.batch.proposals.length} 个候选及其审核状态。`);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "恢复审核状态失败。");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, []);

  async function extract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    setExtracting(true);
    setError(null);
    try {
      const sourceText = text;
      const result = await runLifeExtraction(lifeIntelligenceRepository, extractorRef.current, {
        input: { kind: "scratch" },
        text: sourceText,
        context: { occurredOn, timeZone },
      });
      const restored = await restoreBatch(result.job, result.proposals);
      setEvents(restored.events);
      setBatch(restored.batch);
      setMessage(result.proposals.length
        ? `已生成 ${result.proposals.length} 个待审核候选。`
        : "提取完成，没有发现支持的候选事件。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提取失败。");
    } finally {
      setExtracting(false);
    }
  }

  async function review(request: ProposalReviewRequest) {
    setBusyProposalId(request.proposalId);
    setError(null);
    try {
      const result = await reviewLifeEventProposal(lifeIntelligenceRepository, request);
      setBatch((current) => current ? {
        ...current,
        proposals: current.proposals.map((proposal) => proposal.id === result.proposal.id ? result.proposal : proposal),
      } : current);
      if (result.lifeEvent) {
        setEvents((current) => ({ ...current, [result.proposal.id]: result.lifeEvent! }));
      }
      setMessage(result.proposal.status === "rejected"
        ? "候选已拒绝，没有生成 LifeEvent。"
        : `候选已${result.proposal.status === "accepted" ? "接受" : "修正"}并生成 ${result.lifeEvent?.origin} LifeEvent。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "审核失败。");
    } finally {
      setBusyProposalId(null);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}><span>Contract Lab</span><span>IndexedDB</span></div>
        <h1>Life Intelligence Review</h1>
        <p>用确定性的 Fake Extractor 验证自然记录如何成为可审核的 LifeEvent 候选。</p>
      </header>

      <aside className={styles.notice} aria-label="实验数据说明">
        Job、候选和审核状态保存在本机 IndexedDB。接受或修正后会创建真实 LifeEvent，并影响 Life Map；拒绝不会创建 LifeEvent。
      </aside>

      <form className={styles.sourceForm} onSubmit={extract}>
        <label>原始文本<textarea rows={5} required value={text} onChange={(event) => setText(event.target.value)} /></label>
        <div className={styles.contextFields}>
          <label>发生日期<input type="date" required value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} /></label>
          <label>解释时区<input required value={timeZone} onChange={(event) => setTimeZone(event.target.value)} /></label>
        </div>
        <button className={styles.extractButton} type="submit" disabled={restoring || extracting || !occurredOn}>
          {extracting ? "正在提取…" : "提取候选"}
        </button>
      </form>

      <p className={styles.announcement} role="status" aria-live="polite">{message}</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {batch ? (
        <section className={styles.review} aria-labelledby="review-heading">
          <div className={styles.reviewHeading}>
            <div><p>Source snapshot</p><h2 id="review-heading">审核候选</h2></div>
            <span>{batch.proposals.length} 个</span>
          </div>
          <blockquote>{batch.sourceText}</blockquote>
          {batch.proposals.length ? (
            <ol className={styles.proposalList}>
              {batch.proposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  event={events[proposal.id]}
                  busy={busyProposalId === proposal.id}
                  onReview={review}
                />
              ))}
            </ol>
          ) : <p className={styles.empty}>这段文字没有产生候选 LifeEvent。</p>}
        </section>
      ) : null}
    </main>
  );
}
