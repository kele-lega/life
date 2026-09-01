import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db, LifeDatabase } from "@/lib/db/client";
import { createDiary, updateDiaryContent } from "@/features/diary/repository/diary-repository";
import {
  createMoment,
  createMomentAppend,
  createMomentWithAttachments,
  softDeleteMoment,
  softDeleteMomentAppend,
} from "@/features/moment/repository/moment-repository";

import { querySearchPage } from "./search-query";

async function resetDatabase(): Promise<void> {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
}

beforeEach(resetDatabase);
afterEach(resetDatabase);

describe("querySearchPage", () => {
  it("returns a quiet empty page for blank input without exposing all records", async () => {
    await createMoment({ originalText: "不应返回", createdAt: "2026-09-01T10:00:00.000Z" });

    await expect(querySearchPage("   ")).resolves.toEqual({
      keyword: "",
      items: [],
      nextOffset: null,
      hasMore: false,
    });
  });

  it("searches multiline Moment originals with trimmed, case-insensitive text", async () => {
    await createMoment({
      id: "moment-multiline",
      originalText: "第一行\n研究 Database 索引",
      createdAt: "2026-09-01T10:00:00.000Z",
    });

    const page = await querySearchPage("  database  ");
    expect(page.keyword).toBe("database");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      type: "moment",
      id: "moment-multiline",
      match: { originalText: true, appendIds: [] },
    });
  });

  it("returns one parent Moment when its original and multiple Appends match", async () => {
    await createMoment({
      id: "moment-parent",
      originalText: "同步方案",
      createdAt: "2026-09-01T09:00:00.000Z",
    });
    await createMomentAppend("moment-parent", {
      id: "append-a",
      text: "继续讨论同步方案",
      createdAt: "2026-09-01T10:00:00.000Z",
    });
    await createMomentAppend("moment-parent", {
      id: "append-b",
      text: "同步方案已经确定",
      createdAt: "2026-09-01T11:00:00.000Z",
    });

    const page = await querySearchPage("同步方案");
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      type: "moment",
      id: "moment-parent",
      match: { originalText: true, appendIds: ["append-a", "append-b"] },
    });
    if (page.items[0]?.item.type !== "moment") throw new Error("Moment result missing");
    expect(page.items[0].item.appends).toHaveLength(2);
  });

  it("finds a parent only through its active Append and never emits an Append root", async () => {
    await createMoment({
      id: "moment-owner",
      originalText: "下午开会",
      createdAt: "2026-09-01T08:00:00.000Z",
    });
    await createMoment({
      id: "moment-other",
      originalText: "另一条记录",
      createdAt: "2026-09-01T07:00:00.000Z",
    });
    await createMomentAppend("moment-owner", { id: "append-hit", text: "讨论同步架构" });
    await createMomentAppend("moment-other", { id: "append-other", text: "无关内容" });

    const page = await querySearchPage("同步架构");
    expect(page.items.map((item) => `${item.type}:${item.id}`)).toEqual(["moment:moment-owner"]);
    expect(page.items[0]).toMatchObject({
      match: { originalText: false, appendIds: ["append-hit"] },
    });
  });

  it("searches Diary title, body, and an untitled Diary body", async () => {
    await createDiary({
      id: "diary-title",
      title: "数据库设计",
      body: "普通正文",
      createdAt: "2026-09-01T12:00:00.000Z",
    });
    await createDiary({
      id: "diary-body",
      title: "",
      body: "今天去了咖啡馆",
      createdAt: "2026-09-01T11:00:00.000Z",
    });

    await expect(querySearchPage("数据库")).resolves.toMatchObject({
      items: [{ type: "diary", id: "diary-title", match: { title: true, body: false } }],
    });
    await expect(querySearchPage("咖啡")).resolves.toMatchObject({
      items: [{ type: "diary", id: "diary-body", match: { title: false, body: true } }],
    });
  });

  it("uses Chinese substring matching and stable root creation ordering", async () => {
    const sameTime = "2026-09-01T12:00:00.000Z";
    await createMoment({ id: "moment-b", originalText: "研究数据库", createdAt: sameTime });
    await createDiary({ id: "diary-z", body: "数据库笔记", createdAt: sameTime });
    await createMoment({ id: "moment-old", originalText: "旧数据库", createdAt: "2026-08-31T12:00:00.000Z" });

    const page = await querySearchPage("数据");
    expect(page.items.map((item) => item.id)).toEqual(["moment-b", "diary-z", "moment-old"].sort((a, b) => {
      if (a === "moment-old") return 1;
      if (b === "moment-old") return -1;
      return b.localeCompare(a);
    }));
  });

  it("sorts an Append hit by its parent Moment createdAt", async () => {
    await createMoment({ id: "moment-old", originalText: "原文", createdAt: "2026-08-30T08:00:00.000Z" });
    await createMomentAppend("moment-old", {
      text: "晚些时候写下关键词",
      createdAt: "2026-09-02T08:00:00.000Z",
    });
    await createDiary({ id: "diary-new", body: "关键词", createdAt: "2026-09-01T08:00:00.000Z" });

    const page = await querySearchPage("关键词");
    expect(page.items.map((item) => item.id)).toEqual(["diary-new", "moment-old"]);
  });

  it("excludes soft-deleted roots and soft-deleted Append matches", async () => {
    await createMoment({ id: "moment-deleted", originalText: "删除关键词" });
    await softDeleteMoment("moment-deleted");
    await createDiary({ id: "diary-deleted", body: "删除关键词" });
    await db.diaries.update("diary-deleted", { deletedAt: "2026-09-01T12:00:00.000Z" });
    await createMoment({ id: "moment-active", originalText: "保留原文" });
    const append = await createMomentAppend("moment-active", { text: "删除关键词" });
    await softDeleteMomentAppend(append.id);

    await expect(querySearchPage("删除关键词")).resolves.toMatchObject({ items: [] });
  });

  it("hydrates only the matched Moment images without crossing owners", async () => {
    const image = (name: string) => ({
      blob: new Blob([name], { type: "image/png" }),
      fileName: name,
      mimeType: "image/png",
    });
    await createMomentWithAttachments({
      id: "moment-hit",
      originalText: "图片关键词",
      attachments: [image("hit.png")],
    });
    await createMomentWithAttachments({
      id: "moment-other",
      originalText: "其他内容",
      attachments: [image("other.png")],
    });

    const page = await querySearchPage("图片关键词");
    expect(page.items[0]?.item.type).toBe("moment");
    if (page.items[0]?.item.type !== "moment") throw new Error("Moment result missing");
    expect(page.items[0].item.attachments.map((attachment) => attachment.fileName)).toEqual(["hit.png"]);
  });

  it("paginates deterministic roots without duplicates", async () => {
    for (let index = 0; index < 25; index += 1) {
      await createMoment({
        id: `moment-${String(index).padStart(2, "0")}`,
        originalText: "分页关键词",
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
      });
    }

    const first = await querySearchPage("分页关键词", 0, 20);
    const second = await querySearchPage("分页关键词", first.nextOffset ?? 0, 20);
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(first.hasMore).toBe(true);
    expect(first.nextOffset).toBe(20);
    expect(second.hasMore).toBe(false);
    expect(new Set(ids).size).toBe(25);
    expect(ids).toEqual([...ids].sort((left, right) => right.localeCompare(left)));
  });

  it("reads edited Diary bodies and newly added Appends without mutating originals", async () => {
    const moment = await createMoment({ id: "moment-immutable", originalText: "原始内容" });
    const diary = await createDiary({ id: "diary-edited", body: "旧正文" });
    await updateDiaryContent(diary.id, { body: "新的搜索关键词" });
    await createMomentAppend(moment.id, { text: "新的追加关键词" });
    const before = await db.moments.get(moment.id);

    expect((await querySearchPage("新的搜索关键词")).items[0]?.id).toBe(diary.id);
    expect((await querySearchPage("新的追加关键词")).items[0]?.id).toBe(moment.id);
    expect(await db.moments.get(moment.id)).toEqual(before);
  });

  it("can query the same IndexedDB records after the database is reopened", async () => {
    await createMoment({ id: "moment-persisted", originalText: "重新挂载关键词" });
    db.close();
    const reopened = new LifeDatabase();
    await reopened.open();
    reopened.close();
    await db.open();

    expect((await querySearchPage("重新挂载关键词")).items[0]?.id).toBe("moment-persisted");
  });

  it("validates pagination arguments", async () => {
    await expect(querySearchPage("x", -1)).rejects.toThrow("offset");
    await expect(querySearchPage("x", 0, 0)).rejects.toThrow("pageSize");
  });
});
