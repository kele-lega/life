import type { CreateManualLifeEventInput, LifeEventSourceRef } from "./types";

export function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000") ||
    !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new Error("日期必须是有效的 YYYY-MM-DD。");
  }
}

export function assertSource(source: LifeEventSourceRef): void {
  if (!["moment", "momentAppend", "diary"].includes(source.type) ||
    typeof source.id !== "string" || !source.id.trim()) {
    throw new Error("来源无效。");
  }
}

// Canonical JSON allows retry comparisons without depending on object key order.
export function canonicalJson(value: unknown, ancestors = new Set<object>(), depth = 0): string {
  if (depth > 16) throw new Error("metadata 嵌套过深。");
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw new Error("metadata 必须为有限、无循环的 JSON 数据。");
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error("metadata 只允许普通 JSON 对象。");
  }
  ancestors.add(value);
  const result = Array.isArray(value)
    ? `[${Array.from(value, (entry) => canonicalJson(entry, ancestors, depth + 1)).join(",")}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key], ancestors, depth + 1)}`).join(",")}}`;
  ancestors.delete(value);
  return result;
}

function assertInstant(value: string): void {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value) throw new Error("时间必须为含毫秒的 UTC ISO 时间（Z）。");
}

export function normalizeInput(input: CreateManualLifeEventInput) {
  if (input.id !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) {
    throw new Error("事件 ID 必须是 UUID。");
  }
  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("请输入名称。");
  if (!["activity", "learning", "creation", "place"].includes(input.category)) throw new Error("类别无效。");
  assertDate(input.occurredOn);
  // Reject numeric offsets: the stored zone must be a named IANA zone (UTC is valid).
  if (typeof input.timeZone !== "string" || !input.timeZone || /^[+-]/.test(input.timeZone)) throw new Error("时区无效。");
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch { throw new Error("时区必须是有效的 IANA 时区。"); }
  const startAt = input.startAt ?? null;
  const endAt = input.endAt ?? null;
  let durationSeconds = input.durationSeconds ?? null;
  if (durationSeconds !== null && (!Number.isSafeInteger(durationSeconds) || durationSeconds < 0)) throw new Error("持续时间必须是非负整数秒。");
  if (startAt !== null) {
    assertInstant(startAt);
    const parts = formatter.formatToParts(new Date(startAt));
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
    if (`${part("year")}-${part("month")}-${part("day")}` !== input.occurredOn) throw new Error("开始时间与事件日期不一致。");
  }
  if (endAt !== null) assertInstant(endAt);
  if (input.timePrecision === "day") {
    if (startAt !== null || endAt !== null) throw new Error("仅日期事件不能包含具体时间。");
  } else if (input.timePrecision === "time") {
    if (startAt === null || endAt !== null) throw new Error("时间事件需要开始时间，不能包含结束时间。");
  } else if (input.timePrecision === "interval") {
    if (startAt === null || endAt === null || Date.parse(endAt) <= Date.parse(startAt)) throw new Error("时间区间必须有递增的起止时间。");
    const elapsed = (Date.parse(endAt) - Date.parse(startAt)) / 1000;
    if (!Number.isSafeInteger(elapsed) || (durationSeconds !== null && durationSeconds !== elapsed)) throw new Error("持续时间与区间不一致。");
    durationSeconds = elapsed;
  } else { throw new Error("时间精度无效。"); }
  const source = input.source ? { type: input.source.type, id: input.source.id } : null;
  if (source) assertSource(source);
  const metadata = input.metadata ?? {};
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) throw new Error("metadata 必须是 JSON 对象。");
  const json = canonicalJson(metadata);
  if (new TextEncoder().encode(json).byteLength > 16_384) throw new Error("metadata 不能超过 16 KiB。");
  return {
    source, category: input.category, name: input.name, occurredOn: input.occurredOn,
    timeZone: input.timeZone, timePrecision: input.timePrecision, startAt, endAt, durationSeconds,
    metadata: JSON.parse(json) as Record<string, unknown>,
  };
}
