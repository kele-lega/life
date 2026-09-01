import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const latitude = Number(request.nextUrl.searchParams.get("latitude"));
  const longitude = Number(request.nextUrl.searchParams.get("longitude"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ city: null }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "life-local-record/0.1 (reverse geocoding)",
        },
        next: { revalidate: 86_400 },
      },
    );
    if (!response.ok) return NextResponse.json({ city: null });
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("address" in data)) {
      return NextResponse.json({ city: null });
    }
    const address = data.address;
    if (!address || typeof address !== "object") return NextResponse.json({ city: null });
    const city =
      ("city" in address && typeof address.city === "string" && address.city) ||
      ("town" in address && typeof address.town === "string" && address.town) ||
      ("village" in address && typeof address.village === "string" && address.village) ||
      null;
    return NextResponse.json({ city });
  } catch {
    return NextResponse.json({ city: null });
  }
}
