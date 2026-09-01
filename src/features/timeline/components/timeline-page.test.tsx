import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Attachment } from "@/features/attachment/model/types";
import type { Diary } from "@/features/diary/model/types";
import type { Moment, MomentAppend } from "@/features/moment/model/types";
import type { TimelineItem, TimelinePage as TimelinePageResult } from "../model/types";

import { TimelinePage } from "./timeline-page";

const mocks = vi.hoisted(() => ({ queryTimelinePage: vi.fn() }));

vi.mock("../query/timeline-query", () => ({
  queryTimelinePage: mocks.queryTimelinePage,
  TIMELINE_PAGE_SIZE: 20,
}));

function momentItem(overrides: Partial<Moment> = {}): Extract<TimelineItem, { type: "moment" }> {
  const createdAt = overrides.createdAt ?? "2026-09-01T12:00:00.000Z";
  const moment: Moment = {
    id: overrides.id ?? "moment-1",
    originalText: overrides.originalText ?? "原始 Moment",
    isFavorite: false,
    location: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  };
  return {
    type: "moment",
    id: moment.id,
    createdAt,
    moment,
    appends: [],
    attachments: [],
    errors: { appends: false, attachments: false },
  };
}

function diaryItem(id = "diary-1", title = ""): Extract<TimelineItem, { type: "diary" }> {
  const createdAt = "2026-09-01T11:00:00.000Z";
  const diary: Diary = {
    id,
    title,
    body: "无标题日记正文",
    isFavorite: false,
    location: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  return { type: "diary", id, createdAt, diary };
}

function image(id: string): Attachment & { url?: string } {
  const blob = new Blob([id], { type: "image/png" });
  return {
    id,
    ownerType: "moment",
    ownerId: "moment-1",
    kind: "image",
    blob,
    fileName: `${id}.png`,
    mimeType: "image/png",
    size: blob.size,
    width: null,
    height: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    deletedAt: null,
  };
}

function page(
  items: TimelineItem[],
  hasMore = false,
): TimelinePageResult {
  return {
    items,
    hasMore,
    nextCursor: hasMore
      ? {
          moments: { createdAt: items.at(-1)?.createdAt ?? "", id: items.at(-1)?.id ?? "" },
          diaries: null,
        }
      : null,
  };
}

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.queryTimelinePage.mockReset();
  let objectUrlIndex = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:timeline-${++objectUrlIndex}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

describe("TimelinePage", () => {
  it("renders a quiet empty state", async () => {
    mocks.queryTimelinePage.mockResolvedValue(page([]));

    render(<TimelinePage />);

    expect(await screen.findByText("还没有记录。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "日记" })).toHaveAttribute("href", "/diary");
  });

  it("shows Moment children and an untitled Diary without inventing metadata", async () => {
    const moment = momentItem({
      location: { city: "上海市", placeName: "静安寺", latitude: null, longitude: null },
    });
    const append: MomentAppend = {
      id: "append-1",
      momentId: moment.id,
      text: "真实追加",
      createdAt: "2026-09-01T12:30:00.000Z",
      updatedAt: "2026-09-01T12:30:00.000Z",
      deletedAt: null,
    };
    moment.appends = [append];
    moment.attachments = [image("image-1"), image("image-2")];
    moment.errors = { appends: true, attachments: true };
    mocks.queryTimelinePage.mockResolvedValue(page([moment, diaryItem()]));

    const { unmount } = render(<TimelinePage />);

    const originalText = await screen.findByText("原始 Moment");
    const article = originalText.closest("article");
    expect(article).not.toBeNull();
    if (!article) throw new Error("Moment article missing");
    expect(within(article).getByText("原始 Moment")).toBeInTheDocument();
    expect(within(article).getByText("上海市 · 静安寺")).toBeInTheDocument();
    expect(within(article).getAllByRole("img")).toHaveLength(2);
    expect(within(article).getByText("真实追加")).toBeInTheDocument();
    expect(within(article).getByText("图片暂时无法读取。")).toBeInTheDocument();
    expect(within(article).getByText("追加内容暂时无法读取。")).toBeInTheDocument();
    const diaryLink = screen.getByRole("link", { name: /无标题日记正文/ });
    expect(diaryLink).toHaveAttribute("href", "/diary/diary-1");
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("loads another bounded page once while a request is pending", async () => {
    let resolveMore: ((value: TimelinePageResult) => void) | undefined;
    mocks.queryTimelinePage
      .mockResolvedValueOnce(page([momentItem()], true))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveMore = resolve; }));
    const user = userEvent.setup();
    render(<TimelinePage />);
    const button = await screen.findByRole("button", { name: "加载更多" });

    await user.dblClick(button);
    expect(mocks.queryTimelinePage).toHaveBeenCalledTimes(2);
    resolveMore?.(page([momentItem(), diaryItem("diary-2", "第二页")]));

    expect(await screen.findByText("第二页")).toBeInTheDocument();
    expect(screen.getAllByText("原始 Moment")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument());
  });
});
