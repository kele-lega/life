import { getDiary } from "@/features/diary/repository/diary-repository";
import { assertDate } from "@/features/life-event/model/validation";
import { fingerprintLifeEventText } from "@/features/life-event/repository/source-fingerprint";
import { getMoment } from "@/features/moment/repository/moment-repository";

import type { LifeExtractionRequest } from "../model/types";

export type RecordExtractionSourceRef = { type: "moment" | "diary"; id: string };

export class RecordExtractionSourceError extends Error {
  readonly code = "source_missing";

  constructor() {
    super("这条记录已不存在或已移入回收站。");
    this.name = "RecordExtractionSourceError";
  }
}

function recordDate(createdAt: string, timeZone: string): string {
  try {
    if (!timeZone || /^[+-]/.test(timeZone)) throw new Error();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date(createdAt));
    const part = (type: string) => parts.find((value) => value.type === type)?.value;
    const date = `${part("year")?.padStart(4, "0")}-${part("month")}-${part("day")}`;
    assertDate(date);
    return date;
  } catch {
    throw new Error("记录的日期或时区无效。");
  }
}

/** Read one exact source snapshot; no Append, attachment, metadata, or write is involved. */
export async function readRecordExtractionSource(
  ref: RecordExtractionSourceRef,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Promise<{ request: LifeExtractionRequest; createdAt: string }> {
  if (!ref || !["moment", "diary"].includes(ref.type) || typeof ref.id !== "string" || !ref.id.trim()) {
    throw new Error("整理来源无效。");
  }
  const sourceRef = { type: ref.type, id: ref.id };
  const snapshot = sourceRef.type === "moment" ? await getMoment(sourceRef.id) : await getDiary(sourceRef.id);
  if (!snapshot || snapshot.deletedAt !== null) {
    throw new RecordExtractionSourceError();
  }
  const parts = "originalText" in snapshot ? [snapshot.originalText] : [snapshot.title, snapshot.body];
  const text = parts.join("\n\n");
  const occurredOn = recordDate(snapshot.createdAt, timeZone);
  const contentFingerprint = await fingerprintLifeEventText(parts);
  return {
    request: {
      input: { kind: "record", source: { type: sourceRef.type, id: snapshot.id, contentFingerprint } },
      text,
      context: { occurredOn, timeZone },
    },
    createdAt: snapshot.createdAt,
  };
}
