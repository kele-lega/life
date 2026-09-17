import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativeApp = vi.fn(() => true);
const notification = vi.fn();

vi.mock("@/lib/runtime/platform", () => ({
  isNativeApp: () => isNativeApp(),
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: { notification: (options: unknown) => notification(options) },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));

import { confirmSaveSuccess } from "./haptics";

beforeEach(() => {
  isNativeApp.mockReturnValue(true);
  notification.mockClear();
});

describe("native save haptics", () => {
  it("does nothing in the browser PWA", async () => {
    isNativeApp.mockReturnValue(false);
    await confirmSaveSuccess();
    expect(notification).not.toHaveBeenCalled();
  });

  it("plays success feedback after a real save", async () => {
    await confirmSaveSuccess();
    expect(notification).toHaveBeenCalledWith({ type: "SUCCESS" });
  });

  it("swallows plugin failures", async () => {
    notification.mockRejectedValueOnce(new Error("no vibrator"));
    await expect(confirmSaveSuccess()).resolves.toBeUndefined();
  });
});
