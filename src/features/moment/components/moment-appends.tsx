"use client";

import { useEffect, useRef, useState } from "react";

import type { MomentAppend } from "@/features/moment/model/types";
import {
  createMomentAppend,
  listMomentAppends,
} from "@/features/moment/repository/moment-repository";

interface MomentAppendsProps {
  momentId: string;
}

function formatAppendTime(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function MomentAppends({ momentId }: MomentAppendsProps) {
  const [appends, setAppends] = useState<MomentAppend[]>([]);
  const [isWriting, setIsWriting] = useState(false);
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    let isCurrent = true;

    async function load(): Promise<void> {
      try {
        const stored = await listMomentAppends(momentId);
        if (!isCurrent) return;
        setAppends(stored);
        setReadError(null);
      } catch {
        if (isCurrent) setReadError("追加内容暂时无法读取。");
      }
    }

    void load();
    return () => {
      isCurrent = false;
    };
  }, [momentId, refreshRevision]);

  function beginWriting(): void {
    setSaveError(null);
    setIsWriting(true);
  }

  function cancelWriting(): void {
    if (isSubmittingRef.current) return;
    if (text.trim().length > 0 && !window.confirm("放弃这条尚未保存的追加？")) return;
    setText("");
    setSaveError(null);
    setIsWriting(false);
  }

  async function saveAppend(): Promise<void> {
    if (isSubmittingRef.current) return;
    if (text.trim().length === 0) {
      setSaveError("请输入文字后再保存。");
      return;
    }

    isSubmittingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      await createMomentAppend(momentId, { text });
      setText("");
      setIsWriting(false);
      setRefreshRevision((current) => current + 1);
    } catch {
      setSaveError("追加保存失败，请重试。输入内容仍然保留。");
    } finally {
      isSubmittingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <section className="moment-appends" aria-label="追加内容">
      {appends.length > 0 ? (
        <div className="append-list">
          {appends.map((append) => (
            <div className="append-entry" key={append.id}>
              <time dateTime={append.createdAt}>{formatAppendTime(append.createdAt)}</time>
              <p>{append.text}</p>
            </div>
          ))}
        </div>
      ) : null}
      {readError ? <p className="append-error" role="status">{readError}</p> : null}
      {isWriting ? (
        <div className="append-editor">
          <textarea
            aria-label="追加文字"
            autoFocus
            disabled={isSaving}
            onChange={(event) => setText(event.target.value)}
            placeholder="后来还想补充……"
            value={text}
          />
          {saveError ? <p className="append-error" role="alert">{saveError}</p> : null}
          <div className="append-actions">
            <button disabled={isSaving} type="button" onClick={cancelWriting}>取消</button>
            <button disabled={isSaving} type="button" onClick={saveAppend}>
              {isSaving ? "保存中…" : "保存追加"}
            </button>
          </div>
        </div>
      ) : (
        <button className="append-trigger" type="button" onClick={beginWriting}>追加</button>
      )}
    </section>
  );
}
