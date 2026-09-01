import { listDiaries } from "@/features/diary/repository/diary-repository";
import type { Diary } from "@/features/diary/model/types";
import {
  listActiveMomentAppendsForSearch,
  listMoments,
} from "@/features/moment/repository/moment-repository";
import type { Moment, MomentAppend } from "@/features/moment/model/types";
import { hydrateTimelineItems } from "@/features/timeline/query/timeline-query";

import type { SearchPageResult, SearchResult } from "../model/types";

export const SEARCH_PAGE_SIZE = 20;

type RootMatch =
  | {
      type: "moment";
      id: string;
      createdAt: string;
      value: Moment;
      originalText: boolean;
      appendIds: string[];
    }
  | {
      type: "diary";
      id: string;
      createdAt: string;
      value: Diary;
      title: boolean;
      body: boolean;
    };

function searchable(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase();
}

function includesKeyword(value: string, keyword: string): boolean {
  return searchable(value).includes(keyword);
}

function compareMatches(left: RootMatch, right: RootMatch): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

export async function querySearchPage(
  input: string,
  offset = 0,
  pageSize = SEARCH_PAGE_SIZE,
): Promise<SearchPageResult> {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer.");
  }
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer.");
  }

  const keyword = searchable(input.trim());
  if (keyword.length === 0) {
    return { keyword: "", items: [], nextOffset: null, hasMore: false };
  }

  const [moments, diaries, appends] = await Promise.all([
    listMoments(),
    listDiaries(),
    listActiveMomentAppendsForSearch(),
  ]);
  const appendsByMoment = new Map<string, MomentAppend[]>();
  for (const append of appends) {
    const values = appendsByMoment.get(append.momentId) ?? [];
    values.push(append);
    appendsByMoment.set(append.momentId, values);
  }

  const matches: RootMatch[] = [];
  for (const moment of moments) {
    const originalText = includesKeyword(moment.originalText, keyword);
    const appendIds = (appendsByMoment.get(moment.id) ?? [])
      .filter((append) => includesKeyword(append.text, keyword))
      .map((append) => append.id);
    if (originalText || appendIds.length > 0) {
      matches.push({
        type: "moment",
        id: moment.id,
        createdAt: moment.createdAt,
        value: moment,
        originalText,
        appendIds,
      });
    }
  }
  for (const diary of diaries) {
    const title = includesKeyword(diary.title, keyword);
    const body = includesKeyword(diary.body, keyword);
    if (title || body) {
      matches.push({
        type: "diary",
        id: diary.id,
        createdAt: diary.createdAt,
        value: diary,
        title,
        body,
      });
    }
  }

  matches.sort(compareMatches);
  const pageMatches = matches.slice(offset, offset + pageSize);
  const hydrated = await hydrateTimelineItems(
    pageMatches.filter((match): match is Extract<RootMatch, { type: "moment" }> =>
      match.type === "moment").map((match) => match.value),
    pageMatches.filter((match): match is Extract<RootMatch, { type: "diary" }> =>
      match.type === "diary").map((match) => match.value),
  );
  const hydratedByKey = new Map(hydrated.map((item) => [`${item.type}:${item.id}`, item]));
  const items = pageMatches.map((match): SearchResult => {
    if (match.type === "moment") {
      const item = hydratedByKey.get(`moment:${match.id}`);
      if (!item || item.type !== "moment") throw new Error("Moment hydration failed.");
      return {
        type: "moment",
        id: match.id,
        createdAt: match.createdAt,
        item,
        match: { originalText: match.originalText, appendIds: match.appendIds },
      };
    }
    const item = hydratedByKey.get(`diary:${match.id}`);
    if (!item || item.type !== "diary") throw new Error("Diary hydration failed.");
    return {
      type: "diary",
      id: match.id,
      createdAt: match.createdAt,
      item,
      match: { title: match.title, body: match.body },
    };
  });
  const nextOffset = offset + pageMatches.length;
  const hasMore = nextOffset < matches.length;
  return {
    keyword,
    items,
    nextOffset: hasMore ? nextOffset : null,
    hasMore,
  };
}
