import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativeApp = vi.fn(() => true);
const hostedApiOrigin = vi.fn((): string | null => "https://life.example");
const getCurrentPosition = vi.fn();
const httpRequest = vi.fn();

vi.mock("@/lib/runtime/platform", () => ({
  isNativeApp: () => isNativeApp(),
  hostedApiOrigin: () => hostedApiOrigin(),
}));

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    getCurrentPosition: (options: unknown) => getCurrentPosition(options),
  },
}));

vi.mock("@capacitor/core", () => ({
  CapacitorHttp: {
    request: (options: unknown) => httpRequest(options),
  },
}));

import { getNativeCity, getNativeCoordinates } from "./location";

beforeEach(() => {
  isNativeApp.mockReturnValue(true);
  hostedApiOrigin.mockReturnValue("https://life.example");
  getCurrentPosition.mockReset();
  httpRequest.mockReset();
});

describe("native location adapter", () => {
  it("reads a one-shot coordinate from the Geolocation plugin", async () => {
    getCurrentPosition.mockResolvedValue({ coords: { latitude: 31.2, longitude: 121.4 } });
    await expect(getNativeCoordinates()).resolves.toEqual({ latitude: 31.2, longitude: 121.4 });
    expect(getCurrentPosition).toHaveBeenCalledWith({ enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 });
  });

  it("calls the hosted reverse-geocode API over CapacitorHttp", async () => {
    httpRequest.mockResolvedValue({ status: 200, data: { city: "上海" } });
    await expect(getNativeCity({ latitude: 31.2, longitude: 121.4 })).resolves.toBe("上海");
    expect(httpRequest).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "https://life.example/api/location/reverse?latitude=31.2&longitude=121.4",
      headers: expect.objectContaining({ Origin: "https://localhost" }),
    }));
  });

  it("fails open to the caller when the hosted origin is missing", async () => {
    hostedApiOrigin.mockReturnValue(null);
    await expect(getNativeCity({ latitude: 31.2, longitude: 121.4 })).rejects.toThrow(/not configured/);
    expect(httpRequest).not.toHaveBeenCalled();
  });
});
