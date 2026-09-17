import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const TEST_USERNAMES = ["kele", "wzj"] as const;
export type TestUsername = (typeof TEST_USERNAMES)[number];
export const PASSWORD_MAX_BYTES = 1024;
const HASH_PATTERN = /^scrypt:v1:32768:8:1:([a-f0-9]{32}):([a-f0-9]{128})$/;

export function isTestUsername(value: unknown): value is TestUsername {
  return value === "kele" || value === "wzj";
}

export function isPasswordHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Server/operator use only. The encoded format fixes work factors and uses a fresh 128-bit salt. */
export async function hashTestPassword(password: string): Promise<string> {
  if (typeof password !== "string" || !password.length || Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    throw new Error("Passwords must contain at least 1 character and at most 1024 UTF-8 bytes.");
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt:v1:32768:8:1:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyTestPassword(password: string, encoded: string): Promise<boolean> {
  const match = HASH_PATTERN.exec(encoded);
  if (!match || typeof password !== "string" || !password.length || Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) return false;
  const key = await derive(password, Buffer.from(match[1], "hex"));
  return timingSafeEqual(key, Buffer.from(match[2], "hex"));
}

/** Output is .env syntax containing hashes only, never the supplied passwords. */
export async function initializeTestAccounts(passwords: Record<TestUsername, string>): Promise<string> {
  const kele = await hashTestPassword(passwords.kele);
  const wzj = await hashTestPassword(passwords.wzj);
  return [
    "# Life test accounts only. Keep these hashes in the server secret environment.",
    "# No NEXT_PUBLIC_ prefix. Remove plaintext initialization inputs after use.",
    "# Restart the server after changing hashes. Rotation preserves stable account IDs.",
    "# First successful login initializes each account in the existing CloudStore.",
    "CLOUD_AUTH_MODE=test-password",
    `CLOUD_TEST_KELE_PASSWORD_HASH=${kele}`,
    `CLOUD_TEST_WZJ_PASSWORD_HASH=${wzj}`,
    "",
  ].join("\n");
}
