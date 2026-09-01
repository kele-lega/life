import Link from "next/link";

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

export function TimelineItemView({ item }: { item: TimelineItem }) {
  const location = item.type === "moment" ? locationLabel(item) : null;
  return (
    <article className={`timeline-entry timeline-${item.type}`}>
      <time dateTime={item.createdAt}>{formatTimelineTime(item.createdAt)}</time>
      {item.type === "moment" ? (
        <div className="timeline-content">
          <div className="timeline-kind">Moment</div>
          {location ? <div className="timeline-location">{location}</div> : null}
          <p>{item.moment.originalText}</p>
          {item.attachments.length > 0 ? (
            <div className="timeline-images" aria-label={`${item.moment.originalText}的图片`}>
              {item.attachments.map((attachment) => (
                // Object URLs are local-only previews.
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
  );
}
