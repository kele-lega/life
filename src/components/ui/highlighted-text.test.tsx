import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { HighlightedText, searchExcerpt } from "./highlighted-text";

afterEach(cleanup);
it("highlights normalized matches without changing original characters or whitespace", () => {
  const text = "  Café / Cafe\u0301\nCAFÉ  ";
  const { container } = render(<HighlightedText text={text} keyword="café" />);
  expect(container.textContent).toBe(text);
  expect([...container.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["Café", "Cafe\u0301", "CAFÉ"]);
});
it("shows a late diary match in context and keeps a long keyword intact", () => {
  const keyword = "风".repeat(200);
  expect(searchExcerpt("序言".repeat(200) + keyword + "。", keyword)).toContain(keyword);
});
