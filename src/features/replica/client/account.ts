import { initializeControl } from "@/features/cloud-backup/local/control";
import { isNativeApp } from "@/lib/runtime/platform";

import { ReplicaError } from "../shared/protocol";
import { readReplicaSession, writeReplicaSession } from "./session";
import { createReplicaTransport, replicaApiOrigin, type ReplicaTransport } from "./transport";

export interface ReplicaRemoteAccount {
  id: string;
  email: string;
}

export async function replicaUserTransport(): Promise<{ accountId: string; transport: ReplicaTransport } | null> {
  if (isNativeApp()) {
    const origin = replicaApiOrigin();
    const session = await readReplicaSession();
    if (!origin || !session?.accessToken) return null;
    return {
      accountId: session.accountId,
      transport: createReplicaTransport({
        origin,
        accountId: session.accountId,
        accessToken: session.accessToken,
        native: true,
      }),
    };
  }
  const { context } = await initializeControl();
  if (!context.account) return null;
  return {
    accountId: context.account.id,
    transport: createReplicaTransport({ origin: "", accountId: context.account.id, native: false }),
  };
}

export async function loadReplicaAccount(): Promise<{ configured: boolean; account: ReplicaRemoteAccount | null }> {
  if (isNativeApp()) {
    const origin = replicaApiOrigin();
    if (!origin) return { configured: false, account: null };
    const session = await readReplicaSession();
    if (!session?.accessToken) return { configured: true, account: null };
    const result = await createReplicaTransport({
      origin,
      accountId: session.accountId,
      accessToken: session.accessToken,
      native: true,
    }).request<{ configured: boolean; account: ReplicaRemoteAccount | null }>("account");
    return { configured: true, account: result.account };
  }
  return { configured: true, account: null };
}

export async function startReplicaLogin(email: string): Promise<void> {
  const origin = replicaApiOrigin();
  if (!origin) throw new ReplicaError("cloud_unconfigured", "云副本主机未配置。本机记录仍可使用。");
  await createReplicaTransport({ origin, native: true }).request("auth/email/start", { email });
}

export async function verifyReplicaLogin(email: string, token: string): Promise<ReplicaRemoteAccount> {
  const origin = replicaApiOrigin();
  if (!origin) throw new ReplicaError("cloud_unconfigured", "云副本主机未配置。本机记录仍可使用。");
  const result = await createReplicaTransport({ origin, native: true }).request<{
    account: ReplicaRemoteAccount;
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
  }>("auth/email/verify", { email, token });
  await writeReplicaSession({
    accountId: result.account.id,
    email: result.account.email,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
  });
  return result.account;
}

export async function loginReplicaPassword(username: string, password: string): Promise<ReplicaRemoteAccount> {
  const origin = replicaApiOrigin();
  if (!origin) throw new ReplicaError("cloud_unconfigured", "云副本主机未配置。本机记录仍可使用。");
  const result = await createReplicaTransport({ origin, native: true }).request<{
    account: ReplicaRemoteAccount;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }>("auth/password", { username, password });
  await writeReplicaSession({
    accountId: result.account.id,
    email: result.account.email,
    accessToken: result.accessToken ?? "",
    refreshToken: result.refreshToken ?? "",
    expiresAt: result.expiresAt,
  });
  return result.account;
}

export async function clearReplicaLogin(): Promise<void> {
  await writeReplicaSession(null);
}
