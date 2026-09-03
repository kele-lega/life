import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MomentAppend } from "@/features/moment/model/types";

import { MomentAppends } from "./moment-appends";

const mocks = vi.hoisted(() => ({
  createMomentAppend: vi.fn(),
  listMomentAppends: vi.fn(),
}));

vi.mock("@/features/moment/repository/moment-repository", () => ({
  createMomentAppend: mocks.createMomentAppend,
  listMomentAppends: mocks.listMomentAppends,
}));

function append(id: string, momentId: string, text: string, createdAt: string): MomentAppend {
  return { id, momentId, text, createdAt, updatedAt: createdAt, deletedAt: null };
}

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.createMomentAppend.mockReset();
  mocks.listMomentAppends.mockReset();
  mocks.listMomentAppends.mockResolvedValue([]);
});

describe("MomentAppends", () => {
  it("shows no empty message and opens the append editor", async () => {
    const user = userEvent.setup();
    render(<MomentAppends momentId="moment-1" />);
    await waitFor(() => expect(mocks.listMomentAppends).toHaveBeenCalledWith("moment-1"));

    expect(screen.queryByText(/还没有|第一次/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(screen.getByRole("textbox", { name: "追加文字" })).toBeInTheDocument();
  });

  it("saves exact multiline text and refreshes from the repository immediately", async () => {
    const user = userEvent.setup();
    const exactText = "  第一行\n第二行  ";
    const stored = append("append-1", "moment-1", exactText, "2026-09-01T16:08:00.000Z");
    mocks.listMomentAppends.mockResolvedValueOnce([]).mockResolvedValueOnce([stored]);
    mocks.createMomentAppend.mockResolvedValue(stored);
    render(<MomentAppends momentId="moment-1" />);
    await waitFor(() => expect(mocks.listMomentAppends).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "追加文字" }), {
      target: { value: exactText },
    });

    await user.click(screen.getByRole("button", { name: "保存追加" }));

    await waitFor(() => expect(mocks.createMomentAppend).toHaveBeenCalledWith("moment-1", { text: exactText }));
    await waitFor(() => expect(mocks.listMomentAppends).toHaveBeenCalledTimes(2));
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === exactText)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "追加文字" })).toHaveValue(exactText);
    expect(screen.getByRole("textbox", { name: "追加文字" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "已保存" })).toHaveAttribute("data-phase", "done");
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "追加文字" })).not.toBeInTheDocument(), { timeout: 2500 });
  });

  it.each(["", "   ", "\n\t"]) ("rejects blank append %j", async (text) => {
    const user = userEvent.setup();
    render(<MomentAppends momentId="moment-1" />);
    await user.click(screen.getByRole("button", { name: "追加" }));
    if (text) {
      fireEvent.change(screen.getByRole("textbox", { name: "追加文字" }), {
        target: { value: text },
      });
    }

    await user.click(screen.getByRole("button", { name: "保存追加" }));

    expect(mocks.createMomentAppend).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("请输入文字后再保存。");
    expect(screen.getByRole("textbox", { name: "追加文字" })).toHaveValue(text);
  });

  it("renders multiple appends in repository order and keeps Moment owners isolated", async () => {
    mocks.listMomentAppends.mockImplementation(async (momentId: string) =>
      momentId === "moment-1"
        ? [
            append("append-a", momentId, "较早补充", "2026-09-01T10:00:00.000Z"),
            append("append-b", momentId, "较晚补充", "2026-09-01T11:00:00.000Z"),
          ]
        : [append("append-c", momentId, "另一条记录的补充", "2026-09-01T12:00:00.000Z")],
    );
    const view = render(
      <div>
        <MomentAppends momentId="moment-1" />
        <MomentAppends momentId="moment-2" />
      </div>,
    );

    await waitFor(() => expect(mocks.listMomentAppends).toHaveBeenCalledTimes(2));
    const sections = view.container.querySelectorAll(".moment-appends");
    const firstTexts = within(sections[0] as HTMLElement).getAllByText(/补充/, { selector: "p" });
    expect(firstTexts[0]).toHaveTextContent("较早补充");
    expect(firstTexts[1]).toHaveTextContent("较晚补充");
    expect(within(sections[0] as HTMLElement).queryByText("另一条记录的补充")).not.toBeInTheDocument();
    expect(within(sections[1] as HTMLElement).getByText("另一条记录的补充")).toBeInTheDocument();
  });

  it("loads persisted appends again after remount", async () => {
    mocks.listMomentAppends.mockResolvedValue([
      append("persistent", "moment-1", "持久化补充", "2026-09-01T10:00:00.000Z"),
    ]);
    const first = render(<MomentAppends momentId="moment-1" />);
    await screen.findByText("持久化补充");
    first.unmount();

    render(<MomentAppends momentId="moment-1" />);
    await screen.findByText("持久化补充");

    expect(mocks.listMomentAppends).toHaveBeenCalledTimes(2);
  });

  it("prevents duplicate submission while saving", async () => {
    const user = userEvent.setup();
    let resolveSave: (value: MomentAppend) => void = () => undefined;
    mocks.createMomentAppend.mockImplementation(
      () => new Promise<MomentAppend>((resolve) => { resolveSave = resolve; }),
    );
    render(<MomentAppends momentId="moment-1" />);
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.type(screen.getByRole("textbox", { name: "追加文字" }), "只保存一次");
    const save = screen.getByRole("button", { name: "保存追加" });

    fireEvent.click(save);
    fireEvent.click(save);

    expect(mocks.createMomentAppend).toHaveBeenCalledTimes(1);
    resolveSave(append("append-1", "moment-1", "只保存一次", "2026-09-01T10:00:00.000Z"));
    await waitFor(() => expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument(), { timeout: 2500 });
  });

  it("keeps input after failure and allows retry", async () => {
    const user = userEvent.setup();
    const stored = append("append-1", "moment-1", "不能丢", "2026-09-01T10:00:00.000Z");
    mocks.createMomentAppend.mockRejectedValueOnce(new Error("quota")).mockResolvedValueOnce(stored);
    mocks.listMomentAppends.mockResolvedValueOnce([]).mockResolvedValueOnce([stored]);
    render(<MomentAppends momentId="moment-1" />);
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.type(screen.getByRole("textbox", { name: "追加文字" }), "不能丢");

    await user.click(screen.getByRole("button", { name: "保存追加" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "追加文字" })).toHaveValue("不能丢");
    expect(screen.getByRole("button", { name: "保存追加" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "保存追加" }));
    await screen.findByText("不能丢", { selector: ".append-entry p" });
    expect(mocks.createMomentAppend).toHaveBeenCalledTimes(2);
  });

  it("cancels blank input directly and protects non-empty input", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MomentAppends momentId="moment-1" />);
    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(confirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "追加" }));
    await user.type(screen.getByRole("textbox", { name: "追加文字" }), "不要丢弃");
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "追加文字" })).toHaveValue("不要丢弃");
  });

  it("isolates append read failure and keeps the append action available", async () => {
    const user = userEvent.setup();
    mocks.listMomentAppends.mockRejectedValue(new Error("read failed"));
    render(<MomentAppends momentId="moment-1" />);

    expect(await screen.findByText("追加内容暂时无法读取。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "追加" }));
    expect(screen.getByRole("textbox", { name: "追加文字" })).toBeInTheDocument();
  });
});
