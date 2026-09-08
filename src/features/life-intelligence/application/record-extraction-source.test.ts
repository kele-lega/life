// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDiary, updateDiaryContent } from "@/features/diary/repository/diary-repository";
import * as sourceFingerprint from "@/features/life-event/repository/source-fingerprint";
import { createMoment, createMomentAppend, createMomentWithAttachments, softDeleteMoment } from "@/features/moment/repository/moment-repository";
import { db } from "@/lib/db/client";

import { readRecordExtractionSource, type RecordExtractionSourceRef } from "./record-extraction-source";

beforeEach(async () => { await db.delete(); await db.open(); });
afterEach(async () => { vi.restoreAllMocks(); db.close(); await db.delete(); });

describe("readRecordExtractionSource", () => {
  it("reads exact Moment text and its creation date without including children or metadata", async () => {
    const text = "  看书40分钟。\r\n今天看到🌿，又想起那条小路。 \n";
    const blob = new Blob([new Uint8Array([0, 10, 255])], { type: "image/png" });
    const moment = await createMomentWithAttachments({
      id: "moment-with-originals", originalText: text, createdAt: "2026-09-05T23:30:00.000Z",
      location: { city: "上海", placeName: "原始地点", latitude: 31, longitude: 121 },
      attachments: [{ id: "original-photo", blob, fileName: "private-photo.png", mimeType: "image/png" }],
    });
    const append = await createMomentAppend(moment.id, { id: "original-append", text: "追加中的私密文字不参与整理。" });
    const attachment = await db.attachments.get("original-photo");
    const snapshot = await readRecordExtractionSource({ type: "moment", id: moment.id }, "Asia/Shanghai");

    expect(snapshot).toEqual({
      createdAt: moment.createdAt,
      request: {
        input: { kind: "record", source: { type: "moment", id: moment.id, contentFingerprint: await sourceFingerprint.fingerprintLifeEventText([text]) } },
        text,
        context: { occurredOn: "2026-09-06", timeZone: "Asia/Shanghai" },
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain(append.text);
    expect(JSON.stringify(snapshot)).not.toContain("private-photo");
    expect(JSON.stringify(snapshot)).not.toContain("原始地点");
    await expect(db.moments.get(moment.id)).resolves.toEqual(moment);
    await expect(db.momentAppends.get(append.id)).resolves.toEqual(append);
    await expect(db.attachments.get("original-photo")).resolves.toEqual(attachment);
    expect(new Uint8Array(await attachment!.blob.arrayBuffer())).toEqual(new Uint8Array([0, 10, 255]));
    await expect(db.lifeExtractionJobs.count()).resolves.toBe(0);
  });

  it.each(["", "  标题🌙\n"])("preserves the full Diary title/body and stable separators for title %j", async (title) => {
    const body = "  看书40分钟。\n\n正文尾部保留空白。  \n";
    const diary = await createDiary({ title, body, createdAt: "2026-09-06T01:15:00.000Z" });
    const { request, createdAt } = await readRecordExtractionSource({ type: "diary", id: diary.id }, "America/Los_Angeles");

    expect(request.text).toBe(`${title}\n\n${body}`);
    expect(request.input).toEqual({ kind: "record", source: { type: "diary", id: diary.id, contentFingerprint: await sourceFingerprint.fingerprintLifeEventText([title, body]) } });
    expect(request.context).toEqual({ occurredOn: "2026-09-05", timeZone: "America/Los_Angeles" });
    expect(createdAt).toBe(diary.createdAt);
    await expect(db.diaries.get(diary.id)).resolves.toEqual(diary);
  });

  it("computes text and fingerprint from the same snapshot when Diary changes during hashing", async () => {
    const diary = await createDiary({ title: "旧标题", body: "旧正文看书40分钟" });
    const hash = sourceFingerprint.fingerprintLifeEventText;
    const expected = await hash([diary.title, diary.body]);
    vi.spyOn(sourceFingerprint, "fingerprintLifeEventText").mockImplementationOnce(async (parts) => {
      await updateDiaryContent(diary.id, { title: "新标题", body: "新正文" });
      return hash(parts);
    });

    const { request } = await readRecordExtractionSource({ type: "diary", id: diary.id }, "UTC");
    expect(request.text).toBe("旧标题\n\n旧正文看书40分钟");
    expect(request.input).toMatchObject({ source: { contentFingerprint: expected } });
    await expect(db.diaries.get(diary.id)).resolves.toMatchObject({ title: "新标题", body: "新正文" });
  });

  it("rejects missing and deleted records without exposing source identifiers or private content", async () => {
    await createMoment({ id: "private-id", originalText: "敏感原文" });
    await softDeleteMoment("private-id");
    const diary = await createDiary({ body: "敏感日记" });
    await db.diaries.update(diary.id, { deletedAt: "2026-09-06T10:00:00.000Z" });
    for (const ref of [{ type: "moment", id: "private-id" }, { type: "diary", id: diary.id }, { type: "moment", id: "unknown-id" }] as const) {
      await expect(readRecordExtractionSource(ref, "UTC")).rejects.toMatchObject({ name: "RecordExtractionSourceError", code: "source_missing", message: "这条记录已不存在或已移入回收站。" });
    }
    await expect(db.lifeExtractionJobs.count()).resolves.toBe(0);
  });

  it.each(["+08:00", "Invalid/Zone", ""])("rejects invalid time zone %j", async (timeZone) => {
    const moment = await createMoment({ originalText: "看书" });
    await expect(readRecordExtractionSource({ type: "moment", id: moment.id }, timeZone)).rejects.toThrow("记录的日期或时区无效。");
  });

  it("does not silently treat unsupported source kinds as a Diary", async () => {
    await expect(readRecordExtractionSource({ type: "momentAppend", id: "append" } as unknown as RecordExtractionSourceRef, "UTC"))
      .rejects.toThrow("整理来源无效。");
  });
});
