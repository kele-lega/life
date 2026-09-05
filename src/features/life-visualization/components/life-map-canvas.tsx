"use client";

import {
  ActivityLogIcon,
  BackpackIcon,
  CameraIcon,
  GlobeIcon,
  Pencil2Icon,
  ReaderIcon,
  SewingPinIcon,
  SpeakerLoudIcon,
} from "@radix-ui/react-icons";
import { useEffect, useRef, type CSSProperties } from "react";
import type { LifeEventTimeSeriesPoint } from "@/features/life-insights/model/types";
import type { LifeLens, LifeMapConnection, LifeMapRegion } from "../model/types";
import styles from "./life-visualization.module.css";

interface LifeMapCanvasProps {
  regions: LifeMapRegion[];
  connections: LifeMapConnection[];
  timePoints: LifeEventTimeSeriesPoint[];
  lens: LifeLens;
  evolutionRevision: number;
  isEvolving: boolean;
  activeKey: string | null;
  onActiveChange: (region: LifeMapRegion | null) => void;
}

interface PreviousFrame {
  revision: number;
  lens: LifeLens;
  regions: LifeMapRegion[];
}

const TAU = Math.PI * 2;
const EVOLUTION_DURATION = 760;

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result);
}

function colorWithAlpha(color: string, alpha: number): string {
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    const number = Number.parseInt(value.slice(1), 16);
    return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
  }
  return color;
}

function organicPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  seed: number,
  scale = 1,
) {
  context.beginPath();
  for (let point = 0; point <= 72; point += 1) {
    const angle = (point / 72) * TAU;
    const drift = 1
      + Math.sin(angle * 3 + seed * 0.017) * 0.12
      + Math.sin(angle * 5 - seed * 0.009) * 0.055;
    const px = x + Math.cos(angle) * radius * drift * scale;
    const py = y + Math.sin(angle) * radius * drift * scale * 0.83;
    if (point === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function categoryIcon(region: LifeMapRegion) {
  const label = region.label.toLocaleLowerCase();
  if (/(摄影|拍照|photo|camera)/u.test(label)) return <CameraIcon aria-hidden="true" />;
  if (/(音乐|music)/u.test(label)) return <SpeakerLoudIcon aria-hidden="true" />;
  if (/(工作|work)/u.test(label)) return <BackpackIcon aria-hidden="true" />;
  if (/(旅行|旅游|travel)/u.test(label)) return <GlobeIcon aria-hidden="true" />;
  if (region.category === "learning") return <ReaderIcon aria-hidden="true" />;
  if (region.category === "creation") return <Pencil2Icon aria-hidden="true" />;
  if (region.category === "place") return <SewingPinIcon aria-hidden="true" />;
  return <ActivityLogIcon aria-hidden="true" />;
}

function easeSediment(value: number): number {
  const remaining = 1 - value;
  return 1 - remaining * remaining * remaining;
}

function interpolateRegions(previous: readonly LifeMapRegion[], next: readonly LifeMapRegion[], progress: number): LifeMapRegion[] {
  const byKey = new Map(previous.map((region) => [region.key, region]));
  return next.map((region) => {
    const from = byKey.get(region.key) ?? { ...region, radius: 0.035, frequency: 0, weight: 0 };
    return {
      ...region,
      x: from.x + (region.x - from.x) * progress,
      y: from.y + (region.y - from.y) * progress,
      radius: from.radius + (region.radius - from.radius) * progress,
      frequency: from.frequency + (region.frequency - from.frequency) * progress,
      weight: from.weight + (region.weight - from.weight) * progress,
    };
  });
}

export function LifeMapCanvas({
  regions,
  connections,
  timePoints,
  lens,
  evolutionRevision,
  isEvolving,
  activeKey,
  onActiveChange,
}: LifeMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previousFrameRef = useRef<PreviousFrame | null>(null);
  const emphasisRef = useRef(new Map<string, number>());

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const previousFrame = previousFrameRef.current;
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const colorQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    const reducedMotion = motionQuery?.matches ?? false;
    const shouldEvolve = Boolean(
      previousFrame
      && previousFrame.lens === lens
      && previousFrame.revision !== evolutionRevision
      && !reducedMotion,
    );
    const startingRegions = shouldEvolve ? previousFrame?.regions ?? regions : regions;
    previousFrameRef.current = { revision: evolutionRevision, lens, regions };

    let currentProgress = shouldEvolve ? 0 : 1;
    const fromEmphasis = new Map(emphasisRef.current);
    const targetEmphasis = (key: string) => activeKey !== null && activeKey !== key ? 0.24 : 1;
    const shouldEmphasize = !reducedMotion && regions.some((region) =>
      fromEmphasis.has(region.key) && fromEmphasis.get(region.key) !== targetEmphasis(region.key));
    let emphasisProgress = shouldEmphasize ? 0 : 1;
    let animationFrame = 0;
    let cancelled = false;

    const draw = (progress: number) => {
      const bounds = stage.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const density = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * density) || canvas.height !== Math.round(height * density)) {
        canvas.width = Math.round(width * density);
        canvas.height = Math.round(height * density);
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      let context: CanvasRenderingContext2D | null = null;
      try {
        context = canvas.getContext("2d");
      } catch {
        return;
      }
      if (!context) return;
      context.setTransform(density, 0, 0, density, 0, 0);
      context.clearRect(0, 0, width, height);

      const visibleRegions = shouldEvolve
        ? interpolateRegions(startingRegions, regions, progress)
        : regions;
      const css = getComputedStyle(stage);
      const ink = css.getPropertyValue("--life-map-ink");
      const flow = css.getPropertyValue("--life-map-flow");
      const tone = (category: LifeMapRegion["category"]) => css.getPropertyValue(`--life-map-${category}`);

      if (visibleRegions.length > 1) {
        const fieldRadius = Math.min(width * 0.46, height * 0.73);
        organicPath(context, width * 0.43, height * 0.52, fieldRadius, 1847, 1);
        context.fillStyle = colorWithAlpha(tone("learning"), 0.025);
        context.fill();
        context.strokeStyle = colorWithAlpha(ink, 0.075);
        context.lineWidth = 0.7;
        context.stroke();
        for (let ring = 1; ring <= 3; ring += 1) {
          organicPath(context, width * 0.43, height * 0.52, fieldRadius, 1847 + ring * 19, 1 - ring * 0.055);
          context.strokeStyle = colorWithAlpha(flow, 0.055);
          context.stroke();
        }
      }

      context.save();
      context.lineCap = "round";
      const temporalDensity = Math.min(timePoints.length / 24, 1);
      for (let line = 0; line < 13; line += 1) {
        const y = height * (0.13 + line * 0.061);
        context.beginPath();
        context.moveTo(width * 0.015, y);
        context.bezierCurveTo(
          width * 0.25,
          y - 32 - line * (1.2 + temporalDensity),
          width * 0.67,
          y + 38 - line * 2.2,
          width * 0.985,
          y + Math.sin(line * 0.9) * 20,
        );
        context.strokeStyle = colorWithAlpha(flow, activeKey ? 0.09 : 0.16 + temporalDensity * 0.07);
        context.lineWidth = line % 3 === 0 ? 1 : 0.6;
        context.setLineDash(line % 2 === 0 ? [2, 5] : [1, 7]);
        context.stroke();
      }
      context.restore();

      const byKey = new Map(visibleRegions.map((region) => [region.key, region]));
      for (const connection of connections) {
        const from = byKey.get(connection.from);
        const to = byKey.get(connection.to);
        if (!from || !to) continue;
        const connectedToActive = activeKey === null || connection.from === activeKey || connection.to === activeKey;
        const x1 = from.x * width;
        const y1 = from.y * height;
        const x2 = to.x * width;
        const y2 = to.y * height;
        const controlY = Math.min(y1, y2) - height * (lens === "places" ? 0.12 : 0.08);

        context.beginPath();
        context.moveTo(x1, y1);
        context.quadraticCurveTo((x1 + x2) / 2, controlY, x2, y2);
        if (lens === "places") {
          context.strokeStyle = colorWithAlpha(tone("place"), connectedToActive ? 0.06 + connection.strength * 0.09 : 0.018);
          context.lineWidth = 5 + connection.strength * 8;
          context.setLineDash([]);
          context.stroke();
          context.beginPath();
          context.moveTo(x1, y1);
          context.quadraticCurveTo((x1 + x2) / 2, controlY, x2, y2);
        }
        context.strokeStyle = colorWithAlpha(ink, connectedToActive ? 0.1 + connection.strength * 0.14 : 0.022);
        context.lineWidth = connectedToActive ? 0.75 + connection.strength : 0.5;
        context.setLineDash(lens === "places" ? [1, 5] : [2, 6]);
        context.stroke();
      }
      context.setLineDash([]);

      emphasisRef.current.clear();
      for (const region of visibleRegions) {
        const isActive = activeKey === region.key;
        const seed = hash(region.key);
        const x = region.x * width;
        const y = region.y * height;
        const radius = region.radius * Math.min(width, height * 1.45);
        const regionTone = tone(region.tone);
        context.save();
        const target = targetEmphasis(region.key);
        const from = fromEmphasis.get(region.key) ?? target;
        const emphasis = from + (target - from) * emphasisProgress;
        emphasisRef.current.set(region.key, emphasis);
        context.globalAlpha = emphasis;
        context.shadowColor = colorWithAlpha(regionTone, 0.08 + region.weight * 0.08);
        context.shadowBlur = 10 + region.weight * 22;
        const gradient = context.createRadialGradient(x - radius * 0.2, y - radius * 0.28, radius * 0.08, x, y, radius * 1.08);
        gradient.addColorStop(0, colorWithAlpha(regionTone, (isActive ? 0.42 : 0.27) + region.weight * 0.08));
        gradient.addColorStop(0.72, colorWithAlpha(regionTone, (isActive ? 0.24 : 0.14) + region.weight * 0.06));
        gradient.addColorStop(1, colorWithAlpha(regionTone, 0.03));
        organicPath(context, x, y, radius, seed);
        context.fillStyle = gradient;
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = colorWithAlpha(regionTone, (isActive ? 0.56 : 0.24) + region.weight * 0.12);
        context.lineWidth = (isActive ? 1.55 : 0.72) + region.weight * 0.45;
        context.stroke();

        const contourCount = 4 + Math.round(region.weight * 6);
        for (let ring = 1; ring <= contourCount; ring += 1) {
          organicPath(context, x, y, radius, seed + ring * 31, 1 - ring * (0.68 / (contourCount + 1)));
          context.strokeStyle = colorWithAlpha(regionTone, isActive ? 0.23 : 0.085 + region.weight * 0.07);
          context.lineWidth = 0.55 + region.weight * 0.16;
          context.stroke();
        }

        const pointCount = Math.round(18 + region.frequency * 172);
        for (let point = 0; point < pointCount; point += 1) {
          const angle = point * 2.399963 + (seed % 360);
          const distance = Math.sqrt((point + 0.5) / Math.max(pointCount, 1)) * radius * 0.72;
          const px = x + Math.cos(angle) * distance;
          const py = y + Math.sin(angle) * distance * 0.8;
          context.beginPath();
          context.arc(px, py, point % 11 === 0 ? 1.25 + region.weight * 0.4 : 0.62, 0, TAU);
          context.fillStyle = colorWithAlpha(regionTone, point % 11 === 0 ? 0.5 : 0.19 + region.frequency * 0.13);
          context.fill();
        }
        context.restore();
      }

      if (timePoints.length) {
        const maxCount = Math.max(...timePoints.map((point) => point.eventCount), 1);
        const reveal = shouldEvolve ? progress : 1;
        timePoints.forEach((point, index) => {
          const ratio = index / Math.max(timePoints.length - 1, 1);
          if (ratio > reveal + 0.05) return;
          const intensity = point.eventCount / maxCount;
          const x = width * (0.055 + ratio * 0.89);
          const y = height * (0.89 - intensity * 0.035) + Math.sin(index * 1.7) * 3;
          context.beginPath();
          context.arc(x, y, 1 + intensity * 2.4, 0, TAU);
          context.fillStyle = colorWithAlpha(ink, activeKey ? 0.07 : 0.11 + intensity * 0.11);
          context.fill();
          if (index > 0) {
            const previousRatio = (index - 1) / Math.max(timePoints.length - 1, 1);
            const previousPoint = timePoints[index - 1];
            const previousIntensity = previousPoint.eventCount / maxCount;
            context.beginPath();
            context.moveTo(width * (0.055 + previousRatio * 0.89), height * (0.89 - previousIntensity * 0.035) + Math.sin((index - 1) * 1.7) * 3);
            context.lineTo(x, y);
            context.strokeStyle = colorWithAlpha(flow, activeKey ? 0.035 : 0.065);
            context.lineWidth = 0.55 + intensity * 0.35;
            context.stroke();
          }
        });
      }
    };

    const startedAt = performance.now();
    const animate = (now: number) => {
      if (cancelled) return;
      const elapsed = Math.min((now - startedAt) / (shouldEvolve ? EVOLUTION_DURATION : 180), 1);
      currentProgress = shouldEvolve ? easeSediment(elapsed) : 1;
      emphasisProgress = easeSediment(Math.min((now - startedAt) / 180, 1));
      draw(currentProgress);
      if (elapsed < 1) animationFrame = requestAnimationFrame(animate);
    };

    if (shouldEvolve || shouldEmphasize) animationFrame = requestAnimationFrame(animate);
    else draw(1);

    const updatePreferences = () => {
      if (motionQuery?.matches) {
        cancelAnimationFrame(animationFrame);
        currentProgress = 1;
        emphasisProgress = 1;
      }
      draw(currentProgress);
    };
    colorQuery?.addEventListener("change", updatePreferences);
    motionQuery?.addEventListener("change", updatePreferences);
    const cleanPreferences = () => {
      colorQuery?.removeEventListener("change", updatePreferences);
      motionQuery?.removeEventListener("change", updatePreferences);
    };

    if (typeof ResizeObserver === "undefined") {
      return () => {
        cancelled = true;
        cancelAnimationFrame(animationFrame);
        cleanPreferences();
      };
    }
    const observer = new ResizeObserver(() => draw(currentProgress));
    observer.observe(stage);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      cleanPreferences();
    };
  }, [activeKey, connections, evolutionRevision, lens, regions, timePoints]);

  return (
    <div
      className={styles.mapStage}
      ref={stageRef}
      data-evolving={isEvolving}
      data-lens={lens}
      onClick={() => onActiveChange(null)}
    >
      <canvas className={styles.mapCanvas} ref={canvasRef} aria-hidden="true" />
      <div className={styles.regionLayer} aria-label="生活地图区域">
        {regions.map((region) => (
          <div
            key={region.key}
            className={styles.regionPosition}
            data-active={activeKey === region.key}
            data-dimmed={activeKey !== null && activeKey !== region.key}
            style={{
              "--region-x": `${region.x * 100}%`,
              "--region-y": `${region.y * 100}%`,
              "--region-size": `${region.radius * 108}%`,
            } as CSSProperties}
          >
            <button
              type="button"
              className={styles.regionButton}
              data-active={activeKey === region.key}
              data-dimmed={activeKey !== null && activeKey !== region.key}
              onMouseEnter={() => onActiveChange(region)}
              onFocus={() => onActiveChange(region)}
              onBlur={() => onActiveChange(null)}
              onClick={(event) => {
                event.stopPropagation();
                onActiveChange(region);
              }}
              aria-label={`${region.label}，${region.eventCount} 次事件`}
            >
              <span className={styles.regionIcon}>{categoryIcon(region)}</span>
              <span className={styles.regionName}>{region.label}</span>
              <span className={styles.regionCount}>{region.eventCount} 次</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
