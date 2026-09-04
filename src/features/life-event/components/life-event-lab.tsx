"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createEntityId } from "@/lib/identity/create-entity-id";
import type { LifeEventCategory, LifeEventPage, LifeEventView } from "../model/types";
import { createManualLifeEvent, getLifeEvent, listLifeEventsPage } from "../repository/life-event-repository";
import styles from "./life-event-lab.module.css";

const categories: Record<LifeEventCategory, string> = { activity: "活动", learning: "学习", creation: "创作", place: "地点" };

export function LifeEventLab() {
  const [date, setDate] = useState("");
  const [category, setCategory] = useState<LifeEventCategory>("learning");
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("");
  const [page, setPage] = useState<LifeEventPage | null>(null);
  const [saved, setSaved] = useState<LifeEventView | null>(null);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const busy = useRef(false);
  const readBusy = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const submission = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    const request = ++generation.current;
    listLifeEventsPage().then((result) => {
      if (mounted.current && request === generation.current) setPage(result);
    }).catch(() => {
      if (mounted.current && request === generation.current) setReadError("读取失败，请重试。");
    }).finally(() => {
      if (mounted.current && request === generation.current) setReading(false);
    });
    return () => { mounted.current = false; };
  }, []);

  async function readMore(replace = false) {
    if (busy.current || readBusy.current) return;
    readBusy.current = true;
    const request = ++generation.current;
    setReading(true);
    setReadError(null);
    try {
      const result = await listLifeEventsPage({ cursor: replace ? null : page?.nextCursor });
      if (mounted.current && request === generation.current) {
        setPage((old) => ({ ...result, items: replace ? result.items : [...(old?.items ?? []), ...result.items] }));
      }
    } catch {
      if (mounted.current && request === generation.current) setReadError("读取失败，请重试。");
    } finally {
      readBusy.current = false;
      if (mounted.current && request === generation.current) setReading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || readBusy.current) return;
    busy.current = true;
    generation.current++;
    setSaving(true);
    setReading(false);
    setSaveError(null);
    setSaved(null);
    let committed = false;
    try {
      const durationSeconds = minutes === "" ? null : Number(minutes) * 60;
      if (durationSeconds !== null && (!Number.isSafeInteger(durationSeconds) || durationSeconds < 0)) {
        throw new Error("持续时间必须能换算为非负整数秒。");
      }
      const input = {
        category, name, occurredOn: date, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timePrecision: "day" as const, durationSeconds,
      };
      const signature = JSON.stringify(input);
      if (submission.current?.signature !== signature) submission.current = { signature, id: createEntityId() };
      const created = await createManualLifeEvent({ ...input, id: submission.current.id });
      committed = true;
      // Do not use the creation return value as the displayed persisted data.
      const [persisted, refreshed] = await Promise.all([getLifeEvent(created.id), listLifeEventsPage()]);
      if (!persisted) throw new Error("保存的事件暂时无法读取。");
      if (mounted.current) {
        setSaved(persisted);
        setPage(refreshed);
        setReadError(null);
        setName("");
        setMinutes("");
        submission.current = null;
      }
    } catch (error) {
      if (mounted.current) setSaveError(committed
        ? "保存已提交，但重新读取失败。输入仍保留，再次保存会重试同一事件。"
        : `${error instanceof Error ? error.message : "保存失败。"} 输入仍保留，可以重试。`);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1>LifeEvent 实验页</h1>
      <p className={styles.hint}>手动验证事件数据。这里保存的是真实本地数据，不会出现在首页、时间线或日历。</p>
      <form onSubmit={save} aria-label="创建事件">
        <fieldset disabled={saving} className={styles.fields}>
          <label>日期<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>类别<select value={category} onChange={(event) => setCategory(event.target.value as LifeEventCategory)}>
            {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>名称<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>持续时间（分钟，可选）<input type="number" min="0" step="any" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
          <button type="submit" disabled={saving || reading}>{saving ? "保存中…" : "保存"}</button>
        </fieldset>
      </form>
      {saveError && <p role="alert">{saveError}</p>}
      <p role="status">{saved ? `已从本地读取：${saved.name} · ${saved.occurredOn}` : ""}</p>
      <section aria-label="已保存事件" className={styles.results}>
        <h2>已保存事件</h2>
        {reading && <p role="status">读取中…</p>}
        {readError && <p role="alert">{readError} <button disabled={reading || saving} onClick={() => void readMore(!page)}>重试读取</button></p>}
        {!reading && !readError && page?.items.length === 0 && <p className={styles.hint}>还没有事件。</p>}
        <ul>{page?.items.map((item) => <li key={item.id}>
          <p className={styles.name}>{item.name}</p>
          <p className={styles.hint}><time dateTime={item.occurredOn}>{item.occurredOn}</time> · {categories[item.category]} · {item.durationSeconds === null ? "未填写持续时间" : `${item.durationSeconds} 秒`}</p>
          {item.sourceStatus === "stale" && <p className={styles.hint}>来源内容已变化，此事件尚未重新核对。</p>}
        </li>)}</ul>
        {page?.hasMore && !readError && <button disabled={reading || saving} onClick={() => void readMore()}>加载更多</button>}
      </section>
    </main>
  );
}
