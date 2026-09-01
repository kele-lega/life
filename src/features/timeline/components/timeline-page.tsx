"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { queryTimelinePage, TIMELINE_PAGE_SIZE } from "../query/timeline-query";
import type { TimelineCursor, TimelineItem } from "../model/types";
import { formatTimelineTime, groupTimelineItems } from "../utils/local-date";

function diaryPreview(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}…` : compact;
}

function locationLabel(item: Extract<TimelineItem, { type: "moment" }>): string | null {
  if (!item.moment.location) return null;
  const values = [item.moment.location.city, item.moment.location.placeName].filter(
    (value): value is string => Boolean(value),
  );
  return values.length > 0 ? values.join(" · ") : null;
}

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
    const urls: string[] = [];
    loadingRef.current = true;

    void queryTimelinePage(null, TIMELINE_PAGE_SIZE).then((page) => {
      if (!current) return;
      const nextItems = page.items.map((item) => {
        if (item.type !== "moment") return item;
        const attachments = item.attachments.map((attachment) => {
          const url = URL.createObjectURL(attachment.blob);
          urls.push(url);
          return { ...attachment, url };
        });
        return { ...item, attachments };
      });
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = urls;
      setItems(nextItems);
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
      const nextUrls: string[] = [];
      const nextItems = page.items.map((item) => {
        if (item.type !== "moment") return item;
        const attachments = item.attachments.map((attachment) => {
          const url = URL.createObjectURL(attachment.blob);
          nextUrls.push(url);
          return { ...attachment, url };
        });
        return { ...item, attachments };
      });
      objectUrlsRef.current.push(...nextUrls);
      setItems((current) => {
        const existing = new Set(current.map((item) => `${item.type}:${item.id}`));
        return [
          ...current,
          ...nextItems.filter((item) => !existing.has(`${item.type}:${item.id}`)),
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
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
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
                <article className={`timeline-entry timeline-${item.type}`} key={`${item.type}-${item.id}`}>
                  <time dateTime={item.createdAt}>{formatTimelineTime(item.createdAt)}</time>
                  {item.type === "moment" ? (
                    <div className="timeline-content">
                      <div className="timeline-kind">Moment</div>
                      {locationLabel(item) ? <div className="timeline-location">{locationLabel(item)}</div> : null}
                      <p>{item.moment.originalText}</p>
                      {item.attachments.length > 0 ? (
                        <div className="timeline-images" aria-label={`${item.moment.originalText}的图片`}>
                          {item.attachments.map((attachment) => (
                            // Timeline object URLs are local-only previews.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt={attachment.fileName} key={attachment.id} src={attachment.url} />
                          ))}
                        </div>
                      ) : null}
                      {item.errors.attachments ? <p className="timeline-child-error">图片暂时无法读取。</p> : null}
                      {item.appends.length > 0 ? (
                        <div className="timeline-appends">
                          <div className="timeline-append-label">追加</div>
                          {item.appends.map((append) => (
                            <div className="timeline-append" key={append.id}>
                              <time dateTime={append.createdAt}>{formatTimelineTime(append.createdAt)}</time>
                              <p>{append.text}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {item.errors.appends ? <p className="timeline-child-error">追加内容暂时无法读取。</p> : null}
                    </div>
                  ) : (
                    <Link className="timeline-content timeline-diary-link" href={`/diary/${item.diary.id}`}>
                      <div className="timeline-kind">Diary</div>
                      {item.diary.title ? <h3>{item.diary.title}</h3> : null}
                      <p>{diaryPreview(item.diary.body)}</p>
                    </Link>
                  )}
                </article>
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
