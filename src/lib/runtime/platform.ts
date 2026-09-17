type CapacitorBridge = {
  isNativePlatform?: () => boolean;
};

/** Build-time native static export. Inlined by Next; must match Capacitor runtime hrefs. */
export function isNativeWebBuild(): boolean {
  return process.env.NEXT_PUBLIC_LIFE_NATIVE === "1";
}

function capacitorBridge(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

/** Runtime Capacitor WebView. False during SSR and in the browser PWA. */
export function isNativeApp(): boolean {
  return capacitorBridge()?.isNativePlatform?.() === true;
}

/**
 * Hosted Next.js origin for native HTTP. Web uses same-origin (`""`).
 * Never treat `https://localhost` as this origin.
 */
export function hostedApiOrigin(): string | null {
  if (!isNativeApp()) return "";
  const origin = process.env.NEXT_PUBLIC_LIFE_CLOUD_API_ORIGIN?.trim();
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
