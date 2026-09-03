"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";

import type { Attachment } from "@/features/attachment/model/types";
import { listMomentAttachments } from "@/features/attachment/repository/attachment-repository";
import type { Moment } from "@/features/moment/model/types";
import { listRecentMoments } from "@/features/moment/repository/moment-repository";

import { MomentAppends } from "./moment-appends";
import { RecordImage } from "@/components/ui/record-image";
import { MotionEntry } from "@/components/ui/motion-entry";
import { contentTransition, motionStagger } from "@/components/ui/motion";

export const RECENT_MOMENT_LIMIT = 20;

interface RecentMomentsProps {
  refreshKey: number;
}

interface PreviewImage {
  attachmentId: string;
  updatedAt: string;
  fileName: string;
  url: string;
}

interface RecentMomentView {
  moment: Moment;
  images: PreviewImage[];
  attachmentError: boolean;
  enterDelay: number;
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
  const [retryRevision, setRetryRevision] = useState(0);
  const reducedMotion = useReducedMotion();
  const imageCacheRef = useRef(new Map<string, PreviewImage>());
  const retiredUrlsRef = useRef<string[]>([]);
  const firstLoadRef = useRef(true);

  useEffect(() => {
    let isCurrent = true;
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
        if (!isCurrent) return;
        const nextCache = new Map<string, PreviewImage>();
        const nextViews = moments.map((moment, index): RecentMomentView => {
          const enterDelay = firstLoadRef.current
            ? 2 * motionStagger.home + Math.min(index, motionStagger.maxIndex) * motionStagger.list
            : 0;
          const result = attachmentResults[index];
          if (result.status === "rejected") {
            return { moment, images: [], attachmentError: true, enterDelay };
          }

          const images = result.value.map((attachment) => {
            const cached = imageCacheRef.current.get(attachment.id);
            if (cached?.updatedAt === attachment.updatedAt) {
              nextCache.set(attachment.id, cached);
              return cached;
            }
            const url = URL.createObjectURL(attachment.blob);
            createdUrls.push(url);
            const image = {
              attachmentId: attachment.id,
              updatedAt: attachment.updatedAt,
              fileName: attachment.fileName,
              url,
            };
            nextCache.set(attachment.id, image);
            return image;
          });
          return { moment, images, attachmentError: false, enterDelay };
        });

        for (const [id, image] of imageCacheRef.current) {
          if (nextCache.get(id)?.url !== image.url) retiredUrlsRef.current.push(image.url);
        }
        imageCacheRef.current = nextCache;
        firstLoadRef.current = false;
        setViews(nextViews);
      } catch {
        revoke(createdUrls);
        if (!isCurrent) return;
        // Keep the last successful view while a refresh fails; retry does not remount it.
        setError("最近记录暂时无法读取。");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void load();

    return () => {
      isCurrent = false;
    };
  }, [refreshKey, retryRevision]);

  useEffect(() => {
    // Release replaced URLs after the new view has committed, not at refresh start.
    retiredUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    retiredUrlsRef.current = [];
  }, [views]);

  useEffect(
    () => () => {
      imageCacheRef.current.forEach(({ url }) => URL.revokeObjectURL(url));
      imageCacheRef.current.clear();
      retiredUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      retiredUrlsRef.current = [];
    },
    [],
  );

  const groups = groupMoments(views, new Date());

  return (
    <section className="recent-moments" aria-label="最近记录" aria-busy={isLoading}>
      <h2 className="recent-heading">最近记录</h2>
      {isLoading && groups.length === 0 ? <p className="recent-status" role="status">正在读取…</p> : null}
      {!isLoading && !error && groups.length === 0 ? <p className="recent-status recent-empty">还没有留下片段。</p> : null}
      {error ? <div className="recent-error"><p role="alert">{error}</p><button type="button" onClick={() => setRetryRevision((current) => current + 1)}>重新读取</button></div> : null}
      <LayoutGroup>
      {groups.map((group) => (
        <section className="moment-group" key={group.key} aria-labelledby={`date-${group.key}`}>
          <motion.h3 layout={reducedMotion ? false : "position"} transition={reducedMotion ? { duration: 0 } : { layout: contentTransition }} id={`date-${group.key}`}>{group.label}</motion.h3>
          <div className="moment-list">
            <AnimatePresence>
            {group.moments.map(({ moment, images, attachmentError, enterDelay }) => (
              <MotionEntry className="moment-entry" key={moment.id} delay={enterDelay}>
                <time dateTime={moment.createdAt}>
                  {new Intl.DateTimeFormat("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(new Date(moment.createdAt))}
                </time>
                <p>{moment.originalText}</p>
                {locationLabel(moment) ? (
                  <div className="moment-location">{locationLabel(moment)}</div>
                ) : null}
                {images.length > 0 ? (
                  <div className="moment-images" data-single={images.length === 1 || undefined} aria-label={`${moment.originalText}的图片`}>
                    {images.map((image) => (
                      <RecordImage alt={image.fileName} key={image.attachmentId} src={image.url} />
                    ))}
                  </div>
                ) : null}
                {attachmentError ? <p className="attachment-error">图片暂时无法读取。</p> : null}
                <MomentAppends momentId={moment.id} />
              </MotionEntry>
            ))}
            </AnimatePresence>
          </div>
        </section>
      ))}
      </LayoutGroup>
    </section>
  );
}
