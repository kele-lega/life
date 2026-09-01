import type { TimelineItem } from "@/features/timeline/model/types";

export interface MomentSearchMatch {
  originalText: boolean;
  appendIds: string[];
}

export interface DiarySearchMatch {
  title: boolean;
  body: boolean;
}

export type SearchResult =
  | {
      type: "moment";
      id: string;
      createdAt: string;
      item: Extract<TimelineItem, { type: "moment" }>;
      match: MomentSearchMatch;
    }
  | {
      type: "diary";
      id: string;
      createdAt: string;
      item: Extract<TimelineItem, { type: "diary" }>;
      match: DiarySearchMatch;
    };

export interface SearchPageResult {
  keyword: string;
  items: SearchResult[];
  nextOffset: number | null;
  hasMore: boolean;
}
