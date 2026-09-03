import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiaryEditor } from "./diary-editor";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), push: vi.fn() }));
vi.mock("../repository/diary-repository", () => ({ createDiary: mocks.create, updateDiaryContent: mocks.update }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Diary save feedback", () => {
  it("saves exact body without a title before feedback and navigates only once after it", async () => {
    mocks.create.mockResolvedValue({ id: "diary-new" });
    render(<DiaryEditor />);
    const body = "  长正文\n第二行  ";
    fireEvent.change(screen.getByRole("textbox", { name: "日记正文" }), { target: { value: body } });
    const button = screen.getByRole("button", { name: "保存日记" });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ title: "", body });
    expect(button).toHaveAttribute("data-phase", "done");
    expect(button).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "日记正文" })).toBeDisabled();
    expect(mocks.push).not.toHaveBeenCalled();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/diary/diary-new");
  });

  it("retains failed input, still protects it from unloading, and retries an edit without creating a diary", async () => {
    mocks.update.mockRejectedValueOnce(new Error("quota")).mockResolvedValueOnce({ id: "existing" });
    const onSaved = vi.fn();
    render(<DiaryEditor diaryId="existing" initialTitle="原标题" initialBody="原正文" onSaved={onSaved} />);
    fireEvent.change(screen.getByRole("textbox", { name: "日记正文" }), { target: { value: "修改的正文" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "保存日记" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("保存失败，请重试。正文仍然保留。");
    expect(screen.getByRole("textbox", { name: "日记正文" })).toHaveValue("修改的正文");
    expect(screen.getByRole("button", { name: "保存日记" })).toBeEnabled();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "保存日记" })); });
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(onSaved).toHaveBeenCalledExactlyOnceWith({ id: "existing" });
    expect(mocks.update).toHaveBeenLastCalledWith("existing", { title: "原标题", body: "修改的正文" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not show success or update for an unchanged edit", async () => {
    const onCancel = vi.fn();
    render(<DiaryEditor diaryId="existing" initialBody="原正文" onCancel={onCancel} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "保存日记" })); });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "保存日记" })).toHaveAttribute("data-phase", "idle");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
