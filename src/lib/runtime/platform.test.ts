import { describe, expect, it } from "vitest";

import { isNativeApp, isNativeWebBuild } from "./platform";

describe("platform", () => {
  it("keeps the browser PWA off the Capacitor path", () => {
    expect(isNativeWebBuild()).toBe(false);
    expect(isNativeApp()).toBe(false);
  });
});
