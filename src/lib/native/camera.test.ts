import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativeApp = vi.fn(() => true);
const chooseFromGallery = vi.fn();
const takePhoto = vi.fn();

vi.mock("@/lib/runtime/platform", () => ({
  isNativeApp: () => isNativeApp(),
}));

vi.mock("@capacitor/camera", () => ({
  Camera: {
    chooseFromGallery: (options: unknown) => chooseFromGallery(options),
    takePhoto: (options: unknown) => takePhoto(options),
  },
  MediaType: { Photo: 0, Video: 1 },
  MediaTypeSelection: { Photo: 0, Video: 1, All: 2 },
  EncodingType: { JPEG: 0, PNG: 1 },
}));

import { pickNativeImages, takeNativePhoto } from "./camera";

beforeEach(() => {
  isNativeApp.mockReturnValue(true);
  chooseFromGallery.mockReset();
  takePhoto.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("native camera adapter", () => {
  it("does nothing in the browser PWA", async () => {
    isNativeApp.mockReturnValue(false);
    expect(await pickNativeImages()).toEqual([]);
    expect(await takeNativePhoto()).toBeNull();
    expect(chooseFromGallery).not.toHaveBeenCalled();
    expect(takePhoto).not.toHaveBeenCalled();
  });

  it("converts gallery photos into Files and skips videos", async () => {
    chooseFromGallery.mockResolvedValue({
      results: [
        { type: 0, webPath: "https://localhost/_capacitor_file_/a.jpg" },
        { type: 1, webPath: "https://localhost/_capacitor_file_/clip.mp4" },
      ],
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
    } as Response);
    const files = await pickNativeImages();
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe("image/jpeg");
    expect(files[0].name).toMatch(/gallery-1\.jpg$/);
  });

  it("returns no files when the user cancels", async () => {
    chooseFromGallery.mockRejectedValue(new Error("User cancelled photos app"));
    takePhoto.mockRejectedValue(new Error("User cancelled photos app"));
    expect(await pickNativeImages()).toEqual([]);
    expect(await takeNativePhoto()).toBeNull();
  });

  it("returns a camera File for a captured photo", async () => {
    takePhoto.mockResolvedValue({ type: 0, webPath: "https://localhost/_capacitor_file_/shot.jpg" });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
    } as Response);
    const file = await takeNativePhoto();
    expect(file?.type).toBe("image/jpeg");
    expect(file?.size).toBeGreaterThan(0);
  });
});
