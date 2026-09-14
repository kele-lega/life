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
