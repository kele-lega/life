import { createClient } from "@supabase/supabase-js";
import { BackupError } from "../shared/format";
import type { CloudConfig } from "./config";
import { isPassword, isUsername, parseAccounts, verifyPassword } from "./password";

export interface AuthIdentity {
  subject: string;
  email: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}
export interface EmailAuth {
  start(email: string): Promise<void>;
  verify(email: string, token: string): Promise<AuthIdentity>;
  verifyAccessToken(accessToken: string): Promise<AuthIdentity>;
  refresh(refreshToken: string): Promise<AuthIdentity>;
  loginPassword?(username: string, password: string): Promise<AuthIdentity>;
}

export function localPasswordAuth(config: CloudConfig): EmailAuth {
  const accounts = parseAccounts(config.accounts ?? "");
  if (!accounts.size) throw new BackupError("cloud_configuration", "本机账户尚未配置。");
  const unavailable = async () => {
    throw new BackupError("otp_unavailable", "此部署使用账号密码登录，不发送邮箱验证码。");
  };
  return {
    start: unavailable,
    verify: unavailable,
    async verifyAccessToken() {
      throw new BackupError("otp_invalid", "此部署使用账号密码登录。");
    },
    async refresh() {
      throw new BackupError("otp_invalid", "此部署使用账号密码登录。");
    },
    async loginPassword(username, password) {
      if (!isUsername(username) || !isPassword(password)) throw new BackupError("otp_invalid", "账号或密码不正确。");
      const hash = accounts.get(username);
      if (!hash || !verifyPassword(password, hash)) throw new BackupError("otp_invalid", "账号或密码不正确。");
      return { subject: username, email: username };
    },
  };
}

export function supabaseEmailAuth(config: CloudConfig): EmailAuth {
  const client = () => createClient(config.authUrl!, config.authKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store" }) },
  });
  return {
    async start(email) {
      const { error } = await client().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: config.origin } });
      if (error) throw new BackupError("otp_unavailable", "验证码暂时无法发送，请稍后重试。");
    },
    async verify(email, token) {
      const { data, error } = await client().auth.verifyOtp({ email, token, type: "email" });
      if (error || !data.user?.email_confirmed_at || !data.user.email || !data.session) throw new BackupError("otp_invalid", "验证码无效或已过期，请重新获取。");
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

export function createCloudAuth(config: CloudConfig): EmailAuth {
  if (config.accounts) return localPasswordAuth(config);
  if (config.authUrl && config.authKey) return supabaseEmailAuth(config);
  throw new BackupError("cloud_unconfigured", "云服务尚未配置。本地导出和恢复仍可使用。");
}
