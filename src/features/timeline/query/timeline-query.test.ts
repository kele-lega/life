import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Diary } from "@/features/diary/model/types";
import type { Moment } from "@/features/moment/model/types";

import { queryTimelinePage } from "./timeline-query";

const mocks = vi.hoisted(() => ({
  listActiveMomentsPage: vi.fn(),
  listActiveDiariesPage: vi.fn(),
  listActiveMomentAppendsByMomentIds: vi.fn(),
  listActiveMomentAttachmentsByMomentIds: vi.fn(),
}));

vi.mock("@/features/moment/repository/moment-repository", () => ({
  listActiveMomentsPage: mocks.listActiveMomentsPage,
  listActiveMomentAppendsByMomentIds: mocks.listActiveMomentAppendsByMomentIds,
}));
vi.mock("@/features/diary/repository/diary-repository", () => ({
  listActiveDiariesPage: mocks.listActiveDiariesPage,
}));
vi.mock("@/features/attachment/repository/attachment-repository", () => ({
  listActiveMomentAttachmentsByMomentIds: mocks.listActiveMomentAttachmentsByMomentIds,
}));

function moment(id: string, createdAt: string): Moment {
  return { id, originalText: id, isFavorite: false, location: null, createdAt, updatedAt: createdAt, deletedAt: null };
}
function diary(id: string, createdAt: string): Diary {
  return { id, title: id, body: id, isFavorite: false, location: null, createdAt, updatedAt: createdAt, deletedAt: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listActiveMomentAppendsByMomentIds.mockResolvedValue(new Map());
  mocks.listActiveMomentAttachmentsByMomentIds.mockResolvedValue(new Map());
});

