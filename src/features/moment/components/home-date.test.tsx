import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { HomeDate } from "./home-date";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("renders the local date, updates after midnight and releases its timer", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 2, 23, 59, 50));
  const view = render(<HomeDate />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("2026年9月2日星期三");
  expect(view.container.querySelector("time")).toHaveAttribute("datetime", "2026-09-02");
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(view.container.querySelector("time")).toHaveAttribute("datetime", "2026-09-03");
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not use a server timezone as the user's local date", () => {
  expect(renderToString(<HomeDate />)).toContain('aria-label="首页"');
  expect(renderToString(<HomeDate />)).not.toContain('dateTime=');
});
