"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { TimelineItemView } from "@/features/timeline/components/timeline-item-view";
import { formatTimelineDate } from "@/features/timeline/utils/local-date";
import {
  addTimelineObjectUrls,
  revokeObjectUrls,
} from "@/features/timeline/utils/object-urls";

import type { SearchResult } from "../model/types";
import { querySearchPage, SEARCH_PAGE_SIZE } from "../query/search-query";

function matchLabel(result: SearchResult): string {
  if (result.type === "moment") {
    const sources = [
      result.match.originalText ? "原文" : null,
      result.match.appendIds.length > 0 ? "追加内容" : null,
    ].filter(Boolean);
    return `命中：${sources.join("、")}`;
  }
  const sources = [
    result.match.title ? "标题" : null,
    result.match.body ? "正文" : null,
  ].filter(Boolean);
  return `命中：${sources.join("、")}`;
}

function addResultObjectUrls(results: readonly SearchResult[]): {
  results: SearchResult[];
  urls: string[];
} {
  const hydrated = addTimelineObjectUrls(results.map((result) => result.item));
  const itemsByKey = new Map(hydrated.items.map((item) => [`${item.type}:${item.id}`, item]));
  return {
    results: results.map((result) => ({
      ...result,
      item: itemsByKey.get(`${result.type}:${result.id}`) as SearchResult["item"],
    })) as SearchResult[],
    urls: hydrated.urls,
  };
}

export function SearchPage() {
  const [input, setInput] = useState("");
  const [activeInput, setActiveInput] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const loadingRef = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);

  function clearResults(): void {
    revokeObjectUrls(objectUrlsRef.current);
    objectUrlsRef.current = [];
    setResults([]);
    setNextOffset(null);
    setHasMore(false);
    setError(null);
  }

  async function runSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const keyword = input.trim();
    requestRef.current += 1;
    const request = requestRef.current;
    clearResults();
    setActiveInput(keyword);
    setSubmitted(keyword.length > 0);
    if (keyword.length === 0) return;

    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await querySearchPage(keyword, 0, SEARCH_PAGE_SIZE);
      if (request !== requestRef.current) return;
      const withUrls = addResultObjectUrls(page.items);
      objectUrlsRef.current = withUrls.urls;
      setResults(withUrls.results);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } catch {
      if (request === requestRef.current) setError("搜索暂时无法完成。");
    } finally {
      if (request === requestRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }

  function changeInput(value: string): void {
    setInput(value);
    if (submitted && value.trim() !== activeInput) {
      requestRef.current += 1;
      loadingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
      setSubmitted(false);
      clearResults();
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingRef.current || !hasMore || nextOffset === null) return;
    const request = requestRef.current;
    const keyword = activeInput;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await querySearchPage(keyword, nextOffset, SEARCH_PAGE_SIZE);
      if (request !== requestRef.current) return;
      const existing = new Set(results.map((result) => `${result.type}:${result.id}`));
      const withUrls = addResultObjectUrls(page.items.filter(
        (result) => !existing.has(`${result.type}:${result.id}`),
      ));
      objectUrlsRef.current.push(...withUrls.urls);
      setResults((current) => [...current, ...withUrls.results]);
      setNextOffset(page.nextOffset);
      setHasMore(page.hasMore);
      setError(null);
    } catch {
      setError("更多搜索结果暂时无法读取。");
    } finally {
      if (request === requestRef.current) {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => () => {
    requestRef.current += 1;
    revokeObjectUrls(objectUrlsRef.current);
  }, []);

  return (
    <main className="search-page">
      <nav className="search-nav" aria-label="搜索导航">
        <Link href="/">返回首页</Link>
        <Link href="/timeline">时间线</Link>
      </nav>
      <header className="search-header">
        <h1>搜索</h1>
        <p>在过去留下的文字中查找。</p>
      </header>
      <form className="search-form" onSubmit={(event) => void runSearch(event)}>
        <label htmlFor="search-keyword">关键词</label>
        <div>
          <input
            id="search-keyword"
            name="keyword"
            onChange={(event) => changeInput(event.target.value)}
            placeholder="输入关键词"
            type="search"
            value={input}
          />
          <button disabled={loading} type="submit">{loading ? "搜索中…" : "搜索"}</button>
        </div>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {!submitted && !loading ? <p className="search-initial">输入关键词后查看结果。</p> : null}
      {submitted && !loading && !error && results.length === 0
        ? <p className="search-empty">没有找到相关记录。</p>
        : null}
      {results.length > 0 ? (
        <section className="search-results" aria-label="搜索结果">
          {results.map((result) => (
            <div className="search-result" key={`${result.type}:${result.id}`}>
              <div className="search-result-meta">
                <span>{formatTimelineDate(result.createdAt)}</span>
                <span>{matchLabel(result)}</span>
              </div>
              <TimelineItemView item={result.item} />
            </div>
          ))}
        </section>
      ) : null}
      {!loading && hasMore ? (
        <button className="search-load-more" disabled={loadingMore} onClick={() => void loadMore()} type="button">
          {loadingMore ? "读取中…" : "加载更多"}
        </button>
      ) : null}
      {!loading && submitted && !error && !hasMore && results.length > 0
        ? <p className="search-end">已经显示全部结果。</p>
        : null}
    </main>
  );
}
