"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { TimelineItemView } from "@/features/timeline/components/timeline-item-view";
import type { TimelineItem } from "@/features/timeline/model/types";
import { addTimelineObjectUrls, revokeObjectUrls } from "@/features/timeline/utils/object-urls";
import {
  localDateKeyFromDate,
  localMonthFromDate,
  shiftLocalMonth,
  type LocalMonth,
} from "@/lib/time/local-calendar";

import type { CalendarFilter } from "../model/types";
import { queryCalendarDay, queryCalendarMonth } from "../query/calendar-query";
import { calendarMonthCells } from "../utils/calendar-grid";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const FILTERS: Array<{ value: CalendarFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "moment", label: "随笔" },
  { value: "diary", label: "日记" },
];

function monthTitle(month: LocalMonth): string {
  return `${month.year} 年 ${month.month} 月`;
}

function dayTitle(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

function dateButtonLabel(
  dateKey: string,
  hasRecords: boolean,
  isToday: boolean,
): string {
  const parts = [dayTitle(dateKey)];
  if (isToday) parts.push("今天");
  if (hasRecords) parts.push("有记录");
  return parts.join("，");
}

export function CalendarPage({ now = new Date() }: { now?: Date }) {
  const currentMonth = useMemo(() => localMonthFromDate(now), [now]);
  const todayKey = useMemo(() => localDateKeyFromDate(now), [now]);
  const [visibleMonth, setVisibleMonth] = useState<LocalMonth>(currentMonth);
  const [recordedDateKeys, setRecordedDateKeys] = useState<string[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [dayItems, setDayItems] = useState<TimelineItem[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let current = true;
    void queryCalendarMonth(visibleMonth.year, visibleMonth.month)
      .then((result) => {
        if (!current) return;
        setRecordedDateKeys(result.recordedDateKeys);
        setMonthError(null);
      })
      .catch(() => {
        if (!current) return;
        setRecordedDateKeys([]);
        setMonthError("这个月的记录状态暂时无法读取。");
      })
      .finally(() => {
        if (current) setMonthLoading(false);
      });
    return () => { current = false; };
  }, [visibleMonth]);

  useEffect(() => {
    if (!selectedDateKey) return;
    let current = true;
    void queryCalendarDay(selectedDateKey)
      .then((result) => {
        if (!current) return;
        const hydrated = addTimelineObjectUrls(result.items);
        revokeObjectUrls(objectUrlsRef.current);
        objectUrlsRef.current = hydrated.urls;
        setDayItems(hydrated.items);
        setDayError(null);
      })
      .catch(() => {
        if (!current) return;
        revokeObjectUrls(objectUrlsRef.current);
        objectUrlsRef.current = [];
        setDayItems([]);
        setDayError("这一天的记录暂时无法读取。");
      })
      .finally(() => {
        if (current) setDayLoading(false);
      });
    return () => { current = false; };
  }, [selectedDateKey]);

  useEffect(() => () => revokeObjectUrls(objectUrlsRef.current), []);

  function clearDay(): void {
    revokeObjectUrls(objectUrlsRef.current);
    objectUrlsRef.current = [];
    setSelectedDateKey(null);
    setDayItems([]);
    setDayError(null);
    setDayLoading(false);
    setFilter("all");
  }

  function showMonth(month: LocalMonth): void {
    if (month.year === visibleMonth.year && month.month === visibleMonth.month) return;
    clearDay();
    setRecordedDateKeys([]);
    setMonthError(null);
    setMonthLoading(true);
    setVisibleMonth(month);
  }

  function selectDate(dateKey: string): void {
    if (dateKey === selectedDateKey) return;
    revokeObjectUrls(objectUrlsRef.current);
    objectUrlsRef.current = [];
    setSelectedDateKey(dateKey);
    setDayItems([]);
    setDayError(null);
    setDayLoading(true);
    setFilter("all");
  }

  const recorded = new Set(recordedDateKeys);
  const cells = calendarMonthCells(visibleMonth.year, visibleMonth.month);
  const filteredItems = dayItems.filter((item) => filter === "all" || item.type === filter);

  return (
    <main className="calendar-page">
      <nav className="calendar-nav" aria-label="历史浏览">
        <Link href="/">返回首页</Link>
        <Link href="/timeline">时间线</Link>
        <Link href="/diary">日记</Link>
      </nav>
      <header className="calendar-header">
        <h1>日历</h1>
        <p>按日期找到过去留下的内容。</p>
      </header>

      <section className="calendar-month" aria-label={monthTitle(visibleMonth)}>
        <div className="calendar-month-nav">
          <button type="button" onClick={() => showMonth(shiftLocalMonth(visibleMonth, -1))}>上一个月</button>
          <h2>{monthTitle(visibleMonth)}</h2>
          <button type="button" onClick={() => showMonth(shiftLocalMonth(visibleMonth, 1))}>下一个月</button>
        </div>
        <button
          className="calendar-current-month"
          disabled={visibleMonth.year === currentMonth.year && visibleMonth.month === currentMonth.month}
          type="button"
          onClick={() => showMonth(currentMonth)}
        >
          返回当前月
        </button>
        {monthError ? <p role="alert">{monthError}</p> : null}
        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="calendar-grid" aria-busy={monthLoading}>
          {cells.map((cell, index) => cell ? (
            <button
              aria-label={dateButtonLabel(cell.dateKey, recorded.has(cell.dateKey), cell.dateKey === todayKey)}
              aria-pressed={selectedDateKey === cell.dateKey}
              className={[
                "calendar-day",
                recorded.has(cell.dateKey) ? "calendar-day-recorded" : "",
                cell.dateKey === todayKey ? "calendar-day-today" : "",
              ].filter(Boolean).join(" ")}
              data-has-records={recorded.has(cell.dateKey) ? "true" : "false"}
              key={cell.dateKey}
              type="button"
              onClick={() => selectDate(cell.dateKey)}
            >
              <span>{cell.day}</span>
              {recorded.has(cell.dateKey) ? <i aria-hidden="true" /> : null}
            </button>
          ) : <span aria-hidden="true" className="calendar-day-spacer" key={`spacer-${index}`} />)}
        </div>
      </section>

      {selectedDateKey ? (
        <section className="calendar-day-detail" aria-label={`${dayTitle(selectedDateKey)}的记录`}>
          <div className="calendar-detail-header">
            <h2>{dayTitle(selectedDateKey)}</h2>
            <div className="calendar-filters" aria-label="记录类型">
              {FILTERS.map((option) => (
                <button
                  aria-pressed={filter === option.value}
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {dayLoading ? <p>正在读取这一天的记录……</p> : null}
          {dayError ? <p role="alert">{dayError}</p> : null}
          {!dayLoading && !dayError && filteredItems.length === 0 ? (
            <p className="calendar-day-empty">这一天没有此类记录。</p>
          ) : null}
          <div className="calendar-day-list">
            {filteredItems.map((item) => (
              <TimelineItemView item={item} key={`${item.type}-${item.id}`} />
            ))}
          </div>
        </section>
      ) : <p className="calendar-select-hint">选择一个日期查看内容。</p>}
    </main>
  );
}
