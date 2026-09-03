"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { StatefulButton, type StatefulButtonResult } from "@/components/ui/stateful-button";
import { Reveal } from "@/components/ui/reveal";
import { WritingTextarea } from "@/components/ui/writing-textarea";
import { MotionEntry } from "@/components/ui/motion-entry";

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
  const inputId = useId();
  const [appends, setAppends] = useState<MomentAppend[]>([]);
  const [enteringIds, setEnteringIds] = useState<ReadonlySet<string>>(new Set());
  const [isWriting, setIsWriting] = useState(false);
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocusRef = useRef(false);
  const seenIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (isWriting) textareaRef.current?.focus({ preventScroll: true });
    if (!isWriting && restoreFocusRef.current) {
      triggerRef.current?.focus({ preventScroll: true });
      restoreFocusRef.current = false;
    }
  }, [isWriting]);

  useEffect(() => {
    let isCurrent = true;

    async function load(): Promise<void> {
      try {
        const stored = await listMomentAppends(momentId);
        if (!isCurrent) return;
        setEnteringIds(new Set(stored.filter((append) => seenIdsRef.current && !seenIdsRef.current.has(append.id)).map((append) => append.id)));
        seenIdsRef.current = new Set(stored.map((append) => append.id));
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
    restoreFocusRef.current = true;
    setIsWriting(false);
  }

  async function saveAppend(): Promise<StatefulButtonResult> {
    if (isSubmittingRef.current) return false;
    if (text.trim().length === 0) {
      setSaveError("请输入文字后再保存。");
      return false;
    }

    isSubmittingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      await createMomentAppend(momentId, { text });
      setRefreshRevision((current) => current + 1);
      return () => {
        setText("");
        restoreFocusRef.current = true;
        setIsWriting(false);
        isSubmittingRef.current = false;
        setIsSaving(false);
      };
    } catch {
      setSaveError("追加保存失败，请重试。输入内容仍然保留。");
      isSubmittingRef.current = false;
      setIsSaving(false);
      return false;
    }
  }

  return (
    <section className="moment-appends" aria-label="追加内容">
        <div className={appends.length > 0 ? "append-list" : undefined}>
          <AnimatePresence initial={false}>
          {appends.map((append) => (
            <MotionEntry as="div" className="append-entry" key={append.id} enter={enteringIds.has(append.id)}>
              <time dateTime={append.createdAt}>后来补充 {formatAppendTime(append.createdAt)}</time>
              <p>{append.text}</p>
            </MotionEntry>
          ))}
          </AnimatePresence>
        </div>
      {readError ? <p className="append-error" role="status">{readError}</p> : null}
      <Reveal open={isWriting}>
        <div className="append-editor">
          <label htmlFor={inputId}>追加文字</label>
          <WritingTextarea
            ref={textareaRef}
            id={inputId}
            aria-label="追加文字"
            aria-invalid={!!saveError}
            aria-describedby={saveError ? `${inputId}-error` : undefined}
            autoFocus
            disabled={isSaving}
            onChange={(event) => setText(event.target.value)}
            placeholder="后来还想补充……"
            value={text}
          />
          {saveError ? <p id={`${inputId}-error`} className="append-error" role="alert">{saveError}</p> : null}
          <div className="append-actions">
            <button disabled={isSaving} type="button" onClick={cancelWriting}>取消</button>
            <StatefulButton disabled={isSaving} label="保存追加" onAction={saveAppend} />
          </div>
        </div>
      </Reveal>
      {!isWriting ? (
        <button ref={triggerRef} className="append-trigger" type="button" onClick={beginWriting}>追加</button>
      ) : null}
    </section>
  );
}
