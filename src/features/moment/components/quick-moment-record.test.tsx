import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuickMomentRecord } from "./quick-moment-record";

const resolveLocationMock = vi.hoisted(() => vi.fn());

const createMomentMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/moment/repository/moment-repository", () => ({
  createMoment: createMomentMock,
  createMomentWithAttachments: createMomentMock,
}));

vi.mock("../location/location-provider", () => ({
  resolveLocation: resolveLocationMock,
}));

beforeEach(() => {
  cleanup();
  createMomentMock.mockReset();
  resolveLocationMock.mockReset();
  resolveLocationMock.mockResolvedValue({ city: null, placeName: null, latitude: null, longitude: null });
  vi.restoreAllMocks();
});

describe("QuickMomentRecord", () => {
  it("shows the write entry and opens the recording state", async () => {
    const user = userEvent.setup();
    render(<QuickMomentRecord />);

    expect(screen.getByRole("button", { name: "写点什么" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "写点什么" }));

    expect(screen.getByRole("textbox", { name: "记录内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("saves the exact user text and returns to the initial state", async () => {
    const user = userEvent.setup();
    createMomentMock.mockResolvedValue({ id: "moment-1" });
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    const text = "  今天完成了第一条记录。\n继续记录。  ";

    await user.type(screen.getByRole("textbox", { name: "记录内容" }), text);
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledWith({ originalText: text, location: { city: null, placeName: null, latitude: null, longitude: null }, attachments: [] }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "写点什么" })).toBeInTheDocument();
  });

  it("reports the persisted Moment after saving succeeds", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const moment = {
      id: "moment-1",
      originalText: "即时出现",
      isFavorite: false,
      location: null,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
      deletedAt: null,
    };
    createMomentMock.mockResolvedValue(moment);
    render(<QuickMomentRecord onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "即时出现");

    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(moment));
  });

  it("does not report a save when persistence fails", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    createMomentMock.mockRejectedValue(new Error("quota"));
    render(<QuickMomentRecord onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "还没保存");

    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "\n\t"]) ("does not save %j", async (text) => {
    const user = userEvent.setup();
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    if (text) {
      fireEvent.change(screen.getByRole("textbox", { name: "记录内容" }), {
        target: { value: text },
      });
    }

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(createMomentMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("请输入文字后再保存。");
    expect(screen.getByRole("textbox", { name: "记录内容" })).toHaveValue(text);
  });

  it("only submits once when save is clicked repeatedly", async () => {
    const user = userEvent.setup();
    let resolveSave: (value: unknown) => void = () => undefined;
    createMomentMock.mockImplementation(
      () => new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "一次提交");

    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(createMomentMock).toHaveBeenCalledTimes(1);
    resolveSave({ id: "moment-1" });
    await waitFor(() => expect(screen.getByRole("button", { name: "写点什么" })).toBeInTheDocument());
  });

  it("keeps input and allows retry when repository saving fails", async () => {
    const user = userEvent.setup();
    createMomentMock.mockRejectedValueOnce(new Error("offline"));
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    const text = "这次保存失败也不能丢。";
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), text);

    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "记录内容" })).toHaveValue(text);
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();

    createMomentMock.mockResolvedValueOnce({ id: "moment-1" });
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "写点什么" })).toBeInTheDocument());
  });

  it("selects, previews, removes, and saves multiple images", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation(
      (file) => `blob:${(file as File).name}`,
    );
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    createMomentMock.mockResolvedValue({ id: "moment-1" });
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "带图片的记录");

    const image = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" });
    const secondImage = new File(["webp"], "second.webp", { type: "image/webp" });
    fireEvent.change(screen.getByLabelText("选择图片"), {
      target: { files: [image, secondImage] },
    });

    expect(screen.getByRole("img", { name: "photo.jpg" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "second.webp" })).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "移除 photo.jpg" }));
    expect(screen.queryByRole("img", { name: "photo.jpg" })).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo.jpg");

    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1));
    const savedInput = createMomentMock.mock.calls[0][0];
    expect(savedInput.originalText).toBe("带图片的记录");
    expect(savedInput.attachments).toHaveLength(1);
    expect(savedInput.attachments[0].fileName).toBe("second.webp");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second.webp");
  });

  it("does not save non-image files", async () => {
    const user = userEvent.setup();
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));

    const textFile = new File(["text"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("选择图片"), {
      target: { files: [textFile] },
    });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("只有图片文件可以添加。");
  });

  it("retains selected images and preview URLs when saving fails", async () => {
    const user = userEvent.setup();
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    createMomentMock.mockRejectedValueOnce(new Error("quota"));
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "图片不能丢");
    const image = new File(["png"], "keep.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("选择图片"), { target: { files: [image] } });

    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "记录内容" })).toHaveValue("图片不能丢");
    expect(screen.getByRole("img", { name: "keep.png" })).toBeInTheDocument();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("cancels an empty recording without confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "写点什么" })).toBeInTheDocument();
  });

  it("asks before discarding an image when the text is empty", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    const image = new File(["png"], "unsaved.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("选择图片"), { target: { files: [image] } });

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: "unsaved.png" })).toBeInTheDocument();
  });

  it("revokes pending preview URLs when the component unmounts", async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pending.png");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const view = render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    const image = new File(["png"], "pending.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("选择图片"), { target: { files: [image] } });

    view.unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pending.png");
  });

  it("asks before discarding non-empty unsaved input", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "不要静默丢弃");
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "记录内容" })).toHaveValue("不要静默丢弃");
  });

  it("does not request location again while the same recording remains open", async () => {
    const user = userEvent.setup();
    resolveLocationMock.mockReturnValue(new Promise(() => undefined));
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "继续输入");
    expect(resolveLocationMock).toHaveBeenCalledTimes(1);
  });

  it("starts location lookup without blocking typing and saves the resolved metadata", async () => {
    const user = userEvent.setup();
    let resolveLocation: (value: { city: string; placeName: null; latitude: number; longitude: number }) => void = () => undefined;
    const locationPromise = new Promise<{ city: string; placeName: null; latitude: number; longitude: number }>((resolve) => { resolveLocation = resolve; });
    resolveLocationMock.mockReturnValue(locationPromise);
    createMomentMock.mockResolvedValue({ id: "moment-1" });
    render(<QuickMomentRecord />);

    await user.click(screen.getByRole("button", { name: "写点什么" }));
    expect(screen.getByText("正在获取位置")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "定位不会阻塞输入");
    resolveLocation({ city: "上海", placeName: null, latitude: 31.2, longitude: 121.4 });
    await screen.findByText("上海");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledWith({
      originalText: "定位不会阻塞输入",
      location: { city: "上海", placeName: null, latitude: 31.2, longitude: 121.4 },
      attachments: [],
    }));
  });

  it("preserves manually entered place names exactly", async () => {
    const user = userEvent.setup();
    createMomentMock.mockResolvedValue({ id: "moment-1" });
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "手动地点");
    await user.click(screen.getByRole("button", { name: "添加具体地点" }));
    const placeName = "  家附近咖啡馆  ";
    await user.type(screen.getByRole("textbox", { name: "具体地点" }), placeName);
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(createMomentMock.mock.calls[0][0].location.placeName).toBe(placeName));
  });

  it("saves text and images with empty location when lookup fails", async () => {
    const user = userEvent.setup();
    createMomentMock.mockResolvedValue({ id: "moment-1" });
    render(<QuickMomentRecord />);
    await user.click(screen.getByRole("button", { name: "写点什么" }));
    await user.type(screen.getByRole("textbox", { name: "记录内容" }), "离线也保存");
    const image = new File(["png"], "offline.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("选择图片"), { target: { files: [image] } });
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1));
    expect(createMomentMock.mock.calls[0][0].location).toEqual({ city: null, placeName: null, latitude: null, longitude: null });
    expect(createMomentMock.mock.calls[0][0].attachments).toHaveLength(1);
  });
});
