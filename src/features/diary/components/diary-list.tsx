"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Diary } from "../model/types";
import { listDiaries } from "../repository/diary-repository";

function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(timestamp));
}

function preview(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 120)}…` : compact;
}

export function DiaryList() {
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void listDiaries().then((items) => {
      if (current) setDiaries(items);
    }).catch(() => {
      if (current) setError("日记暂时无法读取。");
    });
    return () => { current = false; };
  }, []);

  return (
    <main className="diary-page">
      <nav className="diary-nav"><Link href="/">返回首页</Link><Link className="primary-link" href="/diary/new">新建日记</Link></nav>
      <header className="diary-header"><h1>日记</h1><p>记录完整的一段生活。</p></header>
      {error ? <p role="alert">{error}</p> : null}
      {diaries.length === 0 && !error ? <p className="diary-empty">还没有日记。</p> : null}
      <div className="diary-list">
        {diaries.map((diary) => (
          <Link className="diary-entry" href={`/diary/${diary.id}`} key={diary.id}>
            <time dateTime={diary.createdAt}>{formatDate(diary.createdAt)}</time>
            {diary.title ? <h2>{diary.title}</h2> : null}
            <p>{preview(diary.body)}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
