import type { TimelineItem } from "../model/types";

export function addTimelineObjectUrls(items: readonly TimelineItem[]): {
  items: TimelineItem[];
  urls: string[];
} {
  const urls: string[] = [];
  return {
    items: items.map((item) => {
      if (item.type !== "moment") return item;
      return {
        ...item,
        attachments: item.attachments.map((attachment) => {
          const url = URL.createObjectURL(attachment.blob);
          urls.push(url);
          return { ...attachment, url };
        }),
      };
    }),
    urls,
  };
}

export function revokeObjectUrls(urls: readonly string[]): void {
  urls.forEach((url) => URL.revokeObjectURL(url));
}
