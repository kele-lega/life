import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Moment } from "@/features/moment/model/types";

import { HomePage } from "./home-page";

const mocks = vi.hoisted(() => ({
  createMomentWithAttachments: vi.fn(),
  listRecentMoments: vi.fn(),
  listMomentAttachments: vi.fn(),
  listMomentAppends: vi.fn(),
  createMomentAppend: vi.fn(),
}));

vi.mock("@/features/moment/repository/moment-repository", () => ({
  createMomentWithAttachments: mocks.createMomentWithAttachments,
  listRecentMoments: mocks.listRecentMoments,
  listMomentAppends: mocks.listMomentAppends,
  createMomentAppend: mocks.createMomentAppend,
}));

vi.mock("@/features/attachment/repository/attachment-repository", () => ({
  listMomentAttachments: mocks.listMomentAttachments,
}));

function savedMoment(): Moment {
  const createdAt = "2026-09-01T12:00:00.000Z";
  return {
    id: "new-moment",
    originalText: "无需刷新立即出现",
    isFavorite: false,
    location: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.createMomentWithAttachments.mockReset();
  mocks.listRecentMoments.mockReset();
  mocks.listMomentAttachments.mockReset();
  mocks.listMomentAppends.mockReset();
  mocks.createMomentAppend.mockReset();
  mocks.listMomentAttachments.mockResolvedValue([]);
  mocks.listMomentAppends.mockResolvedValue([]);
});

describe("HomePage", () => {
  it("keeps quick recording usable when recent records fail to load", async () => {
    const user = userEvent.setup();
    mocks.listRecentMoments.mockRejectedValue(new Error("read failed"));
    render(<HomePage />);

    expect(screen.getByRole("button", { name: "写点什么" })).toBeInTheDocument();
    const recent = screen.getByLabelText("最近记录");
    const more = screen.getByRole("navigation", { name: "浏览生活" });
    expect(recent.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();

    const portal = screen.getByRole("button", { name: /生活脉络/ });
    expect(portal).toHaveAccessibleName(/从此刻，慢慢走向全部生活/);
    expect(portal).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /生活地图/ })).not.toBeInTheDocument();
    await user.click(portal);
    expect(portal).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /时间线/ })).toHaveAttribute("href", "/timeline");
    expect(screen.getByRole("link", { name: /日历/ })).toHaveAttribute("href", "/calendar");
    expect(screen.getByRole("link", { name: /日记/ })).toHaveAttribute("href", "/diary");
    expect(screen.getByRole("link", { name: /搜索/ })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: /生活地图/ })).toHaveAttribute("href", "/life");

    screen.getByRole("link", { name: /日历/ }).focus();
    await user.keyboard("{Escape}");
    expect(portal).toHaveFocus();
    expect(portal).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: "写点什么" }));
    expect(screen.getByRole("textbox", { name: "记录内容" })).toBeInTheDocument();
  });

  it("shows a saved Moment at the top without remounting", async () => {
    const user = userEvent.setup();
    const existing: Moment = {
      ...savedMoment(),
      id: "existing",
      originalText: "较早记录",
      createdAt: "2026-09-01T11:00:00.000Z",
      updatedAt: "2026-09-01T11:00:00.000Z",
    };
    const created = savedMoment();
    mocks.listRecentMoments
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([created, existing]);
    mocks.createMomentWithAttachments.mockResolvedValue(created);
    render(<HomePage />);
    await screen.findByText("较早记录");

    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), created.originalText);
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(screen.getAllByRole("article")[0]).toHaveTextContent(created.originalText);
    expect(mocks.listRecentMoments).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "已保存" })).toHaveAttribute("data-phase", "done");
    await waitFor(() => expect(screen.getByRole("button", { name: "写点什么" })).toBeInTheDocument(), { timeout: 2500 });
  });
});