describe("Timeline query", () => {
  it("merges and sorts independent root sources, keeping children nested", async () => {
    mocks.listActiveMomentsPage.mockResolvedValue({
      items: [moment("m", "2026-09-01T12:00:00.000Z")],
      nextCursor: null,
      hasMore: false,
    });
    mocks.listActiveDiariesPage.mockResolvedValue({
      items: [diary("d", "2026-09-01T13:00:00.000Z")],
      nextCursor: null,
      hasMore: false,
    });
    mocks.listActiveMomentAppendsByMomentIds.mockResolvedValue(new Map([["m", [{ id: "a", momentId: "m", text: "append", createdAt: "2026-09-01T14:00:00.000Z", updatedAt: "2026-09-01T14:00:00.000Z", deletedAt: null }]]]));

    const page = await queryTimelinePage(null, 20);

    expect(page.items.map((item) => `${item.type}:${item.id}`)).toEqual(["diary:d", "moment:m"]);
    expect(page.items.filter((item) => item.type === "moment")).toHaveLength(1);
    expect(mocks.listActiveMomentAppendsByMomentIds).toHaveBeenCalledWith(["m"]);
    expect(mocks.listActiveMomentAttachmentsByMomentIds).toHaveBeenCalledWith(["m"]);
  });

  it("advances each source only past the roots consumed from that source", async () => {
    mocks.listActiveMomentsPage.mockResolvedValue({
      items: [moment("m-2", "2026-09-01T12:00:00.000Z"), moment("m-1", "2026-09-01T11:00:00.000Z")],
      nextCursor: { createdAt: "2026-09-01T11:00:00.000Z", id: "m-1" },
      hasMore: false,
    });
    mocks.listActiveDiariesPage.mockResolvedValue({
      items: [diary("d-2", "2026-09-01T13:00:00.000Z"), diary("d-1", "2026-09-01T10:00:00.000Z")],
      nextCursor: { createdAt: "2026-09-01T10:00:00.000Z", id: "d-1" },
      hasMore: false,
    });

    const page = await queryTimelinePage(null, 2);
    expect(page.items.map((item) => item.id)).toEqual(["d-2", "m-2"]);
    expect(page.nextCursor).toEqual({
      moments: { createdAt: "2026-09-01T12:00:00.000Z", id: "m-2" },
      diaries: { createdAt: "2026-09-01T13:00:00.000Z", id: "d-2" },
    });
  });

  it("does not repeat or skip roots across a source boundary", async () => {
    mocks.listActiveMomentsPage
      .mockResolvedValueOnce({
        items: [moment("m-3", "2026-09-01T12:00:00.000Z"), moment("m-2", "2026-09-01T11:00:00.000Z")],
        nextCursor: { createdAt: "2026-09-01T11:00:00.000Z", id: "m-2" },
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [moment("m-2", "2026-09-01T11:00:00.000Z"), moment("m-1", "2026-09-01T10:00:00.000Z")],
        nextCursor: { createdAt: "2026-09-01T10:00:00.000Z", id: "m-1" },
        hasMore: false,
      })
      .mockResolvedValueOnce({
        items: [], nextCursor: null, hasMore: false,
      });
    mocks.listActiveDiariesPage
      .mockResolvedValueOnce({
        items: [diary("d-3", "2026-09-01T13:00:00.000Z"), diary("d-2", "2026-09-01T09:00:00.000Z")],
        nextCursor: { createdAt: "2026-09-01T09:00:00.000Z", id: "d-2" },
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [diary("d-2", "2026-09-01T09:00:00.000Z"), diary("d-1", "2026-09-01T08:00:00.000Z")],
        nextCursor: null,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        items: [diary("d-2", "2026-09-01T09:00:00.000Z"), diary("d-1", "2026-09-01T08:00:00.000Z")],
        nextCursor: null,
        hasMore: false,
      });

    const first = await queryTimelinePage(null, 2);
    const second = await queryTimelinePage(first.nextCursor, 2);
    const third = await queryTimelinePage(second.nextCursor, 2);

    expect(first.items.map((item) => item.id)).toEqual(["d-3", "m-3"]);
    expect(second.items.map((item) => item.id)).toEqual(["m-2", "m-1"]);
    expect(third.items.map((item) => item.id)).toEqual(["d-2", "d-1"]);
    expect([
      ...first.items,
      ...second.items,
      ...third.items,
    ].map((item) => item.id)).toEqual([
      "d-3",
      "m-3",
      "m-2",
      "m-1",
      "d-2",
      "d-1",
    ]);
  });

  it("returns the other source when child reads fail", async () => {
    mocks.listActiveMomentsPage.mockResolvedValue({ items: [moment("m", "2026-09-01T12:00:00.000Z")], nextCursor: null, hasMore: false });
    mocks.listActiveDiariesPage.mockResolvedValue({ items: [diary("d", "2026-09-01T11:00:00.000Z")], nextCursor: null, hasMore: false });
    mocks.listActiveMomentAppendsByMomentIds.mockRejectedValue(new Error("append read failed"));
    mocks.listActiveMomentAttachmentsByMomentIds.mockRejectedValue(new Error("attachment read failed"));

    const page = await queryTimelinePage();
    const item = page.items.find((value) => value.type === "moment");
    if (!item || item.type !== "moment") throw new Error("moment missing");
    expect(item.appends).toEqual([]);
    expect(item.attachments).toEqual([]);
    expect(item.errors).toEqual({ appends: true, attachments: true });
  });

  it("fails only when both root sources fail", async () => {
    mocks.listActiveMomentsPage.mockRejectedValue(new Error("moment read failed"));
    mocks.listActiveDiariesPage.mockRejectedValue(new Error("diary read failed"));

    await expect(queryTimelinePage()).rejects.toThrow("Timeline cannot be read");
  });
  it("keeps one root source visible when the other source fails", async () => {
    mocks.listActiveMomentsPage.mockRejectedValue(new Error("moment read failed"));
    mocks.listActiveDiariesPage.mockResolvedValue({ items: [diary("d", "2026-09-01T10:00:00.000Z")], nextCursor: null, hasMore: false });

    const page = await queryTimelinePage();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].type).toBe("diary");
  });
});
