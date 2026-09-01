"use client";

import { useEffect, useRef, useState } from "react";

import type { Attachment } from "@/features/attachment/model/types";
import { listMomentAttachments } from "@/features/attachment/repository/attachment-repository";
import type { Moment } from "@/features/moment/model/types";
import { listRecentMoments } from "@/features/moment/repository/moment-repository";

import { MomentAppends } from "./moment-appends";

export const RECENT_MOMENT_LIMIT = 20;

interface RecentMomentsProps {
  refreshKey: number;
}

interface PreviewImage {
  attachmentId: string;
  fileName: string;
  url: string;
}

interface RecentMomentView {
  moment: Moment;
  images: PreviewImage[];
  attachmentError: boolean;
}

interface MomentGroup {
  key: string;
  label: string;
  moments: RecentMomentView[];
}

function localDateKey(timestamp: string): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateLabel(timestamp: string, now: Date): string {
  const date = new Date(timestamp);
  const dayDifference = Math.round(
    (startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) / 86_400_000,
  );

  if (dayDifference === 0) return "今天";
  if (dayDifference === 1) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

function locationLabel(moment: Moment): string | null {
  if (!moment.location) return null;
  const parts = [moment.location.city, moment.location.placeName].filter(
    (value): value is string => value !== null && value.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

function groupMoments(moments: RecentMomentView[], now: Date): MomentGroup[] {
  const groups = new Map<string, MomentGroup>();

  for (const view of moments) {
    const key = localDateKey(view.moment.createdAt);
    const existing = groups.get(key);
    if (existing) {
      existing.moments.push(view);
    } else {
      groups.set(key, {
        key,
        label: dateLabel(view.moment.createdAt, now),
        moments: [view],
      });
    }
  }

  return Array.from(groups.values());
}

async function loadImages(momentId: string): Promise<Attachment[]> {
  return listMomentAttachments(momentId);
}

export function RecentMoments({ refreshKey }: RecentMomentsProps) {
  const [views, setViews] = useState<RecentMomentView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let isCurrent = true;
    let urlsCommitted = false;
    const createdUrls: string[] = [];

    function revoke(urls: readonly string[]): void {
      urls.forEach((url) => URL.revokeObjectURL(url));
    }

    async function load(): Promise<void> {
      setIsLoading(true);
      setError(null);

      try {
        const moments = await listRecentMoments(RECENT_MOMENT_LIMIT);
        const attachmentResults = await Promise.allSettled(
          moments.map((moment) => loadImages(moment.id)),
        );
        const nextViews = moments.map((moment, index): RecentMomentView => {
          const result = attachmentResults[index];
          if (result.status === "rejected") {
            return { moment, images: [], attachmentError: true };
          }

          const images = result.value.map((attachment) => {
            const url = URL.createObjectURL(attachment.blob);
            createdUrls.push(url);
            return {
              attachmentId: attachment.id,
              fileName: attachment.fileName,
              url,
            };
          });
          return { moment, images, attachmentError: false };
        });

        if (!isCurrent) {
          revoke(createdUrls);
          createdUrls.length = 0;
          return;
        }

        revoke(objectUrlsRef.current);
        objectUrlsRef.current = createdUrls;
        urlsCommitted = true;
        setViews(nextViews);
      } catch {
        if (!isCurrent) return;
        revoke(objectUrlsRef.current);
        objectUrlsRef.current = [];
        setViews([]);
        setError("最近记录暂时无法读取。");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void load();

    return () => {
      isCurrent = false;
      if (urlsCommitted) {
        revoke(createdUrls);
        objectUrlsRef.current = objectUrlsRef.current.filter(
          (url) => !createdUrls.includes(url),
        );
      }
    };
  }, [refreshKey]);

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    },
    [],
  );

  const groups = groupMoments(views, new Date());

  return (
    <section className="recent-moments" aria-label="最近记录" aria-busy={isLoading}>
      {error ? <p className="recent-error" role="alert">{error}</p> : null}
      {groups.map((group) => (
        <section className="moment-group" key={group.key} aria-labelledby={`date-${group.key}`}>
          <h2 id={`date-${group.key}`}>{group.label}</h2>
          <div className="moment-list">
            {group.moments.map(({ moment, images, attachmentError }) => (
              <article className="moment-entry" key={moment.id}>
                <time dateTime={moment.createdAt}>
                  {new Intl.DateTimeFormat("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(new Date(moment.createdAt))}
                  {locationLabel(moment) ? ` · ${locationLabel(moment)}` : ""}
                </time>
                <p>{moment.originalText}</p>
                {images.length > 0 ? (
                  <div className="moment-images" aria-label={`${moment.originalText}的图片`}>
                    {images.map((image) => (
                      // Object URLs are local-only previews and do not use remote optimization.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={image.fileName} key={image.attachmentId} src={image.url} />
                    ))}
                  </div>
                ) : null}
                {attachmentError ? <p className="attachment-error">图片暂时无法读取。</p> : null}
                <MomentAppends momentId={moment.id} />
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
