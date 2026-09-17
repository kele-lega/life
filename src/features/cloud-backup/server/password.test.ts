// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cloudAuth, TEST_AUTH_PROVIDER } from "./auth";
import { cloudAuthMode, cloudConfig, cloudConfigured } from "./config";
import { hashTestPassword, initializeTestAccounts, isPasswordHash, verifyTestPassword } from "./password";

const password = `synthetic-${randomUUID()}`;
const base: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  CLOUD_DATABASE_URL: "unused", CLOUD_APP_ORIGIN: "https://life.example",
  CLOUD_S3_REGION: "synthetic", CLOUD_S3_BUCKET: "synthetic", CLOUD_S3_ACCESS_KEY_ID: "synthetic",
  CLOUD_S3_SECRET_ACCESS_KEY: "synthetic", CLOUD_S3_ENDPOINT: "https://objects.invalid",
};

describe("server test-password initialization", () => {
  it("uses fresh salts, verifies exact passwords and rejects malformed hashes/work factors", async () => {
    const first = await hashTestPassword(password);
    const second = await hashTestPassword(password);
    expect(first).not.toBe(second);
    expect(isPasswordHash(first)).toBe(true);
    expect(await verifyTestPassword(password, first)).toBe(true);
    expect(await verifyTestPassword(`${password} `, first)).toBe(false);
    expect(await verifyTestPassword(password, first.replace(":32768:", ":1073741824:"))).toBe(false);
    expect(await verifyTestPassword(password, "plaintext")).toBe(false);
    await expect(hashTestPassword("")).rejects.toThrow();
    await expect(hashTestPassword("字".repeat(1024))).rejects.toThrow();
    expect(await verifyTestPassword("x", await hashTestPassword("x"))).toBe(true);
  });

  it("outputs only server hash variables and never the initialization inputs", async () => {
    const output = await initializeTestAccounts({ kele: password, wzj: password });
    expect(output).not.toContain(password);
    expect(output).toContain("CLOUD_AUTH_MODE=test-password");
    const lines = output.split("\n").filter((line) => line.startsWith("CLOUD_TEST_"));
    expect(lines).toHaveLength(2);
    const hashes = lines.map((line) => line.slice(line.indexOf("=") + 1));
    expect(hashes.every(isPasswordHash)).toBe(true);
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it("runs with explicit environment or piped JSON without accepting password arguments", () => {
    const script = resolve("scripts/cloud-init-test-accounts.ts");
    const options = { encoding: "utf8" as const, env: { NODE_ENV: "test" as const }, stdio: "pipe" as const };
    const output = execFileSync(process.execPath, ["--import", "tsx", script, "--stdin"], {
      ...options, input: JSON.stringify({ kele: password, wzj: password }),
    });
    expect(output).toContain("CLOUD_TEST_KELE_PASSWORD_HASH=scrypt:");
    expect(output).not.toContain(password);
    const envOutput = execFileSync(process.execPath, ["--import", "tsx", script], {
      ...options, env: { NODE_ENV: "test", CLOUD_TEST_KELE_PASSWORD: password, CLOUD_TEST_WZJ_PASSWORD: password },
    });
    expect(envOutput).toContain("CLOUD_TEST_WZJ_PASSWORD_HASH=scrypt:");
    expect(envOutput).not.toContain(password);
    try {
      execFileSync(process.execPath, ["--import", "tsx", script, "--password", password], options);
      throw new Error("Expected rejection");
    } catch (error) {
      const result = error as { status: number; stdout: string; stderr: string };
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toContain(password);
      expect(result.stderr).toContain("initialization failed");
    }
  });

  it("configures test mode without Supabase and disables every provider method", async () => {
    const hash = await hashTestPassword(password);
    const env = { ...base, CLOUD_AUTH_MODE: "test-password", CLOUD_TEST_KELE_PASSWORD_HASH: hash, CLOUD_TEST_WZJ_PASSWORD_HASH: hash };
    expect(cloudConfigured(env)).toBe(true);
    const config = cloudConfig(env);
    expect(config.authUrl).toBe("");
    const auth = cloudAuth(config);
    expect(await auth.verifyPassword!("kele", password)).toEqual({ subject: "kele", email: "" });
    expect(await auth.verifyPassword!("wzj", password)).toEqual({ subject: "wzj", email: "" });
    await expect(auth.verifyPassword!("other", password)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(auth.verifyPassword!("kele", "wrong")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(auth.start("other@example.test")).rejects.toMatchObject({ code: "auth_mode_disabled" });
    await expect(auth.verify("other@example.test", "123456")).rejects.toMatchObject({ code: "auth_mode_disabled" });
    await expect(auth.verifyAccessToken("synthetic")).rejects.toMatchObject({ code: "auth_mode_disabled" });
    await expect(auth.refresh("synthetic")).rejects.toMatchObject({ code: "auth_mode_disabled" });
    expect(TEST_AUTH_PROVIDER).not.toBe("supabase");
    expect(cloudConfigured({ ...env, CLOUD_TEST_WZJ_PASSWORD_HASH: "" })).toBe(false);
    expect(cloudConfigured({ ...env, CLOUD_AUTH_MODE: "typo" })).toBe(false);
    expect(() => cloudAuthMode({ NODE_ENV: "test", CLOUD_AUTH_MODE: "typo" })).toThrow();
    expect(cloudAuthMode({ NODE_ENV: "test" })).toBe("supabase");
    expect(cloudConfigured(base)).toBe(false);
    expect(cloudConfigured({ ...base, CLOUD_AUTH_URL: "https://auth.invalid", CLOUD_AUTH_KEY: "synthetic" })).toBe(true);
  });
});
