import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Attachment } from "@/features/attachment/model/types";
import type { Diary } from "@/features/diary/model/types";
import type { Moment } from "@/features/moment/model/types";
import type { SearchPageResult, SearchResult } from "../model/types";

import { SearchPage } from "./search-page";

const mocks = vi.hoisted(() => ({ querySearchPage: vi.fn() }));

vi.mock("../query/search-query", () => ({
  querySearchPage: mocks.querySearchPage,
  SEARCH_PAGE_SIZE: 20,
}));

function momentResult(id = "moment-1", text = "Moment 搜索结果"): Extract<SearchResult, { type: "moment" }> {
  const createdAt = "2026-09-01T12:00:00.000Z";
  const moment: Moment = {
    id,
    originalText: text,
    isFavorite: false,
    location: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  return {
    type: "moment",
    id,
    createdAt,
    item: {
      type: "moment",
      id,
      createdAt,
      moment,
      appends: [],
      attachments: [],
      errors: { appends: false, attachments: false },
    },
    match: { originalText: true, appendIds: [] },
  };
}

function diaryResult(id = "diary-1", body = "Diary 搜索结果"): Extract<SearchResult, { type: "diary" }> {
  const createdAt = "2026-09-01T11:00:00.000Z";
  const diary: Diary = {
    id,
    title: "",
    body,
    isFavorite: false,
    location: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
  return {
    type: "diary",
    id,
    createdAt,
    item: { type: "diary", id, createdAt, diary },
    match: { title: false, body: true },
  };
}

function page(items: SearchResult[], hasMore = false, nextOffset: number | null = null): SearchPageResult {
  return { keyword: "关键词", items, hasMore, nextOffset };
}

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.querySearchPage.mockReset();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:search-image");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

describe("SearchPage", () => {
  it("keeps blank submissions quiet and does not execute a search", async () => {
    const user = userEvent.setup();
    render(<SearchPage />);

    expect(screen.getByText("输入关键词后查看结果。")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "关键词" }), "   ");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    expect(mocks.querySearchPage).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "搜索结果" })).not.toBeInTheDocument();
  });

  it("shows Moment and Diary results and clears them when the keyword changes", async () => {
    mocks.querySearchPage.mockResolvedValue(page([momentResult(), diaryResult()]));
    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByRole("searchbox", { name: "关键词" }), "关键词");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    const results = await screen.findByRole("region", { name: "搜索结果" });
    expect(within(results).getByText("Moment 搜索结果")).toBeInTheDocument();
    expect(within(results).getByRole("link", { name: /Diary 搜索结果/ }))
      .toHaveAttribute("href", "/diary/diary-1");
    expect(within(results).getByText("命中：原文")).toBeInTheDocument();
    expect(within(results).getByText("命中：正文")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "关键词" }), "新");
    expect(screen.queryByRole("region", { name: "搜索结果" })).not.toBeInTheDocument();
    expect(screen.getByText("输入关键词后查看结果。")).toBeInTheDocument();
  });

  it("keeps Moment text visible when image hydration reports a failure", async () => {
    const result = momentResult();
    result.item.errors.attachments = true;
    mocks.querySearchPage.mockResolvedValue(page([result]));
    const user = userEvent.setup();
    render(<SearchPage />);

    await user.type(screen.getByRole("searchbox", { name: "关键词" }), "Moment");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    expect(await screen.findByText("Moment 搜索结果")).toBeInTheDocument();
    expect(screen.getByText("图片暂时无法读取。")).toBeInTheDocument();
  });

  it("loads more once, removes duplicates, and cleans up image object URLs", async () => {
    const attachment: Attachment = {
      id: "image-1",
      ownerType: "moment",
      ownerId: "moment-1",
      kind: "image",
      blob: new Blob(["image"], { type: "image/png" }),
      fileName: "image.png",
      mimeType: "image/png",
      size: 5,
      width: null,
      height: null,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
      deletedAt: null,
    };
    const first = momentResult();
    first.item.attachments = [attachment];
    let resolveMore: ((value: SearchPageResult) => void) | undefined;
    mocks.querySearchPage
      .mockResolvedValueOnce(page([first], true, 20))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveMore = resolve; }));
    const user = userEvent.setup();
    const { unmount } = render(<SearchPage />);
    await user.type(screen.getByRole("searchbox", { name: "关键词" }), "关键词");
    await user.click(screen.getByRole("button", { name: "搜索" }));

    const loadMore = await screen.findByRole("button", { name: "加载更多" });
    await user.dblClick(loadMore);
    expect(mocks.querySearchPage).toHaveBeenCalledTimes(2);
    resolveMore?.(page([first, diaryResult("diary-2", "第二页日记")]));
    expect(await screen.findByText("第二页日记")).toBeInTheDocument();
    expect(screen.getAllByText("Moment 搜索结果")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument());

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:search-image");
  });

  it("shows a concise whole-query error", async () => {
    mocks.querySearchPage.mockRejectedValue(new Error("read failed"));
    const user = userEvent.setup();
    render(<SearchPage />);
    await user.type(screen.getByRole("searchbox", { name: "关键词" }), "关键词");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("搜索暂时无法完成。");
  });
});
