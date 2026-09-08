import { BackupError } from "../shared/format";

export interface CloudConfig {
  databaseUrl: string; authUrl: string; authKey: string; origin: string;
  region: string; bucket: string; accessKeyId: string; secretAccessKey: string;
  endpoint?: string; accountQuotaBytes: number;
}
const names = ["CLOUD_DATABASE_URL", "CLOUD_AUTH_URL", "CLOUD_AUTH_KEY", "CLOUD_APP_ORIGIN", "CLOUD_S3_REGION", "CLOUD_S3_BUCKET", "CLOUD_S3_ACCESS_KEY_ID", "CLOUD_S3_SECRET_ACCESS_KEY", "CLOUD_S3_ENDPOINT"] as const;
export function cloudConfigured(env: NodeJS.ProcessEnv = process.env): boolean { return names.every((name) => !!env[name]?.trim()); }
export function cloudConfig(env: NodeJS.ProcessEnv = process.env): CloudConfig {
  if (!cloudConfigured(env)) throw new BackupError("cloud_unconfigured", "云服务尚未配置。本地导出和恢复仍可使用。");
  const origin = new URL(env.CLOUD_APP_ORIGIN!);
  if (origin.origin !== env.CLOUD_APP_ORIGIN || (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname))) throw new BackupError("cloud_configuration");
  const auth = new URL(env.CLOUD_AUTH_URL!);
  if (auth.protocol !== "https:" || auth.username || auth.password) throw new BackupError("cloud_configuration");
  if (env.CLOUD_S3_ENDPOINT && new URL(env.CLOUD_S3_ENDPOINT).protocol !== "https:") throw new BackupError("cloud_configuration");
  const quota = Number(env.CLOUD_ACCOUNT_QUOTA_BYTES ?? 5 * 1024 * 1024 * 1024);
  if (!Number.isSafeInteger(quota) || quota <= 0) throw new BackupError("cloud_configuration");
  return { databaseUrl: env.CLOUD_DATABASE_URL!, authUrl: auth.origin, authKey: env.CLOUD_AUTH_KEY!, origin: origin.origin, region: env.CLOUD_S3_REGION!, bucket: env.CLOUD_S3_BUCKET!, accessKeyId: env.CLOUD_S3_ACCESS_KEY_ID!, secretAccessKey: env.CLOUD_S3_SECRET_ACCESS_KEY!, endpoint: env.CLOUD_S3_ENDPOINT, accountQuotaBytes: quota };
}
