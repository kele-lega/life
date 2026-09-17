import { createClient } from "@supabase/supabase-js";
import { BackupError } from "../shared/format";
import type { CloudConfig } from "./config";
import { isPasswordHash, isTestUsername, verifyTestPassword } from "./password";

export const TEST_AUTH_PROVIDER = "life-test-password";
export const authProvider = (config: CloudConfig) => config.authMode === "test-password" ? TEST_AUTH_PROVIDER : "supabase";

export interface AuthIdentity {
  subject: string;
  email: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}
export interface EmailOtpStartOptions {
  /** Omit the redirect so the provider can send a numeric OTP instead of a Magic Link. */
  emailRedirectTo?: string | false;
}
export interface EmailAuth {
  start(email: string, options?: EmailOtpStartOptions): Promise<void>;
  verify(email: string, token: string): Promise<AuthIdentity>;
  verifyAccessToken(accessToken: string): Promise<AuthIdentity>;
  refresh(refreshToken: string): Promise<AuthIdentity>;
  verifyPassword?(username: string, password: string): Promise<AuthIdentity>;
}

/** Replaceable authentication adapter; accounts and sessions remain in CloudStore. */
export function cloudAuth(config: CloudConfig): EmailAuth {
  return config.authMode === "test-password" ? testPasswordAuth(config) : supabaseEmailAuth(config);
}

export function testPasswordAuth(config: CloudConfig): EmailAuth {
  const hashes = config.testPasswordHashes;
  if (!hashes || !isPasswordHash(hashes.kele) || !isPasswordHash(hashes.wzj)) throw new BackupError("cloud_configuration");
  const disabled = async (): Promise<never> => { throw new BackupError("auth_mode_disabled", "此登录方式未启用。"); };
  return {
    start: disabled, verify: disabled, verifyAccessToken: disabled, refresh: disabled,
    async verifyPassword(username, password) {
      const supported = isTestUsername(username);
      // Unknown names still perform the same password work; no account existence oracle.
      const valid = await verifyTestPassword(password, hashes[supported ? username : "kele"]);
      if (!supported || !valid) throw new BackupError("unauthorized", "用户名或密码错误。");
      return { subject: username, email: "" };
    },
  };
}
export function supabaseEmailAuth(config: CloudConfig): EmailAuth {
  const client = () => createClient(config.authUrl, config.authKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store" }) },
  });
  return {
    async start(email, options) {
      const otpOptions: { shouldCreateUser: true; emailRedirectTo?: string } = { shouldCreateUser: true };
      if (options?.emailRedirectTo !== false) otpOptions.emailRedirectTo = options?.emailRedirectTo ?? config.origin;
      const { error } = await client().auth.signInWithOtp({ email, options: otpOptions });
      if (error) throw new BackupError("otp_unavailable", "验证码暂时无法发送，请稍后重试。");
    },
    async verify(email, token) {
      const { data, error } = await client().auth.verifyOtp({ email, token, type: "email" });
      if (error || !data.user?.email_confirmed_at || !data.user.email || !data.session) throw new BackupError("otp_invalid", "验证码无效或已过期，请重新获取。");
      // Trust the verified provider subject, never a client-provided user ID/email claim.
      return {
        subject: data.user.id,
        email: data.user.email,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? undefined,
      };
    },
    async verifyAccessToken(accessToken) {
      const { data, error } = await client().auth.getUser(accessToken);
      if (error || !data.user?.email_confirmed_at || !data.user.email) throw new BackupError("otp_invalid", "登录链接无效或已过期，请重新获取。");
      // The provider validates the bearer token and supplies the canonical subject/email.
      return { subject: data.user.id, email: data.user.email };
    },
    async refresh(refreshToken) {
      const { data, error } = await client().auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.user?.email_confirmed_at || !data.user.email || !data.session) throw new BackupError("otp_invalid");
      return {
        subject: data.user.id,
        email: data.user.email,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? undefined,
      };
    },
  };
}
