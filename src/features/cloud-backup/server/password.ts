import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const USERNAME = /^[a-zA-Z][a-zA-Z0-9._-]{2,31}$/;

export function isUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME.test(value);
}

export function isPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const hash = scryptSync(password, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  try {
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    const actual = scryptSync(password, salt, expected.length, { N, r, p });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function parseAccounts(value: string): Map<string, string> {
  const accounts = new Map<string, string>();
  for (const item of value.split(",")) {
    const separator = item.indexOf(":");
    if (separator <= 0) continue;
    const username = item.slice(0, separator).trim();
    const hash = item.slice(separator + 1).trim();
    if (isUsername(username) && hash.startsWith("scrypt$")) accounts.set(username, hash);
  }
  return accounts;
}
