"use client";

import { NavLink } from "@/components/ui/nav-link";
import { useEffect, useRef, useState } from "react";

import { queryTimelinePage, TIMELINE_PAGE_SIZE } from "../query/timeline-query";
import type { TimelineCursor, TimelineItem } from "../model/types";
import { groupTimelineItems } from "../utils/local-date";
import { addTimelineObjectUrls, revokeObjectUrls } from "../utils/object-urls";
import { TimelineItemView } from "./timeline-item-view";
import { BackLink, PageNav } from "@/components/ui/page-nav";
import styles from "./timeline-page.module.css";

export function TimelinePage() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [cursor, setCursor] = useState<TimelineCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const loadingRef = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let current = true;
    loadingRef.current = true;

    void queryTimelinePage(null, TIMELINE_PAGE_SIZE).then((page) => {
      if (!current) return;
      const hydrated = addTimelineObjectUrls(page.items);
      revokeObjectUrls(objectUrlsRef.current);
      objectUrlsRef.current = hydrated.urls;
      setItems(hydrated.items);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    }).catch(() => {
      if (current) {
        setItems([]);
        setCursor(null);
        setHasMore(false);
        setError("时间线暂时无法读取。");
      }
    }).finally(() => {
      loadingRef.current = false;
      if (current) setLoading(false);
    });

    return () => {
      current = false;
    };
  }, [retryRevision]);

  async function loadMore(): Promise<void> {
    if (loadingRef.current || !hasMore || !cursor) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await queryTimelinePage(cursor, TIMELINE_PAGE_SIZE);
      const hydrated = addTimelineObjectUrls(page.items);
      objectUrlsRef.current.push(...hydrated.urls);
      setItems((current) => {
        const existing = new Set(current.map((item) => `${item.type}:${item.id}`));
        return [
          ...current,
          ...hydrated.items.filter((item) => !existing.has(`${item.type}:${item.id}`)),
        ];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError(null);
    } catch {
      setError("更多时间线内容暂时无法读取。");
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }

  useEffect(() => () => {
    revokeObjectUrls(objectUrlsRef.current);
  }, []);

  const groups = groupTimelineItems(items);

  return (
    <main className={`timeline-page ui-page ${styles.page}`}>
      <PageNav label="时间线导航"><BackLink href="/">返回首页</BackLink><NavLink href="/diary">日记</NavLink></PageNav>
      <header className="timeline-header"><h1>时间线</h1><p>按时间回看留下的记录。</p></header>
      {loading ? <p className="ui-status" role="status">正在读取时间线……</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {error && items.length === 0 ? <button className="ui-quiet-button" type="button" onClick={() => { setLoading(true); setError(null); setRetryRevision((value) => value + 1); }}>重新读取</button> : null}
      {!loading && !error && items.length === 0 ? <p className="timeline-empty">还没有记录。</p> : null}
      <div className="timeline-groups" aria-busy={loading || loadingMore}>
        {groups.map((group) => (
          <section className="timeline-group" key={group.key}>
            <header className="timeline-date"><h2>{group.label}</h2><time dateTime={group.key}>{new Date(`${group.key}T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}</time></header>
            <div className="timeline-list">
              {group.items.map((item) => (
                <TimelineItemView item={item} key={`${item.type}-${item.id}`} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {!loading && hasMore ? <button className="ui-quiet-button" disabled={loadingMore} type="button" onClick={() => void loadMore()}>{loadingMore ? "读取中…" : "加载更多"}</button> : null}
      {!loading && !error && !hasMore && items.length > 0 ? <p className="timeline-end">已经到最早的记录。</p> : null}
    </main>
  );
}
