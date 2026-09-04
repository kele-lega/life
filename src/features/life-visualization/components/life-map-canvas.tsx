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
import type { LifeMapConnection, LifeMapRegion } from "../model/types";
import styles from "./life-visualization.module.css";

interface LifeMapCanvasProps {
  regions: LifeMapRegion[];
  connections: LifeMapConnection[];
  timePoints: LifeEventTimeSeriesPoint[];
  activeKey: string | null;
  onActiveChange: (region: LifeMapRegion | null) => void;
}

const TAU = Math.PI * 2;

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

export function LifeMapCanvas({
  regions,
  connections,
  timePoints,
  activeKey,
  onActiveChange,
}: LifeMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const draw = () => {
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

      const css = getComputedStyle(stage);
      const ink = css.getPropertyValue("--life-map-ink");
      const flow = css.getPropertyValue("--life-map-flow");
      const tone = (category: LifeMapRegion["category"]) => css.getPropertyValue(`--life-map-${category}`);

      if (regions.length > 1) {
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
      for (let line = 0; line < 13; line += 1) {
        const y = height * (0.13 + line * 0.061);
        context.beginPath();
        context.moveTo(width * 0.015, y);
        context.bezierCurveTo(
          width * 0.25,
          y - 32 - line * 1.5,
          width * 0.67,
          y + 38 - line * 2.2,
          width * 0.985,
          y + Math.sin(line * 0.9) * 20,
        );
        context.strokeStyle = colorWithAlpha(flow, activeKey ? 0.11 : 0.22);
        context.lineWidth = line % 3 === 0 ? 1 : 0.6;
        context.setLineDash(line % 2 === 0 ? [2, 5] : [1, 7]);
        context.stroke();
      }
      context.restore();

      const byKey = new Map(regions.map((region) => [region.key, region]));
      for (const connection of connections) {
        const from = byKey.get(connection.from);
        const to = byKey.get(connection.to);
        if (!from || !to) continue;
        const connectedToActive = activeKey === null || connection.from === activeKey || connection.to === activeKey;
        const x1 = from.x * width;
        const y1 = from.y * height;
        const x2 = to.x * width;
        const y2 = to.y * height;
        context.beginPath();
        context.moveTo(x1, y1);
        context.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - height * 0.08, x2, y2);
        context.strokeStyle = colorWithAlpha(ink, connectedToActive ? 0.12 + connection.strength * 0.12 : 0.025);
        context.lineWidth = connectedToActive ? 0.8 + connection.strength : 0.55;
        context.setLineDash([2, 6]);
        context.stroke();
      }
      context.setLineDash([]);

      for (const region of regions) {
        const isActive = activeKey === region.key;
        const isDimmed = activeKey !== null && !isActive;
        const seed = hash(region.key);
        const x = region.x * width;
        const y = region.y * height;
        const radius = region.radius * Math.min(width, height * 1.45);
        const regionTone = tone(region.tone);
        context.save();
        context.globalAlpha = isDimmed ? 0.22 : 1;
        const gradient = context.createRadialGradient(x - radius * 0.2, y - radius * 0.28, radius * 0.08, x, y, radius * 1.08);
        gradient.addColorStop(0, colorWithAlpha(regionTone, isActive ? 0.39 : 0.3));
        gradient.addColorStop(0.72, colorWithAlpha(regionTone, isActive ? 0.23 : 0.17));
        gradient.addColorStop(1, colorWithAlpha(regionTone, 0.035));
        organicPath(context, x, y, radius, seed);
        context.fillStyle = gradient;
        context.fill();
        context.strokeStyle = colorWithAlpha(regionTone, isActive ? 0.58 : 0.3);
        context.lineWidth = isActive ? 1.8 : 0.9;
        context.stroke();

        for (let ring = 1; ring <= 7; ring += 1) {
          organicPath(context, x, y, radius, seed + ring * 31, 1 - ring * 0.078);
          context.strokeStyle = colorWithAlpha(regionTone, isActive ? 0.24 : 0.13);
          context.lineWidth = 0.65;
          context.stroke();
        }

        const pointCount = Math.min(region.eventCount * 10, 180);
        for (let point = 0; point < pointCount; point += 1) {
          const angle = point * 2.399963 + (seed % 360);
          const distance = Math.sqrt((point + 0.5) / Math.max(pointCount, 1)) * radius * 0.72;
          const px = x + Math.cos(angle) * distance;
          const py = y + Math.sin(angle) * distance * 0.8;
          context.beginPath();
          context.arc(px, py, point % 9 === 0 ? 1.35 : 0.75, 0, TAU);
          context.fillStyle = colorWithAlpha(regionTone, point % 9 === 0 ? 0.52 : 0.28);
          context.fill();
        }
        context.restore();
      }

      if (timePoints.length) {
        const maxCount = Math.max(...timePoints.map((point) => point.eventCount), 1);
        timePoints.forEach((point, index) => {
          const x = width * (0.07 + (index / Math.max(timePoints.length - 1, 1)) * 0.86);
          const y = height * 0.87 + Math.sin(index * 1.7) * 4;
          context.beginPath();
          context.arc(x, y, 1.2 + (point.eventCount / maxCount) * 2.2, 0, TAU);
          context.fillStyle = colorWithAlpha(ink, activeKey ? 0.1 : 0.18);
          context.fill();
        });
      }
    };

    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [activeKey, connections, regions, timePoints]);

  return (
    <div className={styles.mapStage} ref={stageRef} onClick={() => onActiveChange(null)}>
      <canvas className={styles.mapCanvas} ref={canvasRef} aria-hidden="true" />
      <div className={styles.regionLayer} aria-label="生活地图区域">
        {regions.map((region) => (
          <div
            key={region.key}
            className={styles.regionPosition}
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
              onMouseLeave={() => onActiveChange(null)}
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
