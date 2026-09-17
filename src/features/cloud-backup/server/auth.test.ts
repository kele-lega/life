import { describe, expect, it, vi } from "vitest";

const { signInWithOtp } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithOtp } }),
}));

import { supabaseEmailAuth } from "./auth";
import type { CloudConfig } from "./config";

const config: CloudConfig = {
  databaseUrl: "unused",
  authUrl: "https://auth.invalid",
  authKey: "synthetic",
  origin: "https://life.example",
  bucket: "synthetic",
  region: "us-east-1",
  accessKeyId: "synthetic",
  secretAccessKey: "synthetic",
  accountQuotaBytes: 10_000_000,
  objectEnv: "dev",
};

describe("supabaseEmailAuth.start", () => {
  it("keeps the web Magic Link redirect by default", async () => {
    await supabaseEmailAuth(config).start("web@example.test");
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "web@example.test",
      options: { shouldCreateUser: true, emailRedirectTo: "https://life.example" },
    });
  });

  it("omits emailRedirectTo so replica can send a numeric OTP", async () => {
    await supabaseEmailAuth(config).start("native@example.test", { emailRedirectTo: false });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "native@example.test",
      options: { shouldCreateUser: true },
    });
  });
});
