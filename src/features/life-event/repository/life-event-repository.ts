import Dexie from "dexie";

import { db } from "@/lib/db/client";
import { createEntityId } from "@/lib/identity/create-entity-id";
import { nowTimestamp } from "@/lib/time/timestamps";
import type { CreateManualLifeEventInput, LifeEvent, LifeEventCursor, LifeEventPage, LifeEventSourceRef, LifeEventView } from "../model/types";
import { assertDate, assertSource, canonicalJson, normalizeInput } from "../model/validation";
import { lifeEventSourceKey, readLifeEventSourceFingerprints } from "./source-fingerprint";

const tables = () => [db.lifeEvents, db.moments, db.momentAppends, db.diaries];
const SCAN_BATCH_SIZE = 64;

function payload(event: LifeEvent) {
  return {
    source: event.source ? { type: event.source.type, id: event.source.id } : null,
    category: event.category, name: event.name, occurredOn: event.occurredOn, timeZone: event.timeZone,
    timePrecision: event.timePrecision, startAt: event.startAt, endAt: event.endAt,
    durationSeconds: event.durationSeconds, metadata: event.metadata,
  };
}

/** Atomic batch. Equal UUID + equal payload is a retry; conflicting reuse is an error. */
export async function createManualLifeEvents(inputs: readonly CreateManualLifeEventInput[]): Promise<LifeEvent[]> {
  if (inputs.length > 100) throw new Error("一次最多创建 100 个事件。");
  // Snapshot all caller-owned values before the first await.
  const normalized = inputs.map((input) => ({ id: input.id ?? createEntityId(), fields: normalizeInput(input) }));
  if (new Set(normalized.map((entry) => entry.id)).size !== normalized.length) throw new Error("同批事件 ID 不能重复。");
  if (!normalized.length) return [];
  return db.transaction("rw", tables(), async () => {
    const hashes = await readLifeEventSourceFingerprints(normalized.flatMap(({ fields }) => fields.source ? [fields.source] : []));
    const existing = await db.lifeEvents.bulkGet(normalized.map(({ id }) => id));
    const createdAt = nowTimestamp();
    const toAdd: LifeEvent[] = [];
    const result = normalized.map(({ id, fields }, index) => {
      const fingerprint = fields.source ? hashes.get(lifeEventSourceKey(fields.source)) : null;
      if (fields.source && !fingerprint) throw new Error("来源不存在或已删除。");
      const old = existing[index];
      if (old) {
        if (old.deletedAt !== null || old.origin !== "manual" || old.extractionProposalId !== undefined || canonicalJson(payload(old)) !== canonicalJson(fields)) {
          throw new Error("事件 ID 已存在，不能覆盖已有事件。");
        }
        // A retry never rewrites creation time or the originally captured source fingerprint.
        return old;
      }
      const event: LifeEvent = {
        ...fields, id, origin: "manual",
        source: fields.source ? { ...fields.source, contentFingerprint: fingerprint! } : null,
        createdAt, updatedAt: createdAt, deletedAt: null,
      };
      toAdd.push(event);
      return event;
    });
    // Do not catch BulkError in this transaction: partial writes must roll back.
    await db.lifeEvents.bulkAdd(toAdd);
    return result;
  });
}

export async function createManualLifeEvent(input: CreateManualLifeEventInput): Promise<LifeEvent> {
  return (await createManualLifeEvents([input]))[0];
}

async function visibleViews(events: readonly LifeEvent[]): Promise<LifeEventView[]> {
  const active = events.filter((event) => event.deletedAt === null);
  const hashes = await readLifeEventSourceFingerprints(active.flatMap((event) => event.source ? [event.source] : []));
  return active.flatMap((event): LifeEventView[] => {
    if (!event.source) return [{ ...event, sourceStatus: "unlinked" }];
    const hash = hashes.get(lifeEventSourceKey(event.source));
    if (!hash) return [];
    return [{ ...event, sourceStatus: hash === event.source.contentFingerprint ? "current" : "stale" }];
  });
}

export async function getLifeEvent(id: string): Promise<LifeEventView | undefined> {
  return db.transaction("r", tables(), async () => {
    const event = await db.lifeEvents.get(id);
    return event ? (await visibleViews([event]))[0] : undefined;
  });
}

export async function listLifeEventsBySource(source: LifeEventSourceRef): Promise<LifeEventView[]> {
  assertSource(source);
  return db.transaction("r", tables(), async () => {
    const events = await db.lifeEvents.where("[source.type+source.id]").equals([source.type, source.id]).toArray();
    return (await visibleViews(events)).sort((a, b) =>
      a.occurredOn === b.occurredOn ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : (a.occurredOn < b.occurredOn ? 1 : -1));
  });
}

/**
 * Statistics boundary: active final events with standalone/current sources.
 * The natural-date range is [startDateInclusive, endDateExclusive).
 */
export async function listLifeEventsForStatistics({
  startDateInclusive,
  endDateExclusive,
}: {
  startDateInclusive: string;
  endDateExclusive: string;
}): Promise<LifeEventView[]> {
  assertDate(startDateInclusive);
  assertDate(endDateExclusive);
  if (startDateInclusive >= endDateExclusive) {
    throw new Error("统计日期范围必须递增。");
  }

  return db.transaction("r", tables(), async () => {
    const events = await db.lifeEvents
      .where("[occurredOn+id]")
      .between(
        [startDateInclusive, Dexie.minKey],
        [endDateExclusive, Dexie.minKey],
        true,
        false,
      )
      .toArray();
    const views: LifeEventView[] = [];
    for (let offset = 0; offset < events.length; offset += 512) {
      views.push(...await visibleViews(events.slice(offset, offset + 512)));
    }
    return views.filter((event) => event.sourceStatus !== "stale");
  });
}

/** Keyset pagination scans bounded chunks even across many hidden/deleted sources. */
export async function listLifeEventsPage(
  { limit = 20, cursor = null }: { limit?: number; cursor?: LifeEventCursor | null } = {},
): Promise<LifeEventPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("每页条数必须为 1–100 的整数。");
  if (cursor) {
    assertDate(cursor.occurredOn);
    if (!cursor.id) throw new Error("分页游标无效。");
  }
  return db.transaction("r", tables(), async () => {
    const items: LifeEventView[] = [];
    let scanCursor = cursor;
    while (items.length <= limit) {
      const collection = scanCursor
        ? db.lifeEvents.where("[occurredOn+id]").below([scanCursor.occurredOn, scanCursor.id]).reverse()
        : db.lifeEvents.orderBy("[occurredOn+id]").reverse();
      const batch = await collection.limit(SCAN_BATCH_SIZE).toArray();
      items.push(...await visibleViews(batch));
      const last = batch.at(-1);
      if (!last || batch.length < SCAN_BATCH_SIZE) break;
      scanCursor = { occurredOn: last.occurredOn, id: last.id };
    }
    const hasMore = items.length > limit;
    items.length = Math.min(items.length, limit);
    const last = items.at(-1);
    return { items, hasMore, nextCursor: hasMore && last ? { occurredOn: last.occurredOn, id: last.id } : null };
  });
}
