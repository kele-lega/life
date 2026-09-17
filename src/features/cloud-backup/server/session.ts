import type { CloudConfig } from "./config";

export const SESSION_SECONDS = 30 * 86400;
export const isOpaqueToken = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

function cookieName(config: CloudConfig) {
  return config.origin.startsWith("https:") ? "__Host-life_session" : "life_session_local";
}

export function readCookieToken(request: Request, config: CloudConfig): string | null {
  const token = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${cookieName(config)}=`))?.slice(cookieName(config).length + 1);
  return isOpaqueToken(token) ? token : null;
}

export function sessionCookie(config: CloudConfig, token: string, clear = false): string {
  return `${cookieName(config)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_SECONDS}${config.origin.startsWith("https:") ? "; Secure" : ""}`;
}
