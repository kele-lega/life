"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { normalizeLifeEventCandidate } from "../model/candidate";
import type { LifeEventCandidate, LifeEventProposal, LifeEventProposalSourceStatus, ProposalReviewRequest } from "../model/types";
import styles from "./record-extraction.module.css";

const categoryLabels: Record<LifeEventCandidate["category"], string> = { activity: "活动", learning: "学习", creation: "创作", place: "地点" };
const statusLabels: Record<LifeEventProposal["status"], string> = { pending: "待审核", accepted: "已接受", corrected: "已修正", rejected: "已拒绝", superseded: "已过期" };

function durationLabel(seconds: number | null) {
  if (seconds === null) return "时长未指定";
  if (seconds > 0 && seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  if (seconds > 0 && seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function instantLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function sourceMessage(status: LifeEventProposalSourceStatus | undefined) {
  if (status === "stale") return "原记录已变化。这个版本的候选只能拒绝；可重新整理当前原文。";
  if (status === "missing") return "原记录已删除或无法找到。这个候选只能拒绝。";
  if (status !== "current") return "暂时无法核对原记录，请重新读取后再接受或修正。";
  return null;
}

interface Draft {
  category: LifeEventCandidate["category"];
  name: string;
  occurredOn: string;
  timeZone: string;
  timePrecision: LifeEventCandidate["timePrecision"];
  startAt: string;
  endAt: string;
  durationSeconds: string;
}

function candidateDraft(candidate: LifeEventCandidate): Draft {
  return { ...candidate, startAt: candidate.startAt?.slice(0, -1) ?? "", endAt: candidate.endAt?.slice(0, -1) ?? "", durationSeconds: candidate.durationSeconds === null ? "" : String(candidate.durationSeconds) };
}

function CorrectionEditor({ proposal, busy, canSave, onSave, onCancel, onDirtyChange }: {
  proposal: LifeEventProposal;
  busy: boolean;
  canSave: boolean;
  onSave: (candidate: LifeEventCandidate) => Promise<boolean>;
  onCancel: () => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => candidateDraft(proposal.candidate));
  const [validationError, setValidationError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(candidateDraft(proposal.candidate));
  const errorId = useId();

  useEffect(() => {
    onDirtyChange(proposal.id, dirty);
    return () => onDirtyChange(proposal.id, false);
  }, [dirty, onDirtyChange, proposal.id]);

  function update<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidationError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSave) return;
    let correction: LifeEventCandidate;
    try {
      correction = normalizeLifeEventCandidate({
        category: draft.category,
        name: draft.name,
        occurredOn: draft.occurredOn,
        timeZone: draft.timeZone,
        timePrecision: draft.timePrecision,
        startAt: draft.timePrecision === "day" ? null : new Date(`${draft.startAt}Z`).toISOString(),
        endAt: draft.timePrecision === "interval" ? new Date(`${draft.endAt}Z`).toISOString() : null,
        durationSeconds: draft.timePrecision === "interval" || draft.durationSeconds === "" ? null : Number(draft.durationSeconds),
      });
    } catch {
      setValidationError("请检查日期、时区和时间。结束时间须晚于开始时间，日期须与该时区的开始时间一致，时长须为非负整数秒。");
      return;
    }
    if (await onSave(correction)) onDirtyChange(proposal.id, false);
  }

  function cancel() {
    if (dirty && !window.confirm("放弃尚未保存的修正？")) return;
    onCancel();
  }

  return <form className={styles.correction} onSubmit={(event) => void submit(event)}>
    <fieldset disabled={busy || !canSave} aria-describedby={validationError ? errorId : undefined}>
      <legend>修正候选</legend>
      <label className={styles.fullField}>修正名称<input autoFocus required value={draft.name} onChange={(event) => update("name", event.target.value)} /></label>
      <label>修正类别<select value={draft.category} onChange={(event) => update("category", event.target.value as Draft["category"])}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>修正日期<input type="date" required value={draft.occurredOn} onChange={(event) => update("occurredOn", event.target.value)} /></label>
      <label>修正时区<input required value={draft.timeZone} onChange={(event) => update("timeZone", event.target.value)} /></label>
      <label>时间精度<select value={draft.timePrecision} onChange={(event) => update("timePrecision", event.target.value as Draft["timePrecision"])}><option value="day">只确定日期</option><option value="time">具体时间</option><option value="interval">时间区间</option></select></label>
      {draft.timePrecision !== "day" ? <label className={styles.fullField}>开始时间（UTC）<input type="datetime-local" step="0.001" required value={draft.startAt} onChange={(event) => update("startAt", event.target.value)} /></label> : null}
      {draft.timePrecision === "interval" ? <label className={styles.fullField}>结束时间（UTC）<input type="datetime-local" step="0.001" required value={draft.endAt} onChange={(event) => update("endAt", event.target.value)} /></label> : <label className={styles.fullField}>持续时间（秒，可留空）<input type="number" min="0" step="1" inputMode="numeric" value={draft.durationSeconds} onChange={(event) => update("durationSeconds", event.target.value)} /></label>}
      {draft.timePrecision !== "day" ? <p className={`${styles.helper} ${styles.fullField}`}>具体时间以 UTC 输入，日期按所填时区核对。{draft.timePrecision === "interval" ? "持续时间由开始与结束时间计算。" : ""}</p> : null}
      {validationError ? <p id={errorId} className={`${styles.error} ${styles.fullField}`} role="alert">{validationError}</p> : null}
    </fieldset>
    <div className={styles.actions}><button className={styles.primary} disabled={busy || !canSave} type="submit">{busy ? "正在保存…" : "保存修正"}</button><button disabled={busy} type="button" onClick={cancel}>取消修正</button></div>
  </form>;
}

export function RecordExtractionCandidate({ proposal, sourceStatus, evidenceText, busy, onReview, onDirtyChange }: {
  proposal: LifeEventProposal;
  sourceStatus: LifeEventProposalSourceStatus | undefined;
  evidenceText: string | null;
  busy: boolean;
  onReview: (request: ProposalReviewRequest) => Promise<boolean>;
  onDirtyChange: (id: string, dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const correctRef = useRef<HTMLButtonElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const candidate = proposal.correctedCandidate ?? proposal.candidate;
  const isPending = proposal.status === "pending";
  const sourceWarning = isPending ? sourceMessage(sourceStatus) : null;
  const evidence = evidenceText === null ? [] : proposal.evidenceRanges.filter(({ start, end }) => start >= 0 && end > start && end <= evidenceText.length).map(({ start, end }) => evidenceText.slice(start, end));

  async function correct(correction: LifeEventCandidate) {
    const saved = await onReview({ action: "correct", proposalId: proposal.id, lifeEventId: crypto.randomUUID(), reviewedAt: new Date().toISOString(), correction });
    if (saved) setEditing(false);
    return saved;
  }

  return <article className={styles.candidate} aria-labelledby={titleId}>
    <header className={styles.candidateHeader}><h3 id={titleId}>{candidate.name}</h3><span className={styles.status} data-status={proposal.status}>{statusLabels[proposal.status]}</span></header>
    <div className={styles.candidateMeta}><span>{categoryLabels[candidate.category]}</span><time dateTime={candidate.occurredOn}>{candidate.occurredOn}</time><span>{durationLabel(candidate.durationSeconds)}</span></div>
    {candidate.startAt ? <p className={styles.helper}>{instantLabel(candidate.startAt, candidate.timeZone)}{candidate.endAt ? ` 至 ${instantLabel(candidate.endAt, candidate.timeZone)}` : ""}（{candidate.timeZone}）</p> : <p className={styles.helper}>按 {candidate.timeZone} 的日期记录</p>}
    {evidence.length ? <blockquote className={styles.evidence} aria-label="原文证据">{evidence.map((text, index) => <p key={index}>{text}</p>)}</blockquote> : null}
    {sourceWarning ? <p className={styles.sourceWarning}>{sourceWarning}</p> : null}
    {isPending && !editing ? <div className={styles.actions}>
      <button className={styles.primary} disabled={busy || !!sourceWarning} type="button" onClick={() => void onReview({ action: "accept", proposalId: proposal.id, lifeEventId: crypto.randomUUID(), reviewedAt: new Date().toISOString() })}>接受</button>
      <button ref={correctRef} disabled={busy || !!sourceWarning} type="button" onClick={() => setEditing(true)}>修正</button>
      <button ref={rejectRef} disabled={busy} type="button" onClick={() => void onReview({ action: "reject", proposalId: proposal.id, reviewedAt: new Date().toISOString() })}>拒绝</button>
    </div> : null}
    {isPending && editing ? <CorrectionEditor proposal={proposal} busy={busy} canSave={!sourceWarning} onSave={correct} onCancel={() => { setEditing(false); requestAnimationFrame(() => (sourceWarning ? rejectRef : correctRef).current?.focus({ preventScroll: true })); }} onDirtyChange={onDirtyChange} /> : null}
    {proposal.status === "rejected" ? <p className={styles.helper}>没有加入生活地图。</p> : null}
    {proposal.status === "accepted" || proposal.status === "corrected" ? <p className={styles.helper}>审核结果已保存在本机。{sourceStatus === "current" ? "已加入生活地图，原文保持不变。" : "原记录恢复有效后，可重新出现在生活地图中。"}</p> : null}
  </article>;
}
