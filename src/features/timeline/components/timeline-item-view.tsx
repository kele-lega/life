import Link from "next/link";
import { RecordImage } from "@/components/ui/record-image";
import styles from "./timeline-item-view.module.css";
import { HighlightedText, searchExcerpt } from "@/components/ui/highlighted-text";

import type { TimelineItem } from "../model/types";
import { formatTimelineTime } from "../utils/local-date";

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

export function TimelineItemView({ item, highlight = "", matchedAppendIds = [] }: { item: TimelineItem; highlight?: string; matchedAppendIds?: readonly string[] }) {
  const location = item.type === "moment" ? locationLabel(item) : null;
  return (
    <article className={`timeline-entry timeline-${item.type} ${styles.entry}`}>
      <time dateTime={item.createdAt}>{formatTimelineTime(item.createdAt)}</time>
      {item.type === "moment" ? (
        <div className="timeline-content">
          <div className="timeline-kind">随笔</div>
          <p><HighlightedText text={item.moment.originalText} keyword={highlight} /></p>
          {location ? <div className="timeline-location">{location}</div> : null}
          {item.attachments.length > 0 ? (
            <div className="timeline-images" data-single={item.attachments.length === 1 || undefined} aria-label={`${item.moment.originalText}的图片`}>
              {item.attachments.map((attachment) => (
                <RecordImage alt={attachment.fileName} key={attachment.url} src={attachment.url} />
              ))}
            </div>
          ) : null}
          {item.errors.attachments ? <p className="timeline-child-error">图片暂时无法读取。</p> : null}
          {item.appends.length > 0 ? (
            <div className="timeline-appends">
              <div className="timeline-append-label">追加</div>
              {item.appends.map((append) => (
                <div className="timeline-append" key={append.id} data-matched={matchedAppendIds.includes(append.id) || undefined}>
                  <time dateTime={append.createdAt}>{new Date(append.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</time>
                  <p><HighlightedText text={append.text} keyword={highlight} /></p>
                </div>
              ))}
            </div>
          ) : null}
          {item.errors.appends ? <p className="timeline-child-error">追加内容暂时无法读取。</p> : null}
        </div>
      ) : (
        <Link className="timeline-content timeline-diary-link" href={`/diary/${item.diary.id}`}>
          <div className="timeline-kind">日记</div>
          {item.diary.title ? <h3><HighlightedText text={item.diary.title} keyword={highlight} /></h3> : null}
          <p><HighlightedText text={highlight ? searchExcerpt(item.diary.body, highlight) : diaryPreview(item.diary.body)} keyword={highlight} /></p>
        </Link>
      )}
    </article>
  );
}
