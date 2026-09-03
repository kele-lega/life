"use client";

import Link from "next/link";
import { NavLink } from "@/components/ui/nav-link";
import { useEffect, useState } from "react";

import type { Diary } from "../model/types";
import { listDiaries } from "../repository/diary-repository";
import { BackLink, PageNav } from "@/components/ui/page-nav";
import styles from "./diary-page.module.css";

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
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    void listDiaries().then((items) => {
      if (current) setDiaries(items);
    }).catch(() => {
      if (current) setError("日记暂时无法读取。");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision]);

  return (
    <main className={`diary-page ui-page ${styles.page}`}>
      <PageNav label="日记导航"><BackLink href="/">返回首页</BackLink><NavLink className="primary-link" href="/diary/new">新建日记</NavLink></PageNav>
      <header className="diary-header"><h1>日记</h1><p>记录完整的一段生活。</p></header>
      {loading ? <p className="ui-status" role="status">正在读取日记……</p> : null}
      {error ? <div className="ui-error"><p role="alert">{error}</p><button className="ui-quiet-button" type="button" onClick={() => { setLoading(true); setError(null); setRevision((value) => value + 1); }}>重新读取</button></div> : null}
      {diaries.length === 0 && !loading && !error ? <p className="diary-empty">还没有日记。</p> : null}
      <div className="diary-list" aria-busy={loading}>
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
