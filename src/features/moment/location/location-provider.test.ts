import { describe, expect, it, vi } from "vitest";

import { resolveLocation } from "./location-provider";

describe("resolveLocation", () => {
  const coordinates = { latitude: 31.2304, longitude: 121.4737 };

  it("returns coordinates and city when both lookups succeed", async () => {
    const location = await resolveLocation(
      { getCurrentPosition: vi.fn().mockResolvedValue(coordinates) },
      { getCity: vi.fn().mockResolvedValue("上海") },
    );
    expect(location).toEqual({ ...coordinates, city: "上海", placeName: null });
  });

  it.each(["permission denied", "unsupported browser", "timeout"])("returns empty metadata when location is %s", async (label) => {
    const location = await resolveLocation({ getCurrentPosition: () => Promise.reject(new Error(label)) });
    expect(location).toEqual({ city: null, placeName: null, latitude: null, longitude: null });
  });

  it("keeps coordinates when reverse geocoding fails", async () => {
    const location = await resolveLocation(
      { getCurrentPosition: vi.fn().mockResolvedValue(coordinates) },
      { getCity: vi.fn().mockRejectedValue(new Error("offline")) },
    );
    expect(location).toEqual({ ...coordinates, city: null, placeName: null });
  });
});
