import { BackupError } from "../shared/format";
import { isPasswordHash, type TestUsername } from "./password";

export type CloudAuthMode = "supabase" | "test-password";
export interface CloudConfig {
  databaseUrl: string; authUrl: string; authKey: string; origin: string;
  authMode?: CloudAuthMode; testPasswordHashes?: Record<TestUsername, string>;
  region: string; bucket: string; accessKeyId: string; secretAccessKey: string;
  endpoint?: string; accountQuotaBytes: number; objectEnv: "prod" | "staging" | "dev";
}
const names = ["CLOUD_DATABASE_URL", "CLOUD_APP_ORIGIN", "CLOUD_S3_REGION", "CLOUD_S3_BUCKET", "CLOUD_S3_ACCESS_KEY_ID", "CLOUD_S3_SECRET_ACCESS_KEY", "CLOUD_S3_ENDPOINT"] as const;
export function cloudAuthMode(env: NodeJS.ProcessEnv = process.env): CloudAuthMode {
  const mode = env.CLOUD_AUTH_MODE?.trim() || "supabase";
  if (mode !== "supabase" && mode !== "test-password") throw new BackupError("cloud_configuration");
  return mode;
}
export function cloudConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!names.every((name) => !!env[name]?.trim())) return false;
  try {
    return cloudAuthMode(env) === "test-password"
      ? isPasswordHash(env.CLOUD_TEST_KELE_PASSWORD_HASH) && isPasswordHash(env.CLOUD_TEST_WZJ_PASSWORD_HASH)
      : !!env.CLOUD_AUTH_URL?.trim() && !!env.CLOUD_AUTH_KEY?.trim();
  } catch { return false; }
}
export function cloudConfig(env: NodeJS.ProcessEnv = process.env): CloudConfig {
  const authMode = cloudAuthMode(env);
  if (!cloudConfigured(env)) throw new BackupError("cloud_unconfigured", "云服务尚未配置。本地导出和恢复仍可使用。");
  const origin = new URL(env.CLOUD_APP_ORIGIN!);
  if (origin.origin !== env.CLOUD_APP_ORIGIN || (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname))) throw new BackupError("cloud_configuration");
  let authUrl = "";
  if (authMode === "supabase") {
    const auth = new URL(env.CLOUD_AUTH_URL!);
    if (auth.protocol !== "https:" || auth.username || auth.password) throw new BackupError("cloud_configuration");
    authUrl = auth.origin;
  }
  if (env.CLOUD_S3_ENDPOINT && new URL(env.CLOUD_S3_ENDPOINT).protocol !== "https:") throw new BackupError("cloud_configuration");
  const quota = Number(env.CLOUD_ACCOUNT_QUOTA_BYTES ?? 5 * 1024 * 1024 * 1024);
  if (!Number.isSafeInteger(quota) || quota <= 0) throw new BackupError("cloud_configuration");
  const objectEnv = env.CLOUD_OBJECT_ENV === "prod" || env.CLOUD_OBJECT_ENV === "staging" ? env.CLOUD_OBJECT_ENV : "dev";
  return {
    databaseUrl: env.CLOUD_DATABASE_URL!, authUrl, authKey: authMode === "supabase" ? env.CLOUD_AUTH_KEY! : "", authMode,
    ...(authMode === "test-password" ? { testPasswordHashes: { kele: env.CLOUD_TEST_KELE_PASSWORD_HASH!, wzj: env.CLOUD_TEST_WZJ_PASSWORD_HASH! } } : {}),
    origin: origin.origin, region: env.CLOUD_S3_REGION!, bucket: env.CLOUD_S3_BUCKET!, accessKeyId: env.CLOUD_S3_ACCESS_KEY_ID!, secretAccessKey: env.CLOUD_S3_SECRET_ACCESS_KEY!, endpoint: env.CLOUD_S3_ENDPOINT, accountQuotaBytes: quota, objectEnv,
  };
}
