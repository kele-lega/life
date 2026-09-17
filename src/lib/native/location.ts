import { hostedApiOrigin, isNativeApp } from "@/lib/runtime/platform";
import type { Coordinates } from "@/features/moment/location/location-provider";

export async function getNativeCoordinates(): Promise<Coordinates> {
  const { Geolocation } = await import("@capacitor/geolocation");
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    timeout: 8_000,
    maximumAge: 300_000,
  });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

export async function getNativeCity(coordinates: Coordinates): Promise<string | null> {
  const origin = hostedApiOrigin();
  if (!origin) throw new Error("Reverse geocoding host is not configured.");
  const url = `${origin}/api/location/reverse?latitude=${encodeURIComponent(coordinates.latitude)}&longitude=${encodeURIComponent(coordinates.longitude)}`;
  if (isNativeApp()) {
    const { CapacitorHttp } = await import("@capacitor/core");
    const response = await CapacitorHttp.request({
      url,
      method: "GET",
      headers: { Accept: "application/json", Origin: "https://localhost" },
      connectTimeout: 8_000,
      readTimeout: 8_000,
    });
    if (response.status < 200 || response.status >= 300) throw new Error("Reverse geocoding failed.");
    return cityOf(response.data);
  }
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Reverse geocoding failed.");
  return cityOf(await response.json());
}

function cityOf(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("city" in data)) return null;
  const city = data.city;
  return typeof city === "string" && city.length > 0 ? city : null;
}
