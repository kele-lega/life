import { describe, expect, it } from "vitest";

import { diaryHref } from "./diary-href";

describe("diaryHref", () => {
  it("keeps the web record path", () => {
    expect(diaryHref("diary-1", false)).toBe("/diary/diary-1");
  });

  it("uses the static native query path", () => {
    expect(diaryHref("diary-1", true)).toBe("/diary/open/?id=diary-1");
    expect(diaryHref("a b", true)).toBe("/diary/open/?id=a%20b");
  });
});