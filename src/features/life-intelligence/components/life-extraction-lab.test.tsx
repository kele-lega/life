import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";

import { LifeExtractionLab } from "./life-extraction-lab";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  db.close();
  await db.delete();
});

async function extract() {
  await waitFor(() => expect(screen.getByRole("button", { name: "提取候选" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "提取候选" }));
  await screen.findByText("已生成 3 个待审核候选。");
}

describe("LifeExtractionLab", () => {
  it("shows fake extractor proposals and accepts one as an AI event", async () => {
    render(<LifeExtractionLab />);
    await extract();

    expect(screen.getAllByRole("article")).toHaveLength(3);
    const reading = screen.getByRole("article", { name: "阅读" });
    await userEvent.click(within(reading).getByRole("button", { name: "Accept" }));

    expect(await within(reading).findByText("已接受")).toBeVisible();
    const result = within(reading).getByRole("region", { name: "最终 LifeEvent：阅读" });
    expect(result).toHaveTextContent("ai");
    expect(result).toHaveTextContent("40 分钟");
  });

  it("creates a manual event from corrected fields", async () => {
    render(<LifeExtractionLab />);
    await extract();
    const reading = screen.getByRole("article", { name: "阅读" });

    await userEvent.click(within(reading).getByRole("button", { name: "Correct" }));
    const name = within(reading).getByRole("textbox", { name: "修正名称" });
    await userEvent.clear(name);
    await userEvent.type(name, "深度阅读");
    await userEvent.click(within(reading).getByRole("button", { name: "保存修正" }));

    expect(await within(reading).findByText("已修正")).toBeVisible();
    const result = within(reading).getByRole("region", { name: "最终 LifeEvent：深度阅读" });
    expect(result).toHaveTextContent("manual");
    expect(result).toHaveTextContent("深度阅读");
  });

  it("rejects a candidate without creating an event", async () => {
    render(<LifeExtractionLab />);
    await extract();
    const running = screen.getByRole("article", { name: "跑步" });

    await userEvent.click(within(running).getByRole("button", { name: "Reject" }));

    expect(await within(running).findByText("已拒绝")).toBeVisible();
    expect(within(running).getByText("已拒绝，没有生成 LifeEvent。")).toBeVisible();
    expect(within(running).queryByText("Materialized LifeEvent")).not.toBeInTheDocument();
  });

  it("restores the Job, Proposal status and materialized Event on remount", async () => {
    const view = render(<LifeExtractionLab />);
    await extract();
    const reading = screen.getByRole("article", { name: "阅读" });
    await userEvent.click(within(reading).getByRole("button", { name: "Accept" }));
    await within(reading).findByText("已接受");

    view.unmount();
    render(<LifeExtractionLab />);

    expect(await screen.findByText("已恢复 3 个候选及其审核状态。")).toBeVisible();
    const restored = screen.getByRole("article", { name: "阅读" });
    expect(within(restored).getByText("已接受")).toBeVisible();
    expect(within(restored).getByRole("region", { name: "最终 LifeEvent：阅读" })).toHaveTextContent("ai");
    expect(screen.getByLabelText("实验数据说明")).toHaveTextContent("影响 Life Map");
  });

  it("keeps the source snapshot unchanged while the editable input changes", async () => {
    render(<LifeExtractionLab />);
    await extract();
    const source = screen.getByRole("textbox", { name: "原始文本" });
    fireEvent.change(source, { target: { value: "新的输入" } });

    expect(screen.getByText("下午在咖啡馆看书40分钟，晚上跑步半小时。")).toBeVisible();
    expect(source).toHaveValue("新的输入");
  });
});
