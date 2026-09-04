import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import * as repository from "../repository/life-event-repository";
import { LifeEventLab } from "./life-event-lab";

beforeEach(async () => { await db.delete(); await db.open(); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); db.close(); await db.delete(); });

async function fill() {
  await screen.findByText("还没有事件。");
  fireEvent.change(screen.getByLabelText("日期"), { target: { value: "2026-09-03" } });
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "  阅读  " } });
  fireEvent.change(screen.getByLabelText("持续时间（分钟，可选）"), { target: { value: "30" } });
}

it("shows an empty lab with no navigation, saves actual IndexedDB data and restores on remount", async () => {
  const user = userEvent.setup();
  const get = vi.spyOn(repository, "getLifeEvent");
  const view = render(<LifeEventLab />);
  await fill();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText(/已从本地读取/);
  expect(get).toHaveBeenCalledOnce();
  expect(await db.lifeEvents.toArray()).toMatchObject([{ name: "  阅读  ", durationSeconds: 1800, occurredOn: "2026-09-03", source: null }]);
  expect(screen.getByLabelText("名称")).toHaveValue("");
  view.unmount();
  render(<LifeEventLab />);
  expect(await within(screen.getByRole("region", { name: "已保存事件" })).findByText("阅读")).toBeVisible();
  expect(await db.moments.count()).toBe(0);
  expect(await db.diaries.count()).toBe(0);
});

it("retains input after write failure and retries the same UUID", async () => {
  vi.spyOn(db.lifeEvents, "bulkAdd").mockRejectedValueOnce(new Error("quota"));
  const create = vi.spyOn(repository, "createManualLifeEvent");
  render(<LifeEventLab />);
  await fill();
  fireEvent.submit(screen.getByRole("form", { name: "创建事件" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("quota");
  expect(screen.getByLabelText("名称")).toHaveValue("  阅读  ");
  expect(screen.getByLabelText("持续时间（分钟，可选）")).toHaveValue(30);
  expect(await db.lifeEvents.count()).toBe(0);
  fireEvent.submit(screen.getByRole("form", { name: "创建事件" }));
  await screen.findByText(/已从本地读取/);
  expect(create.mock.calls[0][0].id).toBe(create.mock.calls[1][0].id);
  expect(await db.lifeEvents.count()).toBe(1);
});

it("does not create a second event when the post-commit read fails", async () => {
  vi.spyOn(repository, "getLifeEvent").mockRejectedValueOnce(new Error("read failed"));
  render(<LifeEventLab />);
  await fill();
  fireEvent.submit(screen.getByRole("form", { name: "创建事件" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存已提交");
  const [committed] = await db.lifeEvents.toArray();
  fireEvent.submit(screen.getByRole("form", { name: "创建事件" }));
  await screen.findByText(/已从本地读取/);
  expect(await db.lifeEvents.toArray()).toEqual([committed]);
});

it("locks duplicate submissions while pending and does not publish after unmount", async () => {
  const actual = repository.createManualLifeEvent;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const create = vi.spyOn(repository, "createManualLifeEvent").mockImplementation(async (input) => { await pending; return actual(input); });
  const view = render(<LifeEventLab />);
  await fill();
  fireEvent.submit(screen.getByRole("form", { name: "创建事件" }));
  fireEvent.submit(screen.getByRole("form", { name: "创建事件" }));
  expect(create).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
  expect(screen.getByLabelText("名称")).toBeDisabled();
  view.unmount();
  await act(async () => { release(); });
  await waitFor(async () => expect(await db.lifeEvents.count()).toBe(1));
});

it("rejects blank names and invalid duration without clearing inputs", async () => {
  render(<LifeEventLab />);
  await fill();
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "   " } });
  fireEvent.submit(screen.getByRole("form", { name: "创建事件" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("请输入名称");
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "阅读" } });
  fireEvent.change(screen.getByLabelText("持续时间（分钟，可选）"), { target: { value: "-1" } });
  fireEvent.submit(screen.getByRole("form", { name: "创建事件" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("非负整数秒");
  expect(await db.lifeEvents.count()).toBe(0);
});

it("recovers a read failure and loads the next persisted page", async () => {
  await repository.createManualLifeEvents(Array.from({ length: 21 }, (_, i) => ({
    name: `事件 ${i}`, category: "activity", occurredOn: "2026-09-03", timeZone: "UTC", timePrecision: "day",
  })));
  vi.spyOn(repository, "listLifeEventsPage").mockRejectedValueOnce(new Error("read failure"));
  render(<LifeEventLab />);
  expect(await screen.findByRole("alert")).toHaveTextContent("读取失败");
  fireEvent.click(screen.getByRole("button", { name: "重试读取" }));
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(20));
  fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(21));
  expect(screen.queryByRole("button", { name: "加载更多" })).not.toBeInTheDocument();
});
