"use client";

import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { LifeEventCategory } from "@/features/life-event/model/types";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { motionDuration, motionEase } from "@/components/ui/motion";
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

const LENSES: { value: LifeLens; label: string; description: string }[] = [
  { value: "activities", label: "活动", description: "从日常行动里，看见反复出现的生活力量" },
  { value: "places", label: "地点", description: "沿着地点之间的往返，看见生活经过的路径" },
  { value: "themes", label: "主题", description: "退远一些，看见长期投入如何沉积成主题" },
];

const RANGE_OPTIONS = [
  { days: 30, label: "30 天" },
  { days: 90, label: "90 天" },
  { days: 365, label: "一年" },
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

function formatDuration(seconds: number): string {
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

function DetailPanel({
  exploration,
  topic,
  lens,
  relatedLabels,
}: {
  exploration: LifeEventExploration;
  topic: LifeMapRegion;
  lens: LifeLens;
  relatedLabels: string[];
}) {
  const themeLabel = lens === "places" ? "地点轨迹" : `生活主题 · ${CATEGORY_LABELS[topic.category]}`;
  const timeSpan = topic.firstOccurredOn === topic.lastOccurredOn
    ? `${formatDate(topic.firstOccurredOn)} 留下的一处痕迹`
    : `从 ${formatDate(topic.firstOccurredOn)} 延伸到 ${formatDate(topic.lastOccurredOn)}`;
  const related = relatedLabels.length
    ? `与 ${relatedLabels.join("、")} 在相近的日子里交汇`
    : "与其他生活方向的联系还在形成";

  return (
    <div className={styles.detailPanel}>
      <p className={styles.panelEyebrow}>{themeLabel}</p>
      <h2>{topic.label}</h2>
      <p className={styles.detailSpan}>{timeSpan}</p>
      <div className={styles.detailNarrative}>
        <div>
          <p>最近变化</p>
          <strong>{categoryTrend(exploration, topic.category)}</strong>
        </div>
        <div>
          <p>关联方向</p>
          <strong>{related}</strong>
        </div>
      </div>
      <p className={styles.detailFootprint}>
        <span>{topic.eventCount} 次沉积</span>
        <span>{topic.totalDurationSeconds > 0 ? `${formatDuration(topic.totalDurationSeconds)}投入` : "未标记投入时长"}</span>
      </p>
    </div>
  );
}

function TimeDepthControl({ value, loading, onChange }: { value: number; loading: boolean; onChange: (days: number) => void }) {
  const selectedIndex = RANGE_OPTIONS.findIndex((option) => option.days === value);
  const depth = selectedIndex / Math.max(RANGE_OPTIONS.length - 1, 1);
  return (
    <div
      className={styles.timeDepth}
      role="group"
      aria-label="时间沉积深度"
      aria-busy={loading}
      style={{ "--time-depth": depth } as CSSProperties}
    >
      <span className={styles.timeDepthTrack} aria-hidden="true" />
      {RANGE_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.days}
          data-active={option.days === value}
          aria-pressed={option.days === value}
          onClick={() => onChange(option.days)}
        >
          <span aria-hidden="true" />
          {option.label}
        </button>
      ))}
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

function MapInspector({ region, style, children }: { region: LifeMapRegion; style?: CSSProperties; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const present = useIsPresent();
  return <motion.aside className={styles.inspector} style={style}
    data-side={region.x > 0.55 ? "left" : "right"} data-vertical={region.y > 0.5 ? "above" : "below"}
    aria-label="生活地图详情" aria-hidden={!present} inert={!present}
    initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: reducedMotion ? 0 : motionDuration.instant, ease: motionEase }}>{children}</motion.aside>;
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
  const [evolutionRevision, setEvolutionRevision] = useState(0);
  const [isEvolving, setIsEvolving] = useState(false);
  const requestRef = useRef(0);
  const appliedRangeRef = useRef<number | null>(null);
  const evolutionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let current = true;
    const request = ++requestRef.current;
    const range = queryRange(rangeDays);
    void getLifeVisualizationData({
      ...range,
      granularity: rangeDays <= 30 ? "day" : rangeDays <= 90 ? "week" : "month",
    }).then((result) => {
      if (current && request === requestRef.current) {
        const previousRange = appliedRangeRef.current;
        setExploration(result.exploration);
        setDataMode(result.mode);
        appliedRangeRef.current = rangeDays;
        if (previousRange !== null && previousRange !== rangeDays) {
          setEvolutionRevision((value) => value + 1);
          if (evolutionTimerRef.current) clearTimeout(evolutionTimerRef.current);
          evolutionTimerRef.current = setTimeout(() => setIsEvolving(false), 820);
        } else {
          setIsEvolving(false);
        }
      }
    }).catch(() => {
      if (current && request === requestRef.current) {
        setError("生活地图暂时无法读取，请再试一次。");
        setIsEvolving(false);
      }
    }).finally(() => {
      if (current && request === requestRef.current) setLoading(false);
    });
    return () => { current = false; };
  }, [rangeDays, retryRevision]);

  useEffect(() => () => {
    if (evolutionTimerRef.current) clearTimeout(evolutionTimerRef.current);
  }, []);

  const topics = useMemo(() => exploration ? buildLifeMapTopics(exploration, lens) : [], [exploration, lens]);
  const regions = useMemo(() => layoutLifeMapTopics(topics, lens), [lens, topics]);
  const connections = useMemo(
    () => exploration ? buildLifeMapConnections(exploration.recentEvents, topics, lens) : [],
    [exploration, lens, topics],
  );
  const activeRegion = regions.find((region) => region.key === activeRegionKey) ?? null;
  const relatedLabels = useMemo(() => {
    if (!activeRegion) return [];
    const byKey = new Map(regions.map((region) => [region.key, region.label]));
    return connections
      .filter((connection) => connection.from === activeRegion.key || connection.to === activeRegion.key)
      .sort((left, right) => right.strength - left.strength)
      .map((connection) => connection.from === activeRegion.key ? connection.to : connection.from)
      .map((key) => byKey.get(key))
      .filter((label): label is string => Boolean(label))
      .slice(0, 2);
  }, [activeRegion, connections, regions]);
  const activeLens = LENSES.find((item) => item.value === lens)!;
  const inspectorStyle = activeRegion ? {
    "--inspector-x": `${activeRegion.x * 100}%`,
    "--inspector-y": `${Math.min(74, Math.max(22, activeRegion.y * 100))}%`,
  } as CSSProperties : undefined;

  function changeLens(nextLens: LifeLens) {
    setActiveRegionKey(null);
    setIsEvolving(false);
    setLens(nextLens);
  }

  function changeRange(days: number) {
    if (days === rangeDays) return;
    setLoading(true);
    setError(null);
    setActiveRegionKey(null);
    setIsEvolving(true);
    setRangeDays(days);
  }

  function retry() {
    setLoading(true);
    setError(null);
    setActiveRegionKey(null);
    setRetryRevision((value) => value + 1);
  }

  return (
    <main className={styles.page} onKeyDown={(event) => { if (event.key === "Escape") setActiveRegionKey(null); }}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="返回 Life 首页">Life OS</Link>
        <SegmentedControl tabs panelId="life-map-panel" className={styles.lenses} label="生活观察角度" options={LENSES} value={lens} onChange={changeLens} />
        <div className={styles.topActions}>
          <TimeDepthControl value={rangeDays} loading={loading} onChange={changeRange} />
          <Link className={styles.searchLink} href="/search" aria-label="搜索已有记录"><MagnifyingGlassIcon aria-hidden="true" /></Link>
        </div>
      </header>

      <div className={styles.content}>
        <header className={styles.intro}>
          <div>
            <div className={styles.introTitle}><h1>生活如何形成</h1>{dataMode === "demo" ? <span className={styles.demoBadge}>Demo Data</span> : null}</div>
            <p>{activeLens.description}。</p>
          </div>
        </header>

        <div id="life-map-panel" role="tabpanel" aria-label={`${activeLens.label}生活地图`} className={styles.landscape} aria-busy={loading}>
          <section className={styles.mapArea} aria-label="Life Map" onMouseLeave={() => setActiveRegionKey(null)}>
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
                  lens={lens}
                  evolutionRevision={evolutionRevision}
                  isEvolving={isEvolving}
                  activeKey={activeRegionKey}
                  onActiveChange={(region) => setActiveRegionKey(region?.key ?? null)}
                />
                <AnimatePresence initial={false}>
                {activeRegion ? (
                  <MapInspector key={activeRegion.key} region={activeRegion} style={inspectorStyle}>
                    <DetailPanel exploration={exploration} topic={activeRegion} lens={lens} relatedLabels={relatedLabels} />
                  </MapInspector>
                ) : null}
                </AnimatePresence>
                {exploration.summary.totalEvents === 0 ? <p className={styles.mapStatus}>地图还在等待新的足迹。</p> : null}
                {exploration.summary.totalEvents > 0 && regions.length === 0 ? (
                  <p className={styles.lensEmpty}>这段时间还没有留下{activeLens.label}线索。</p>
                ) : null}
              </>
            ) : null}
            {exploration && loading ? <p className={styles.updateStatus} role="status">正在更新这段时间的轨迹……</p> : null}
            {exploration && error ? <div className={styles.updateError} role="alert"><p>{error}</p><button type="button" className="ui-quiet-button" onClick={retry}>重新读取</button></div> : null}
          </section>

          {exploration ? <PreviewRail exploration={exploration} onChooseLens={changeLens} /> : null}
        </div>
        <p className={styles.mapHint}>轻触、悬停或聚焦一片区域，查看它的来路。</p>
      </div>
    </main>
  );
}
