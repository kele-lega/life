"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createDiary, updateDiaryContent } from "../repository/diary-repository";

interface DiaryEditorProps {
  diaryId?: string;
  initialTitle?: string;
  initialBody?: string;
  onSaved?: (diary: Awaited<ReturnType<typeof createDiary>>) => void;
  onCancel?: () => void;
}

export function DiaryEditor({ diaryId, initialTitle = "", initialBody = "", onSaved, onCancel }: DiaryEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (title !== initialTitle || body !== initialBody) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [body, initialBody, initialTitle, title]);

  async function save(): Promise<void> {
    if (submitting.current) return;
    if (body.trim().length === 0) {
      setError("请输入正文后再保存。");
      return;
    }
    if (diaryId && title === initialTitle && body === initialBody) {
      if (onCancel) onCancel();
      else router.push(`/diary/${diaryId}`);
      return;
    }
    submitting.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const diary = diaryId
        ? await updateDiaryContent(diaryId, { title, body })
        : await createDiary({ title, body });
      if (onSaved) onSaved(diary);
      else router.push(`/diary/${diary.id}`);
    } catch {
      setError("保存失败，请重试。正文仍然保留。");
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  }

  function cancel(): void {
    if (isSaving) return;
    if ((title !== initialTitle || body !== initialBody) && !window.confirm("放弃这篇尚未保存的日记？")) return;
    if (onCancel) onCancel();
    else router.push("/diary");
  }

  return (
    <main className="diary-page">
      <nav className="diary-nav"><Link href="/diary">返回日记</Link></nav>
      <section className="diary-editor" aria-label={diaryId ? "编辑日记" : "新建日记"}>
        <h1>{diaryId ? "编辑日记" : "新建日记"}</h1>
        <input aria-label="日记标题（可选）" disabled={isSaving} onChange={(event) => setTitle(event.target.value)} placeholder="标题（可选）" value={title} />
        <textarea aria-label="日记正文" autoFocus disabled={isSaving} onChange={(event) => setBody(event.target.value)} placeholder="写下这一段时间……" value={body} />
        {error ? <p role="alert">{error}</p> : null}
        <div className="diary-actions"><button disabled={isSaving} type="button" onClick={cancel}>取消</button><button disabled={isSaving} type="button" onClick={save}>{isSaving ? "保存中…" : "保存日记"}</button></div>
      </section>
    </main>
  );
}
