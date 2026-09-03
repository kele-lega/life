import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Attachment } from "@/features/attachment/model/types";
import type { Moment } from "@/features/moment/model/types";

import { RECENT_MOMENT_LIMIT, RecentMoments } from "./recent-moments";

const mocks = vi.hoisted(() => ({
  listRecentMoments: vi.fn(),
  listMomentAttachments: vi.fn(),
  listMomentAppends: vi.fn(),
  createMomentAppend: vi.fn(),
}));

vi.mock("@/features/moment/repository/moment-repository", () => ({
  listRecentMoments: mocks.listRecentMoments,
  listMomentAppends: mocks.listMomentAppends,
  createMomentAppend: mocks.createMomentAppend,
}));

vi.mock("@/features/attachment/repository/attachment-repository", () => ({
  listMomentAttachments: mocks.listMomentAttachments,
}));

function moment(id: string, originalText: string, createdAt: string): Moment {
  return {
    id,
    originalText,
    isFavorite: false,
    location: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

function attachment(id: string, ownerId: string, fileName: string): Attachment {
  const createdAt = "2026-09-01T10:00:00.000Z";
  const blob = new Blob([id], { type: "image/png" });
  return {
    id,
    ownerType: "moment",
    ownerId,
    kind: "image",
    blob,
    fileName,
    mimeType: "image/png",
    size: blob.size,
    width: null,
    height: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.listRecentMoments.mockReset();
  mocks.listMomentAttachments.mockReset();
  mocks.listMomentAppends.mockReset();
  mocks.createMomentAppend.mockReset();
  mocks.listRecentMoments.mockResolvedValue([]);
  mocks.listMomentAttachments.mockResolvedValue([]);
  mocks.listMomentAppends.mockResolvedValue([]);
});

describe("RecentMoments", () => {
  it("renders a quiet empty state and requests the configured limit", async () => {
    render(<RecentMoments refreshKey={0} />);

    await waitFor(() =>
      expect(mocks.listRecentMoments).toHaveBeenCalledWith(RECENT_MOMENT_LIMIT),
    );
    expect(screen.getByLabelText("最近记录")).toBeInTheDocument();
    expect(await screen.findByText("还没有留下片段。")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText(/第一天|连续记录|完成/)).not.toBeInTheDocument();
  });

  it("shows repository order, local date groups, and exact multiline original text", async () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 32);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 11);
    mocks.listRecentMoments.mockResolvedValue([
      moment("latest", "第一行\n第二行", today.toISOString()),
      moment("earlier", "昨天原文", yesterday.toISOString()),
    ]);

    render(<RecentMoments refreshKey={0} />);

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(screen.getByRole("heading", { name: "今天" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "昨天" })).toBeInTheDocument();
    const articles = screen.getAllByRole("article");
    expect(articles[0].querySelector("p")?.textContent).toBe("第一行\n第二行");
    expect(within(articles[1]).getByText("昨天原文")).toBeInTheDocument();
  });

  it("displays every image for its own Moment without mixing owners", async () => {
    const records = [
      moment("moment-a", "第一条", "2026-09-01T12:00:00.000Z"),
      moment("moment-b", "第二条", "2026-09-01T11:00:00.000Z"),
    ];
    mocks.listRecentMoments.mockResolvedValue(records);
    mocks.listMomentAttachments.mockImplementation(async (ownerId: string) =>
      ownerId === "moment-a"
        ? [attachment("a-1", ownerId, "one.png"), attachment("a-2", ownerId, "two.png")]
        : [attachment("b-1", ownerId, "other.png")],
    );
    let urlSequence = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:image-${urlSequence++}`,
    );

    render(<RecentMoments refreshKey={0} />);

    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(3));
    const articles = screen.getAllByRole("article");
    expect(within(articles[0]).getAllByRole("img")).toHaveLength(2);
    expect(within(articles[0]).queryByRole("img", { name: "other.png" })).not.toBeInTheDocument();
    expect(within(articles[1]).getByRole("img", { name: "other.png" })).toBeInTheDocument();
    expect(mocks.listMomentAttachments).toHaveBeenCalledWith("moment-a");
    expect(mocks.listMomentAttachments).toHaveBeenCalledWith("moment-b");
  });

  it("isolates attachment failures from Moment text and other images", async () => {
    mocks.listRecentMoments.mockResolvedValue([
      moment("broken", "图片失败但文字保留", "2026-09-01T12:00:00.000Z"),
      moment("healthy", "另一条", "2026-09-01T11:00:00.000Z"),
    ]);
    mocks.listMomentAttachments.mockImplementation(async (ownerId: string) => {
      if (ownerId === "broken") throw new Error("read failed");
      return [attachment("healthy-image", ownerId, "healthy.png")];
    });

    render(<RecentMoments refreshKey={0} />);

    await waitFor(() => expect(screen.getByText("图片暂时无法读取。")).toBeInTheDocument());
    expect(screen.getByText("图片失败但文字保留")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "healthy.png" })).toBeInTheDocument();
  });

  it("requeries on refresh and replaces the list without remounting", async () => {
    const earlier = moment("earlier", "旧记录", "2026-09-01T10:00:00.000Z");
    const latest = moment("latest", "刚保存的记录", "2026-09-01T11:00:00.000Z");
    mocks.listRecentMoments.mockResolvedValueOnce([earlier]).mockResolvedValueOnce([latest, earlier]);
    const view = render(<RecentMoments refreshKey={0} />);
    await screen.findByText("旧记录");

    view.rerender(<RecentMoments refreshKey={1} />);

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("刚保存的记录");
    expect(mocks.listRecentMoments).toHaveBeenCalledTimes(2);
  });

  it("loads from the repository again after remount", async () => {
    mocks.listRecentMoments.mockResolvedValue([
      moment("persistent", "来自 IndexedDB", "2026-09-01T10:00:00.000Z"),
    ]);
    const first = render(<RecentMoments refreshKey={0} />);
    await screen.findByText("来自 IndexedDB");
    first.unmount();

    render(<RecentMoments refreshKey={0} />);
    await screen.findByText("来自 IndexedDB");

    expect(mocks.listRecentMoments).toHaveBeenCalledTimes(2);
  });

  it("keeps existing rows, image URLs and append drafts during an asynchronous refresh", async () => {
    const old = moment("old", "旧片段", "2026-09-01T10:00:00.000Z");
    const latest = moment("new", "新片段", "2026-09-01T11:00:00.000Z");
    let finishRefresh!: (records: Moment[]) => void;
    mocks.listRecentMoments.mockResolvedValueOnce([old]).mockImplementationOnce(
      () => new Promise<Moment[]>((resolve) => { finishRefresh = resolve; }),
    );
    mocks.listMomentAttachments.mockImplementation(async (id: string) =>
      id === "old" ? [attachment("photo", id, "keep.png")] : [],
    );
    const createURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:keep");
    const revokeURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const view = render(<RecentMoments refreshKey={0} />);
    const image = await screen.findByRole("img", { name: "keep.png" });
    const article = screen.getByRole("article");
    fireEvent.click(within(article).getByRole("button", { name: "追加" }));
    const input = within(article).getByRole("textbox", { name: "追加文字" });
    fireEvent.change(input, { target: { value: "尚未保存的追加" } });

    view.rerender(<RecentMoments refreshKey={1} />);
    expect(screen.getByRole("article")).toBe(article);
    expect(screen.getByRole("img")).toBe(image);
    expect(screen.queryByText("正在读取…")).not.toBeInTheDocument();
    expect(revokeURL).not.toHaveBeenCalled();
    await act(async () => { finishRefresh([latest, { ...old }]); });

    expect(screen.getAllByRole("article")[1]).toBe(article);
    expect(screen.getByRole("img")).toBe(image);
    expect(within(article).getByRole("textbox", { name: "追加文字" })).toBe(input);
    expect(input).toHaveValue("尚未保存的追加");
    expect(createURL).toHaveBeenCalledTimes(1);
    expect(revokeURL).not.toHaveBeenCalled();
    view.unmount();
    expect(revokeURL).toHaveBeenCalledExactlyOnceWith("blob:keep");
  });

  it("discards a stale attachment response without replacing newer rows or allocating URLs", async () => {
    const stale = moment("stale", "过期结果", "2026-09-01T10:00:00.000Z");
    const current = moment("current", "当前结果", "2026-09-01T11:00:00.000Z");
    let finishStale!: (images: Attachment[]) => void;
    mocks.listRecentMoments.mockResolvedValueOnce([stale]).mockResolvedValueOnce([current]);
    mocks.listMomentAttachments.mockImplementation(async (id: string) =>
      id === "stale"
        ? new Promise<Attachment[]>((resolve) => { finishStale = resolve; })
        : [],
    );
    const createURL = vi.spyOn(URL, "createObjectURL");
    const view = render(<RecentMoments refreshKey={0} />);
    await waitFor(() => expect(mocks.listMomentAttachments).toHaveBeenCalledWith("stale"));
    view.rerender(<RecentMoments refreshKey={1} />);
    const currentRow = await screen.findByRole("article");
    await act(async () => { finishStale([attachment("stale-photo", "stale", "stale.png")]); });

    expect(screen.getByRole("article")).toBe(currentRow);
    expect(currentRow).toHaveTextContent("当前结果");
    expect(screen.queryByText("过期结果")).not.toBeInTheDocument();
    expect(createURL).not.toHaveBeenCalled();
  });

  it("retains the last successful view and its images after a failed refresh and retry", async () => {
    const old = moment("old", "仍可阅读", "2026-09-01T10:00:00.000Z");
    mocks.listRecentMoments.mockResolvedValueOnce([old]).mockRejectedValueOnce(new Error("read failed")).mockResolvedValueOnce([{ ...old }]);
    mocks.listMomentAttachments.mockResolvedValue([attachment("photo", "old", "keep.png")]);
    const createURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:keep");
    const revokeURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const view = render(<RecentMoments refreshKey={0} />);
    const image = await screen.findByRole("img", { name: "keep.png" });
    const article = screen.getByRole("article");
    view.rerender(<RecentMoments refreshKey={1} />);
    await screen.findByRole("alert");
    expect(screen.getByRole("article")).toBe(article);
    expect(screen.getByRole("img")).toBe(image);
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("article")).toBe(article);
    expect(screen.getByRole("img")).toBe(image);
    expect(createURL).toHaveBeenCalledTimes(1);
    expect(revokeURL).not.toHaveBeenCalled();
  });

  it("revokes object URLs when data is replaced and on unmount", async () => {
    const first = moment("first", "第一条", "2026-09-01T10:00:00.000Z");
    const second = moment("second", "第二条", "2026-09-01T11:00:00.000Z");
    mocks.listRecentMoments.mockResolvedValueOnce([first]).mockResolvedValueOnce([second]);
    mocks.listMomentAttachments
      .mockResolvedValueOnce([attachment("first-image", "first", "first.png")])
      .mockResolvedValueOnce([attachment("second-image", "second", "second.png")]);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const view = render(<RecentMoments refreshKey={0} />);
    await screen.findByRole("img", { name: "first.png" });

    view.rerender(<RecentMoments refreshKey={1} />);
    await screen.findByRole("img", { name: "second.png" });

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:first"));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second");
  });

  it("shows city and optional place without exposing coordinates", async () => {
    mocks.listRecentMoments.mockResolvedValue([
      {
        ...moment("located", "有位置的记录", "2026-09-01T12:00:00.000Z"),
        location: { city: "上海", placeName: "武康路", latitude: 31.2, longitude: 121.4 },
      },
      {
        ...moment("unlocated", "没有位置的记录", "2026-09-01T11:00:00.000Z"),
        location: null,
      },
    ]);

    render(<RecentMoments refreshKey={0} />);

    const articles = await screen.findAllByRole("article");
    expect(within(articles[0]).getByText(/上海 · 武康路/)).toBeInTheDocument();
    expect(within(articles[0]).getByRole("time")).not.toHaveTextContent("上海");
    expect(within(articles[0]).queryByText(/31\.2|121\.4/)).not.toBeInTheDocument();
    expect(within(articles[1]).queryByText(/°|上海|武康路/)).not.toBeInTheDocument();
  });

  it("shows an existing Append without replacing the original Moment text", async () => {
    const originalText = "原始内容保持不变";
    mocks.listRecentMoments.mockResolvedValue([
      moment("moment-1", originalText, "2026-09-01T12:00:00.000Z"),
    ]);
    mocks.listMomentAppends.mockResolvedValue([
      {
        id: "append-1",
        momentId: "moment-1",
        text: "后来补充的内容",
        createdAt: "2026-09-01T13:00:00.000Z",
        updatedAt: "2026-09-01T13:00:00.000Z",
        deletedAt: null,
      },
    ]);

    render(<RecentMoments refreshKey={0} />);

    const article = await screen.findByRole("article");
    expect(within(article).getByText(originalText)).toBeInTheDocument();
    expect(await within(article).findByText("后来补充的内容")).toBeInTheDocument();
    expect(within(article).getByText(originalText).textContent).toBe(originalText);
    expect(mocks.listMomentAppends).toHaveBeenCalledWith("moment-1");
  });

  it("shows a concise query error without throwing", async () => {
    mocks.listRecentMoments.mockRejectedValue(new Error("database unavailable"));

    render(<RecentMoments refreshKey={0} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("最近记录暂时无法读取。");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
