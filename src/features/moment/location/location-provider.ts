import type { LocationMetadata } from "@/features/moment/model/types";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ReverseGeocoder {
  getCity(coordinates: Coordinates): Promise<string | null>;
}

export interface LocationProvider {
  getCurrentPosition(): Promise<Coordinates>;
}

const defaultReverseGeocoder: ReverseGeocoder = {
  async getCity({ latitude, longitude }): Promise<string | null> {
    const response = await fetch(
      `/api/location/reverse?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error("Reverse geocoding failed.");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("city" in data)) return null;
      const city = data.city;
    return typeof city === "string" && city.length > 0 ? city : null;
  },
};

const defaultLocationProvider: LocationProvider = {
  getCurrentPosition(): Promise<Coordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        (error) => reject(error),
        { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
      );
    });
  },
};

export async function resolveLocation(
  locationProvider: LocationProvider = defaultLocationProvider,
  reverseGeocoder: ReverseGeocoder = defaultReverseGeocoder,
): Promise<LocationMetadata> {
  try {
    const coordinates = await locationProvider.getCurrentPosition();
    let city: string | null = null;
    try {
      city = await reverseGeocoder.getCity(coordinates);
    } catch {
      // Coordinates remain useful when the optional network lookup fails.
    }
    return { ...coordinates, city, placeName: null };
  } catch {
    return { city: null, placeName: null, latitude: null, longitude: null };
  }
}
