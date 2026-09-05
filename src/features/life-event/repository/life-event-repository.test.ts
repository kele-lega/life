import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, LifeDatabase } from "@/lib/db/client";
import { createMoment, createMomentAppend, updateMomentMetadata, softDeleteMoment, restoreMoment } from "@/features/moment/repository/moment-repository";
import { createDiary, updateDiaryContent } from "@/features/diary/repository/diary-repository";
import type { CreateManualLifeEventInput, LifeEventSourceRef } from "../model/types";
import { createManualLifeEvent, createManualLifeEvents, getLifeEvent, listLifeEventsBySource, listLifeEventsPage } from "./life-event-repository";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const base: CreateManualLifeEventInput = { name: "  阅读\n一本书  ", category: "learning", occurredOn: "2026-09-03", timeZone: "Asia/Shanghai", timePrecision: "day", durationSeconds: 1800 };

beforeEach(async () => { await db.delete(); await db.open(); });
afterEach(async () => { vi.restoreAllMocks(); db.close(); await db.delete(); });

describe("LifeEvent repository", () => {
  it("creates standalone manual data with exact name, date, duration and lifecycle; reopens from IndexedDB", async () => {
    const event = await createManualLifeEvent(base);
    expect(event).toMatchObject({ ...base, origin: "manual", source: null, startAt: null, endAt: null, metadata: {}, deletedAt: null });
    expect(Object.prototype.hasOwnProperty.call(event, "extractionProposalId")).toBe(false);
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.createdAt).toBe(event.updatedAt);
    await expect(getLifeEvent(event.id)).resolves.toEqual({ ...event, sourceStatus: "unlinked" });
    db.close();
    const reopened = new LifeDatabase();
    await reopened.open();
    await expect(reopened.lifeEvents.get(event.id)).resolves.toEqual(event);
    reopened.close();
    await db.open();
    await expect(listLifeEventsPage()).resolves.toMatchObject({ items: [{ id: event.id }], hasMore: false });
  });

  it("allows many same-name events and multiple source types without altering originals", async () => {
    await createMoment({ id: "same", originalText: "看书，写代码" });
    await createMomentAppend("same", { id: "append", text: "继续看书" });
    await createDiary({ id: "same", title: "一天", body: "学习" });
    const before = await Promise.all([db.moments.toArray(), db.momentAppends.toArray(), db.diaries.toArray(), db.attachments.toArray()]);
    const refs: LifeEventSourceRef[] = [{ type: "moment", id: "same" }, { type: "moment", id: "same" }, { type: "momentAppend", id: "append" }, { type: "diary", id: "same" }];
    const events = await createManualLifeEvents(refs.map((source) => ({ ...base, source })));
    expect(new Set(events.map((event) => event.id)).size).toBe(4);
    expect(events[0].source?.contentFingerprint).toMatch(/^sha256:text-v1:[0-9a-f]{64}$/);
    await expect(listLifeEventsBySource(refs[0])).resolves.toHaveLength(2);
    await expect(listLifeEventsBySource(refs[2])).resolves.toHaveLength(1);
    await expect(listLifeEventsBySource(refs[3])).resolves.toHaveLength(1);
    expect(await Promise.all([db.moments.toArray(), db.momentAppends.toArray(), db.diaries.toArray(), db.attachments.toArray()])).toEqual(before);
  });

  it("detects stale Diary content, not metadata changes; never rewrites captured fingerprints", async () => {
    await createDiary({ id: "d", body: "旧内容" });
    const event = await createManualLifeEvent({ ...base, source: { type: "diary", id: "d" } });
    await db.diaries.update("d", { isFavorite: true, updatedAt: new Date().toISOString() });
    await expect(getLifeEvent(event.id)).resolves.toMatchObject({ sourceStatus: "current" });
    await updateDiaryContent("d", { body: "新内容" });
    await expect(getLifeEvent(event.id)).resolves.toMatchObject({ sourceStatus: "stale", source: event.source });
    await expect(db.lifeEvents.get(event.id)).resolves.toEqual(event);
    await createMoment({ id: "m", originalText: "原文" });
    const momentEvent = await createManualLifeEvent({ ...base, source: { type: "moment", id: "m" } });
    await updateMomentMetadata("m", { location: { city: "上海", placeName: null, latitude: null, longitude: null } });
    await expect(getLifeEvent(momentEvent.id)).resolves.toMatchObject({ sourceStatus: "current" });
  });

  it("retries concurrently with stable UUIDs without duplicate records or overwrites", async () => {
    const input = { ...base, id: uuid(1), metadata: { b: [1], a: "x" } };
    const [one, two] = await Promise.all([createManualLifeEvent(input), createManualLifeEvent(input)]);
    expect(one).toEqual(two);
    await expect(createManualLifeEvent({ ...input, metadata: { a: "x", b: [1] } })).resolves.toEqual(one);
    await expect(createManualLifeEvent({ ...input, name: "覆盖" })).rejects.toThrow("不能覆盖");
    await expect(db.lifeEvents.count()).resolves.toBe(1);
    await expect(db.lifeEvents.get(one.id)).resolves.toEqual(one);
  });

  it("rolls back a partial IndexedDB batch failure and can retry the exact batch", async () => {
    const inputs = [{ ...base, id: uuid(1) }, { ...base, id: uuid(2) }];
    const failSecond = (_key: unknown, object: { id: string }) => { if (object.id === uuid(2)) throw new Error("simulated write failure"); };
    db.lifeEvents.hook("creating", failSecond);
    await expect(createManualLifeEvents(inputs)).rejects.toThrow("simulated write failure");
    db.lifeEvents.hook("creating").unsubscribe(failSecond);
    await expect(db.lifeEvents.count()).resolves.toBe(0);
    const events = await createManualLifeEvents(inputs);
    await expect(createManualLifeEvents(inputs)).resolves.toEqual(events);
    await expect(db.lifeEvents.count()).resolves.toBe(2);
  });

  it("rejects an entire batch for missing/deleted sources and checks Append parents", async () => {
    await createMoment({ id: "m", originalText: "来源" });
    await createMomentAppend("m", { id: "a", text: "追加" });
    await createDiary({ id: "d", body: "日记" });
    for (const type of ["moment", "momentAppend", "diary"] as const) {
      await expect(createManualLifeEvents([base, { ...base, source: { type, id: "missing" } }])).rejects.toThrow("来源");
    }
    await db.moments.update("m", { deletedAt: new Date().toISOString() });
    await db.diaries.update("d", { deletedAt: new Date().toISOString() });
    for (const source of [{ type: "moment", id: "m" }, { type: "momentAppend", id: "a" }, { type: "diary", id: "d" }] as const) {
      await expect(createManualLifeEvent({ ...base, source })).rejects.toThrow("来源");
    }
    await expect(db.lifeEvents.count()).resolves.toBe(0);
  });

  it("filters event tombstones and absent/deleted sources from all read APIs without cascade writes", async () => {
    await createMoment({ id: "m", originalText: "来源" });
    await createMomentAppend("m", { id: "a", text: "追加" });
    await createDiary({ id: "d", body: "日记" });
    const refs: LifeEventSourceRef[] = [{ type: "moment", id: "m" }, { type: "momentAppend", id: "a" }, { type: "diary", id: "d" }];
    const events = await createManualLifeEvents(refs.map((source) => ({ ...base, source })));
    const standalone = await createManualLifeEvent(base);
    await softDeleteMoment("m");
    await db.diaries.update("d", { deletedAt: new Date().toISOString() });
    for (let index = 0; index < refs.length; index++) {
      await expect(getLifeEvent(events[index].id)).resolves.toBeUndefined();
      await expect(listLifeEventsBySource(refs[index])).resolves.toEqual([]);
      await expect(db.lifeEvents.get(events[index].id)).resolves.toEqual(events[index]);
    }
    await expect(listLifeEventsPage()).resolves.toMatchObject({ items: [{ id: standalone.id }] });
    await restoreMoment("m");
    await expect(getLifeEvent(events[1].id)).resolves.toMatchObject({ sourceStatus: "current" });
    await db.moments.delete("m"); // Simulate a missing imported source, not a product delete API.
    await expect(getLifeEvent(events[1].id)).resolves.toBeUndefined();
    await db.lifeEvents.update(standalone.id, { deletedAt: new Date().toISOString() });
    await expect(getLifeEvent(standalone.id)).resolves.toBeUndefined();
    await expect(createManualLifeEvent({ ...base, id: standalone.id })).rejects.toThrow("不能覆盖");
    await expect(listLifeEventsPage()).resolves.toMatchObject({ items: [] });
  });

  it("pages by occurredOn/id, skips long hidden runs, never repeats or drops same-day entries", async () => {
    await createManualLifeEvents(Array.from({ length: 90 }, (_, i) => ({ ...base, id: uuid(i + 1) })));
    await db.lifeEvents.where("id").above(uuid(20)).modify({ deletedAt: new Date().toISOString() });
    await createManualLifeEvent({ ...base, id: uuid(100), occurredOn: "2025-01-01" });
    const ids: string[] = [];
    let cursor = null;
    do {
      const page = await listLifeEventsPage({ limit: 7, cursor });
      ids.push(...page.items.map((event) => event.id));
      cursor = page.nextCursor;
      expect(page.items.length).toBeLessThanOrEqual(7);
      expect(page.hasMore).toBe(cursor !== null);
    } while (cursor);
    expect(ids).toEqual([...Array.from({ length: 20 }, (_, i) => uuid(20 - i)), uuid(100)]);
    expect(new Set(ids).size).toBe(21);
  });

  it("keeps date-only times null, handles local day boundaries and derives real DST interval duration", async () => {
    const unknown = await createManualLifeEvent({ ...base, durationSeconds: null });
    expect(unknown.durationSeconds).toBeNull();
    expect(unknown.startAt).toBeNull();
    const time = await createManualLifeEvent({ ...base, timePrecision: "time", startAt: "2026-09-02T16:30:00.000Z", durationSeconds: 0 });
    expect(time.occurredOn).toBe("2026-09-03");
    const interval = await createManualLifeEvent({ ...base, occurredOn: "2026-03-08", timeZone: "America/New_York", timePrecision: "interval", startAt: "2026-03-08T06:30:00.000Z", endAt: "2026-03-08T07:30:00.000Z", durationSeconds: null });
    expect(interval.durationSeconds).toBe(3600);
  });

  it.each([
    { name: " \n " }, { occurredOn: "2026-02-29" }, { occurredOn: "2026-13-01" }, { occurredOn: "26-9-3" },
    { timeZone: "Bad/Zone" }, { timeZone: "+08:00" }, { durationSeconds: -1 }, { durationSeconds: 1.1 },
    { durationSeconds: NaN }, { durationSeconds: Infinity }, { durationSeconds: Number.MAX_SAFE_INTEGER + 1 },
    { timePrecision: "day", startAt: "2026-09-03T01:00:00.000Z" },
    { timePrecision: "time" }, { timePrecision: "interval", startAt: "2026-09-03T01:00:00.000Z" },
    { timePrecision: "time", startAt: "2026-09-03T01:00:00+08:00" },
    { timePrecision: "time", startAt: "2026-09-03T23:00:00.000Z" },
    { timePrecision: "time", startAt: "2026-02-30T01:00:00.000Z" },
    { timePrecision: "interval", startAt: "2026-09-03T01:00:00.000Z", endAt: "2026-09-03T00:00:00.000Z" },
    { timePrecision: "interval", startAt: "2026-09-03T01:00:00.000Z", endAt: "2026-09-03T02:00:00.000Z", durationSeconds: 1 },
    { category: "health" }, { timePrecision: "unknown" }, { id: "not-a-uuid" },
    { metadata: { value: undefined } }, { metadata: { value: new Date() } }, { metadata: { value: "x".repeat(17000) } },
  ])("rejects invalid input: %j", async (fields) => {
    await expect(createManualLifeEvent({ ...base, ...fields } as CreateManualLifeEventInput)).rejects.toThrow();
    await expect(db.lifeEvents.count()).resolves.toBe(0);
  });

  it("rejects cyclic metadata, duplicate batch IDs and invalid paging; accepts a leap date", async () => {
    const metadata: Record<string, unknown> = {}; metadata.self = metadata;
    await expect(createManualLifeEvent({ ...base, metadata })).rejects.toThrow("JSON");
    await expect(createManualLifeEvents([{ ...base, id: uuid(1) }, { ...base, id: uuid(1) }])).rejects.toThrow("ID");
    for (const limit of [0, -1, 1.5, 101]) await expect(listLifeEventsPage({ limit })).rejects.toThrow();
    await expect(listLifeEventsPage({ cursor: { occurredOn: "bad", id: uuid(1) } })).rejects.toThrow();
    await expect(createManualLifeEvent({ ...base, occurredOn: "2024-02-29" })).resolves.toMatchObject({ occurredOn: "2024-02-29" });
  });
});
