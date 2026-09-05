"use client";

import { NavLink } from "@/components/ui/nav-link";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

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
import { BackLink, PageNav } from "@/components/ui/page-nav";
import styles from "./calendar-page.module.css";

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
  const [monthRetry, setMonthRetry] = useState(0);
  const [dayRetry, setDayRetry] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

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
  }, [visibleMonth, monthRetry]);

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
  }, [selectedDateKey, dayRetry]);

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

  function moveDateFocus(event: KeyboardEvent<HTMLButtonElement>, dateKey: string): void {
    const distance = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (distance === undefined) return;
    const buttons = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = buttons.findIndex((button) => button.dataset.date === dateKey);
    const next = buttons[index + distance];
    if (next) { event.preventDefault(); next.focus(); }
  }

  return (
    <main className={`calendar-page ui-page ${styles.page}`}>
      <PageNav label="历史浏览">
        <BackLink href="/">返回首页</BackLink>
        <NavLink href="/timeline">时间线</NavLink>
        <NavLink href="/diary">日记</NavLink>
      </PageNav>
      <header className="calendar-header">
        <h1>日历</h1>
        <p>按日期找到过去留下的内容。</p>
      </header>
      <div className="calendar-layout">
      <section className="calendar-month" aria-label={monthTitle(visibleMonth)}>
        <div className="calendar-month-nav">
          <button type="button" aria-label="上一个月" title="上一个月" onClick={() => showMonth(shiftLocalMonth(visibleMonth, -1))}><ChevronLeftIcon className="ui-icon" aria-hidden="true" /></button>
          <h2>{monthTitle(visibleMonth)}</h2>
          <button type="button" aria-label="下一个月" title="下一个月" onClick={() => showMonth(shiftLocalMonth(visibleMonth, 1))}><ChevronRightIcon className="ui-icon" aria-hidden="true" /></button>
        </div>
        <button
          className="calendar-current-month"
          aria-label="返回当前月"
          title="返回当前月"
          disabled={visibleMonth.year === currentMonth.year && visibleMonth.month === currentMonth.month}
          type="button"
          onClick={() => showMonth(currentMonth)}
        >
          本月
        </button>
        {monthError ? <p role="alert">{monthError}</p> : null}
        {monthError ? <button className="ui-quiet-button" type="button" onClick={() => { setMonthLoading(true); setMonthError(null); setMonthRetry((value) => value + 1); }}>重新读取本月</button> : null}
        <p className="calendar-month-status" role="status">{monthLoading ? "正在读取记录日期…" : monthError ? "" : "有记录的日期下方有圆点。"}</p>
        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div ref={gridRef} className="calendar-grid" aria-busy={monthLoading} key={`${visibleMonth.year}-${visibleMonth.month}`}>
          {cells.map((cell, index) => cell ? (
            <button
              aria-label={dateButtonLabel(cell.dateKey, recorded.has(cell.dateKey), cell.dateKey === todayKey)}
              aria-pressed={selectedDateKey === cell.dateKey}
              aria-current={cell.dateKey === todayKey ? "date" : undefined}
              className={[
                "calendar-day",
                recorded.has(cell.dateKey) ? "calendar-day-recorded" : "",
                cell.dateKey === todayKey ? "calendar-day-today" : "",
              ].filter(Boolean).join(" ")}
              data-has-records={recorded.has(cell.dateKey) ? "true" : "false"}
              data-date={cell.dateKey}
              key={cell.dateKey}
              type="button"
              onClick={() => selectDate(cell.dateKey)}
              onKeyDown={(event) => moveDateFocus(event, cell.dateKey)}
            >
              <span>{cell.day}</span>
              {recorded.has(cell.dateKey) ? <i aria-hidden="true" /> : null}
            </button>
          ) : <span aria-hidden="true" className="calendar-day-spacer" key={`spacer-${index}`} />)}
        </div>
      </section>

      {selectedDateKey ? (
        <section className="calendar-day-detail" aria-label={`${dayTitle(selectedDateKey)}的记录`} aria-busy={dayLoading}>
          <div className="calendar-detail-header">
            <h2>{dayTitle(selectedDateKey)}</h2>
            <SegmentedControl className="calendar-filters" label="记录类型" options={FILTERS} value={filter} onChange={setFilter} />
          </div>
          {dayLoading ? <p className="ui-status" role="status">正在读取这一天的记录……</p> : <p className="visually-hidden" role="status">{`${dayTitle(selectedDateKey)}，已显示 ${filteredItems.length} 条记录。`}</p>}
          {dayError ? <p role="alert">{dayError}</p> : null}
          {dayError ? <button className="ui-quiet-button" type="button" onClick={() => { setDayLoading(true); setDayError(null); setDayRetry((value) => value + 1); }}>重新读取当天</button> : null}
          {!dayLoading && !dayError && filteredItems.length === 0 ? (
            <EmptyState icon={<CalendarIcon />}>这一天没有此类记录。</EmptyState>
          ) : null}
          <div className="calendar-day-list ui-content-enter" key={`${selectedDateKey}-${filter}-${dayLoading}`}>
            {filteredItems.map((item) => (
              <TimelineItemView item={item} key={`${item.type}-${item.id}`} />
            ))}
          </div>
        </section>
      ) : <EmptyState className="calendar-prompt" icon={<CalendarIcon />}>选择一个日期查看内容。</EmptyState>}
      </div>
    </main>
  );
}
