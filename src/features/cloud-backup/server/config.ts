import { BackupError } from "../shared/format";

export interface CloudConfig {
  databaseUrl: string;
  origin: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  accountQuotaBytes: number;
  objectEnv: "prod" | "staging" | "dev";
  authUrl?: string;
  authKey?: string;
  accounts?: string;
  objectDir?: string;
  objectSigningKey?: string;
}

const required = ["CLOUD_DATABASE_URL", "CLOUD_APP_ORIGIN"] as const;
const s3Names = ["CLOUD_S3_REGION", "CLOUD_S3_BUCKET", "CLOUD_S3_ACCESS_KEY_ID", "CLOUD_S3_SECRET_ACCESS_KEY", "CLOUD_S3_ENDPOINT"] as const;

function filled(value: string | undefined): boolean {
  return !!value?.trim();
}

export function cloudConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!required.every((name) => filled(env[name]))) return false;
  const localAuth = filled(env.CLOUD_ACCOUNTS);
  const supabaseAuth = filled(env.CLOUD_AUTH_URL) && filled(env.CLOUD_AUTH_KEY);
  if (!localAuth && !supabaseAuth) return false;
  const localObjects = filled(env.CLOUD_OBJECT_DIR) && filled(env.CLOUD_OBJECT_SIGNING_KEY);
  const s3 = s3Names.every((name) => filled(env[name]));
  return localObjects || s3;
}

function privateHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
    || hostname === "postgres" || hostname === "minio" || hostname === "life-postgres"
    || hostname.endsWith(".local");
}

export function cloudConfig(env: NodeJS.ProcessEnv = process.env): CloudConfig {
  if (!cloudConfigured(env)) throw new BackupError("cloud_unconfigured", "云服务尚未配置。本地导出和恢复仍可使用。");
  const origin = new URL(env.CLOUD_APP_ORIGIN!);
  if (origin.origin !== env.CLOUD_APP_ORIGIN || (origin.protocol !== "https:" && !privateHostname(origin.hostname))) {
    throw new BackupError("cloud_configuration");
  }
  const quota = Number(env.CLOUD_ACCOUNT_QUOTA_BYTES ?? 5 * 1024 * 1024 * 1024);
  if (!Number.isSafeInteger(quota) || quota <= 0) throw new BackupError("cloud_configuration");
  const objectEnv = env.CLOUD_OBJECT_ENV === "prod" || env.CLOUD_OBJECT_ENV === "staging" ? env.CLOUD_OBJECT_ENV : "dev";
  const localObjects = filled(env.CLOUD_OBJECT_DIR) && filled(env.CLOUD_OBJECT_SIGNING_KEY);
  if (env.CLOUD_AUTH_URL) {
    const auth = new URL(env.CLOUD_AUTH_URL);
    if (auth.protocol !== "https:" || auth.username || auth.password) throw new BackupError("cloud_configuration");
  }
  if (!localObjects && env.CLOUD_S3_ENDPOINT) {
    const endpoint = new URL(env.CLOUD_S3_ENDPOINT);
    if (endpoint.protocol !== "https:" && !privateHostname(endpoint.hostname)) throw new BackupError("cloud_configuration");
  }
  return {
    databaseUrl: env.CLOUD_DATABASE_URL!,
    origin: origin.origin,
    region: env.CLOUD_S3_REGION?.trim() || "us-east-1",
    bucket: env.CLOUD_S3_BUCKET?.trim() || "life",
    accessKeyId: env.CLOUD_S3_ACCESS_KEY_ID?.trim() || "local",
    secretAccessKey: env.CLOUD_S3_SECRET_ACCESS_KEY?.trim() || "local",
    endpoint: env.CLOUD_S3_ENDPOINT,
    accountQuotaBytes: quota,
    objectEnv,
    authUrl: env.CLOUD_AUTH_URL ? new URL(env.CLOUD_AUTH_URL).origin : undefined,
    authKey: env.CLOUD_AUTH_KEY,
    accounts: env.CLOUD_ACCOUNTS,
    objectDir: env.CLOUD_OBJECT_DIR,
    objectSigningKey: env.CLOUD_OBJECT_SIGNING_KEY,
  };
}
