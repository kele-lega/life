"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Diary } from "../model/types";
import { getDiary } from "../repository/diary-repository";
import { DiaryEditor } from "./diary-editor";

function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(timestamp));
}

export function DiaryDetail({ id }: { id: string }) {
  const [diary, setDiary] = useState<Diary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let current = true;
    void getDiary(id).then((stored) => {
      if (!current) return;
      if (!stored || stored.deletedAt !== null) setError("找不到这篇日记。");
      else setDiary(stored);
    }).catch(() => {
      if (current) setError("日记暂时无法读取。");
    });
    return () => { current = false; };
  }, [id]);

  if (error) return <main className="diary-page"><nav className="diary-nav"><Link href="/diary">返回日记</Link></nav><p role="alert">{error}</p></main>;
  if (!diary) return <main className="diary-page"><p>正在读取日记……</p></main>;
  if (editing) return <DiaryEditor diaryId={diary.id} initialTitle={diary.title} initialBody={diary.body} onSaved={(updated) => { setDiary(updated); setEditing(false); }} onCancel={() => setEditing(false)} />;

  return (
    <main className="diary-page">
      <nav className="diary-nav"><Link href="/diary">返回日记</Link><button type="button" onClick={() => setEditing(true)}>编辑</button></nav>
      <article className="diary-view">
        {diary.title ? <h1>{diary.title}</h1> : null}
        <time dateTime={diary.createdAt}>创建于 {formatDate(diary.createdAt)}</time>
        <p>{diary.body}</p>
      </article>
    </main>
  );
}
