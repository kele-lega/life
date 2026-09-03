"use client";

import { useEffect, useRef, useState } from "react";

import type { Diary } from "../model/types";
import { getDiary } from "../repository/diary-repository";
import { DiaryEditor } from "./diary-editor";
import { BackLink, PageNav } from "@/components/ui/page-nav";
import styles from "./diary-page.module.css";

function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(timestamp));
}

export function DiaryDetail({ id }: { id: string }) {
  const [diary, setDiary] = useState<Diary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  const editRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const pageClass = `diary-page ui-page ${styles.page}`;

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      editRef.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [editing]);

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
  }, [id, revision]);

  if (error || !diary) return <main className={pageClass}><PageNav label="日记导航"><BackLink href="/diary">返回日记</BackLink></PageNav><h1 className="visually-hidden">日记</h1>{error ? <div className="ui-error"><p role="alert">{error}</p><button className="ui-quiet-button" type="button" onClick={() => { setError(null); setRevision((value) => value + 1); }}>重新读取</button></div> : <p className="ui-status" role="status">正在读取日记……</p>}</main>;
  if (editing) return <DiaryEditor diaryId={diary.id} initialTitle={diary.title} initialBody={diary.body} onSaved={(updated) => { setDiary(updated); restoreFocus.current = true; setEditing(false); }} onCancel={() => { restoreFocus.current = true; setEditing(false); }} />;

  return (
    <main className={pageClass}>
      <PageNav label="日记导航"><BackLink href="/diary">返回日记</BackLink><button ref={editRef} type="button" onClick={() => setEditing(true)}>编辑</button></PageNav>
      <article className="diary-view">
        {diary.title ? <h1>{diary.title}</h1> : <h1 className="visually-hidden">日记</h1>}
        <time dateTime={diary.createdAt}>创建于 {formatDate(diary.createdAt)}</time>
        <div className="diary-body">{diary.body}</div>
      </article>
    </main>
  );
}
