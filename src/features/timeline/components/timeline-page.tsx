"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { queryTimelinePage, TIMELINE_PAGE_SIZE } from "../query/timeline-query";
import type { TimelineCursor, TimelineItem } from "../model/types";
import { groupTimelineItems } from "../utils/local-date";
import { addTimelineObjectUrls, revokeObjectUrls } from "../utils/object-urls";
import { TimelineItemView } from "./timeline-item-view";

export function TimelinePage() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [cursor, setCursor] = useState<TimelineCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }, []);

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
    <main className="timeline-page">
      <nav className="timeline-nav"><Link href="/">返回首页</Link><Link href="/diary">日记</Link></nav>
      <header className="timeline-header"><h1>时间线</h1><p>按时间回看留下的记录。</p></header>
      {loading ? <p>正在读取时间线……</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!loading && !error && items.length === 0 ? <p className="timeline-empty">还没有记录。</p> : null}
      <div className="timeline-groups">
        {groups.map((group) => (
          <section className="timeline-group" key={group.key}>
            <h2>{group.label}</h2>
            <div className="timeline-list">
              {group.items.map((item) => (
                <TimelineItemView item={item} key={`${item.type}-${item.id}`} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {!loading && hasMore ? <button disabled={loadingMore} type="button" onClick={() => void loadMore()}>{loadingMore ? "读取中…" : "加载更多"}</button> : null}
      {!loading && !error && !hasMore && items.length > 0 ? <p className="timeline-end">已经到最早的记录。</p> : null}
    </main>
  );
}
