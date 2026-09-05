import { normalizeLifeEventCandidate } from "../model/candidate";
import type {
  ExtractedLifeEventCandidate,
  LifeEventCandidate,
  LifeExtractionRequest,
  LifeExtractionResult,
} from "../model/types";
import type { LifeEventExtractor } from "./life-event-extractor";

const activities = [
  { pattern: /看书|阅读/g, category: "learning", name: "阅读" },
  { pattern: /学习编程|学编程/g, category: "learning", name: "编程学习" },
  { pattern: /看论文|读论文/g, category: "learning", name: "论文阅读" },
  { pattern: /写代码|编程/g, category: "creation", name: "编程" },
  { pattern: /项目开发|工作/g, category: "activity", name: "工作" },
  { pattern: /跑步/g, category: "activity", name: "跑步" },
  { pattern: /健身|训练/g, category: "activity", name: "健身" },
  { pattern: /听音乐/g, category: "activity", name: "听音乐" },
  { pattern: /写文章/g, category: "creation", name: "写作" },
  { pattern: /设计产品/g, category: "creation", name: "产品设计" },
  { pattern: /创作图片/g, category: "creation", name: "图片创作" },
] as const;

const places = ["咖啡馆", "图书馆", "健身房", "公司", "上海"] as const;

function durationAfter(text: string, start: number): { seconds: number | null; end: number } {
  const suffix = text.slice(start, start + 16);
  const match = suffix.match(/(?:了)?\s*(半(?:个)?小时|\d+(?:\.\d+)?\s*小时|\d+\s*分钟)/);
  if (!match || match.index === undefined) return { seconds: null, end: start };
  const value = match[1].replace(/\s/g, "");
  if (/^半(?:个)?小时$/.test(value)) return { seconds: 1_800, end: start + match.index + match[0].length };
  if (value.endsWith("小时")) return { seconds: Math.round(Number.parseFloat(value) * 3_600), end: start + match.index + match[0].length };
  return { seconds: Number.parseInt(value, 10) * 60, end: start + match.index + match[0].length };
}

function candidate(
  request: LifeExtractionRequest,
  category: LifeEventCandidate["category"],
  name: string,
  start: number,
  end: number,
  durationSeconds: number | null,
): ExtractedLifeEventCandidate {
  const value = normalizeLifeEventCandidate({
    category,
    name,
    occurredOn: request.context.occurredOn,
    timeZone: request.context.timeZone,
    timePrecision: "day",
    startAt: null,
    endAt: null,
    durationSeconds,
  });
  return {
    candidateKey: [category, name, value.occurredOn, durationSeconds ?? "unknown", start].join(":"),
    candidate: value,
    evidenceRanges: [{ start, end }],
  };
}

/** Deterministic, local-only extractor for contract tests and the future lab. */
export class FakeLifeEventExtractor implements LifeEventExtractor {
  readonly name = "fake-life-event-extractor";
  readonly version = "1";
  readonly schemaVersion = 1;

  async extract(request: LifeExtractionRequest): Promise<LifeExtractionResult> {
    const candidates: ExtractedLifeEventCandidate[] = [];
    const activityRanges: Array<{ start: number; end: number }> = [];

    for (const activity of activities) {
      const pattern = new RegExp(activity.pattern.source, "g");
      for (const match of request.text.matchAll(pattern)) {
        const start = match.index;
        const activityEnd = start + match[0].length;
        if (activityRanges.some((range) => start < range.end && activityEnd > range.start)) continue;
        const duration = durationAfter(request.text, activityEnd);
        activityRanges.push({ start, end: activityEnd });
        candidates.push(candidate(
          request,
          activity.category,
          activity.name,
          start,
          Math.max(activityEnd, duration.end),
          duration.seconds,
        ));
      }
    }

    for (const place of places) {
      const pattern = new RegExp(`(?:在|去(?:了|过)?|到)${place}`, "g");
      for (const match of request.text.matchAll(pattern)) {
        candidates.push(candidate(request, "place", place, match.index, match.index + match[0].length, null));
      }
    }

    candidates.sort((left, right) => left.evidenceRanges[0].start - right.evidenceRanges[0].start);
    return { candidates };
  }
}
