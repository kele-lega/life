"use client";

import { ClockIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { LifeEventCategory } from "@/features/life-event/model/types";
import type { LifeEventExploration } from "@/features/life-insights/model/types";
import { getLifeVisualizationData } from "../data/life-visualization-provider";
import type { LifeLens, LifeMapRegion } from "../model/types";
import {
  buildLifeMapConnections,
  buildLifeMapTopics,
  CATEGORY_LABELS,
  layoutLifeMapTopics,
} from "../utils/life-map-model";
import { LifeMapCanvas } from "./life-map-canvas";
import styles from "./life-visualization.module.css";

const LENSES: { value: LifeLens; label: string; visualLabel: string; description: string }[] = [
  { value: "activities", label: "活动", visualLabel: "Activities", description: "从活动视角观察生活如何聚合" },
  { value: "places", label: "地点", visualLabel: "Places", description: "沿着地点重新看见生活的落点" },
  { value: "themes", label: "主题", visualLabel: "Themes", description: "回到四个稳定主题的长期沉淀" },
];

const RANGE_OPTIONS = [
  { days: 30, label: "过去 30 天" },
  { days: 90, label: "过去 90 天" },
  { days: 365, label: "过去一年" },
] as const;

function naturalDate(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function queryRange(days: number): { startDate: string; endDate: string } {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - days + 1);
  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  return { startDate: naturalDate(start), endDate: naturalDate(end) };
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "未记录时长";
  if (seconds === 0) return "0 分钟";
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes} 分钟`;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

function categoryTrend(exploration: LifeEventExploration, category: LifeEventCategory): string {
  const values = exploration.timeSeries.points.map((point) =>
    point.categories.find((item) => item.category === category)?.eventCount ?? 0);
  if (values.length < 2) return "时间纹理正在形成";
  const midpoint = Math.ceil(values.length / 2);
  const earlier = values.slice(0, midpoint).reduce((sum, value) => sum + value, 0);
  const later = values.slice(midpoint).reduce((sum, value) => sum + value, 0);
  if (later > earlier * 1.2) return "最近留下得更密";
  if (earlier > later * 1.2) return "较早时更为浓密";
  return "在这段时间里平稳延伸";
}

function DetailPanel({ exploration, topic }: { exploration: LifeEventExploration; topic: LifeMapRegion }) {
  return (
    <div className={styles.detailPanel}>
      <p className={styles.panelEyebrow}>{CATEGORY_LABELS[topic.category]}</p>
      <h2>{topic.label}</h2>
      <p className={styles.trend}>{categoryTrend(exploration, topic.category)}</p>
      <dl className={styles.detailMetrics}>
        <div><dt>事件</dt><dd>{topic.eventCount} 次</dd></div>
        <div><dt>累计时间</dt><dd>{formatDuration(topic.totalDurationSeconds)}</dd></div>
        <div><dt>第一次</dt><dd>{formatDate(topic.firstOccurredOn)}</dd></div>
        <div><dt>最近一次</dt><dd>{formatDate(topic.lastOccurredOn)}</dd></div>
      </dl>
    </div>
  );
}

function PreviewRail({ exploration, onChooseLens }: { exploration: LifeEventExploration; onChooseLens: (lens: LifeLens) => void }) {
  const places = exploration.names.filter((item) => item.category === "place").slice(0, 6);
  const themes = exploration.summary.categories.filter((item) => item.eventCount > 0);

  return (
    <aside className={styles.previewRail} aria-label="其他生活观察角度">
      <section className={styles.previewSection}>
        <button type="button" className={styles.previewHeading} onClick={() => onChooseLens("places")}>地点视角预览</button>
        {places.length ? (
          <div className={styles.previewCloud}>
            {places.map((place) => (
              <button key={place.name} type="button" data-category="place" onClick={() => onChooseLens("places")}>
                <span aria-hidden="true" />{place.name}
              </button>
            ))}
          </div>
        ) : <p className={styles.previewEmpty}>地点的轮廓还在形成。</p>}
      </section>

      <section className={styles.previewSection}>
        <button type="button" className={styles.previewHeading} onClick={() => onChooseLens("themes")}>主题视角预览</button>
        {themes.length ? (
          <div className={styles.previewCloud}>
            {themes.map((theme) => (
              <button key={theme.category} type="button" data-category={theme.category} onClick={() => onChooseLens("themes")}>
                <span aria-hidden="true" />{CATEGORY_LABELS[theme.category]}
              </button>
            ))}
          </div>
        ) : <p className={styles.previewEmpty}>主题会随着记录慢慢浮现。</p>}
      </section>
    </aside>
  );
}

export function LifeVisualization() {
  const [lens, setLens] = useState<LifeLens>("activities");
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [exploration, setExploration] = useState<LifeEventExploration | null>(null);
  const [dataMode, setDataMode] = useState<"demo" | "repository">("repository");
  const [activeRegionKey, setActiveRegionKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    let current = true;
    const request = ++requestRef.current;
    const range = queryRange(rangeDays);
    void getLifeVisualizationData({
      ...range,
      granularity: rangeDays <= 30 ? "day" : rangeDays <= 90 ? "week" : "month",
    }).then((result) => {
      if (current && request === requestRef.current) {
        setExploration(result.exploration);
        setDataMode(result.mode);
      }
    }).catch(() => {
      if (current && request === requestRef.current) setError("生活地图暂时无法读取，请再试一次。");
    }).finally(() => {
      if (current && request === requestRef.current) setLoading(false);
    });
    return () => { current = false; };
  }, [rangeDays, retryRevision]);

  const topics = useMemo(() => exploration ? buildLifeMapTopics(exploration, lens) : [], [exploration, lens]);
  const regions = useMemo(() => layoutLifeMapTopics(topics, lens), [lens, topics]);
  const connections = useMemo(
    () => exploration ? buildLifeMapConnections(exploration.recentEvents, topics, lens) : [],
    [exploration, lens, topics],
  );
  const activeRegion = regions.find((region) => region.key === activeRegionKey) ?? null;
  const activeLens = LENSES.find((item) => item.value === lens)!;
  const inspectorStyle = activeRegion ? {
    "--inspector-x": `${activeRegion.x * 100}%`,
    "--inspector-y": `${Math.min(74, Math.max(22, activeRegion.y * 100))}%`,
  } as CSSProperties : undefined;

  function changeLens(nextLens: LifeLens) {
    setActiveRegionKey(null);
    setLens(nextLens);
  }

  function changeRange(days: number) {
    if (days === rangeDays) return;
    setLoading(true);
    setError(null);
    setActiveRegionKey(null);
    setRangeDays(days);
  }

  function retry() {
    setLoading(true);
    setError(null);
    setActiveRegionKey(null);
    setRetryRevision((value) => value + 1);
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="返回 Life 首页">Life OS</Link>
        <div className={styles.lenses} role="tablist" aria-label="生活观察角度">
          {LENSES.map((item) => (
            <button type="button" role="tab" aria-selected={lens === item.value} aria-label={item.label} key={item.value} onClick={() => changeLens(item.value)}>
              {item.visualLabel}
            </button>
          ))}
        </div>
        <span className={styles.timeLabel}><ClockIcon aria-hidden="true" />时间分配</span>
        <div className={styles.topActions}>
          {dataMode === "demo" ? <span className={styles.demoBadge}>Demo Data</span> : null}
          <label className={styles.rangePicker}>
            <span className="visually-hidden">观察时间范围</span>
            <select value={rangeDays} onChange={(event) => changeRange(Number(event.target.value))}>
              {RANGE_OPTIONS.map((item) => <option value={item.days} key={item.days}>{item.label}</option>)}
            </select>
          </label>
          <Link className={styles.searchLink} href="/search" aria-label="搜索已有记录"><MagnifyingGlassIcon aria-hidden="true" /></Link>
        </div>
      </header>

      <div className={styles.content}>
        <header className={styles.intro}>
          <div>
            <h1>生活视角切换</h1>
            <p>{activeLens.description}。悬浮一片区域，观察它在这段时间里的轮廓。</p>
          </div>
        </header>

        <div className={styles.landscape} aria-busy={loading}>
          <section className={styles.mapArea} aria-label="Life Map">
            {loading && !exploration ? <p className={styles.mapStatus} role="status">正在让生活轨迹浮现……</p> : null}
            {error && !exploration ? (
              <div className={styles.mapError} role="alert">
                <p>{error}</p>
                <button type="button" onClick={retry}>重新读取</button>
              </div>
            ) : null}
            {exploration ? (
              <>
                <LifeMapCanvas
                  regions={regions}
                  connections={connections}
                  timePoints={exploration.timeSeries.points}
                  activeKey={activeRegionKey}
                  onActiveChange={(region) => setActiveRegionKey(region?.key ?? null)}
                />
                {activeRegion ? (
                  <aside
                    className={styles.inspector}
                    style={inspectorStyle}
                    data-side={activeRegion.x > 0.55 ? "left" : "right"}
                    aria-label="生活地图详情"
                  >
                    <DetailPanel exploration={exploration} topic={activeRegion} />
                  </aside>
                ) : null}
                {exploration.summary.totalEvents === 0 ? <p className={styles.mapStatus}>地图还在等待新的足迹。</p> : null}
                {exploration.summary.totalEvents > 0 && regions.length === 0 ? (
                  <p className={styles.lensEmpty}>这段时间还没有留下{activeLens.label}线索。</p>
                ) : null}
              </>
            ) : null}
          </section>

          {exploration ? <PreviewRail exploration={exploration} onChooseLens={changeLens} /> : null}
        </div>
      </div>
    </main>
  );
}
