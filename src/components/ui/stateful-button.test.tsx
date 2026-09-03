import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatefulButton, type StatefulButtonResult } from "./stateful-button";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("StatefulButton", () => {
  it("waits for the actual operation, blocks duplicates, keeps its label, and resets after feedback", async () => {
    let resolve!: (value: StatefulButtonResult) => void;
    const finish = vi.fn();
    const onAction = vi.fn(() => new Promise<StatefulButtonResult>((done) => { resolve = done; }));
    render(<StrictMode><StatefulButton label="保存追加" onAction={onAction} /></StrictMode>);
    const button = screen.getByRole("button", { name: "保存追加" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName("保存中…");
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(button).toHaveAttribute("data-phase", "loading");
    expect(finish).not.toHaveBeenCalled();

    await act(async () => { resolve(finish); });
    expect(button).toHaveAttribute("data-phase", "done");
    expect(button).toHaveAccessibleName("保存追加");
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
    expect(button.querySelector("path")).toHaveAttribute("d", "M 3 8.5 L 6.5 12 L 13 4.5");
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1499));
    expect(finish).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(finish).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("data-phase", "idle");
    expect(button).toBeEnabled();
  });

  it.each(["validation", "rejection"])("never reports success after %s and permits retry", async (failure) => {
    const onAction = vi.fn<() => Promise<StatefulButtonResult>>();
    if (failure === "validation") onAction.mockResolvedValueOnce(false);
    else onAction.mockRejectedValueOnce(new Error("disk"));
    onAction.mockResolvedValueOnce(undefined);
    render(<StatefulButton label="保存" onAction={onAction} />);
    const button = screen.getByRole("button", { name: "保存" });
    await act(async () => { fireEvent.click(button); });
    expect(button).toHaveAttribute("data-phase", "idle");
    expect(button).toBeEnabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await act(async () => { fireEvent.click(button); });
    expect(button).toHaveAttribute("data-phase", "done");
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it("clears success timers and never calls a departed page's completion callback", async () => {
    const finish = vi.fn();
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const view = render(<StatefulButton label="保存日记" onAction={async () => finish} />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    view.unmount();
    expect(clear).toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(finish).not.toHaveBeenCalled();
    clear.mockRestore();
  });

  it("does not start a timer when a pending operation settles after unmount", async () => {
    let resolve!: (value: StatefulButtonResult) => void;
    const finish = vi.fn();
    const view = render(<StatefulButton label="保存" onAction={() => new Promise((done) => { resolve = done; })} />);
    fireEvent.click(screen.getByRole("button"));
    view.unmount();
    await act(async () => { resolve(finish); });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(finish).not.toHaveBeenCalled();
  });

  it("respects externally disabled state", () => {
    const onAction = vi.fn();
    render(<StatefulButton label="保存" disabled onAction={onAction} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onAction).not.toHaveBeenCalled();
  });
});
