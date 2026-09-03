import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NavLink } from "./nav-link";

const pathname = vi.hoisted(() => vi.fn(() => "/timeline"));
vi.mock("next/navigation", () => ({ usePathname: pathname }));
afterEach(cleanup);

it("announces the current page and updates it without replacing the link", () => {
  const view = render(<NavLink href="/timeline">时间线</NavLink>);
  const link = screen.getByRole("link", { name: "时间线" });
  expect(link).toHaveAttribute("aria-current", "page");
  pathname.mockReturnValue("/search");
  view.rerender(<NavLink href="/timeline">时间线</NavLink>);
  expect(screen.getByRole("link", { name: "时间线" })).toBe(link);
  expect(link).not.toHaveAttribute("aria-current");
});
