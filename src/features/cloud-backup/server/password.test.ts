// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, isPassword, isUsername, parseAccounts, verifyPassword } from "./password";

describe("local account password", () => {
  it("accepts stable usernames and rejects emails", () => {
    expect(isUsername("kele")).toBe(true);
    expect(isUsername("a@example.test")).toBe(false);
    expect(isPassword("short")).toBe(false);
    expect(isPassword("long-enough-password")).toBe(true);
  });

  it("hashes and verifies without storing the plaintext", () => {
    const hash = hashPassword("correct-horse");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct-horse", hash)).toBe(true);
    expect(verifyPassword("wrong-horse", hash)).toBe(false);
    expect(parseAccounts(`kele:${hash}`).get("kele")).toBe(hash);
  });
});
