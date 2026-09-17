import { control, initializeControl } from "@/features/cloud-backup/local/control";
import { isNativeApp } from "@/lib/runtime/platform";

import { ReplicaError } from "../shared/protocol";
import {
  invalidateReplicaSession, readPendingReplicaLogout, readReplicaAuthMode, readReplicaSession,
  rememberReplicaAuthMode, replicaSessionExpiry, replicaSessionGeneration,
  writePendingReplicaLogout, writeReplicaSession, type ReplicaAuthMode, type ReplicaSession,
} from "./session";
import { createReplicaTransport, replicaApiOrigin, type ReplicaTransport } from "./transport";

export interface ReplicaRemoteAccount { id: string; email: string; username?: string }
export interface ReplicaAccountResult { configured: boolean; account: ReplicaRemoteAccount | null; authMode?: ReplicaAuthMode }
export interface ReplicaUserClient {
  accountId: string;
  transport: ReplicaTransport;
  assertCurrent: () => Promise<void>;
}
interface LoginResult {
  account: ReplicaRemoteAccount;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  authMode?: ReplicaAuthMode;
}

let authTail: Promise<unknown> = Promise.resolve();
function serializeAuth<T>(work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => typeof navigator !== "undefined" && navigator.locks
    ? await navigator.locks.request("life-replica-auth", { mode: "exclusive" }, work) : await work();
  const result = authTail.then(run, run);
  authTail = result.catch(() => {});
  return result;
}

function authTransport(session?: ReplicaSession | null) {
  const native = isNativeApp();
  const origin = native ? replicaApiOrigin() : "";
  if (origin === null) throw new ReplicaError("cloud_unconfigured", "云副本主机未配置。本机记录仍可使用。");
  return createReplicaTransport({ origin, native, accountId: session?.accountId, accessToken: session?.accessToken });
}

function changed(): never { throw new ReplicaError("account_changed", "账户或生活库已切换，请重新操作。"); }

/** A captured identity; no request can silently adopt a new account or session. */
export async function replicaUserTransport(): Promise<ReplicaUserClient | null> {
  const initial = await initializeControl();
  const accountId = initial.context.account?.id;
  if (!accountId || initial.context.logoutPending || readPendingReplicaLogout()) return null;
  const native = isNativeApp();
  const origin = native ? replicaApiOrigin() : "";
  if (origin === null) return null;
  const generation = replicaSessionGeneration();
  const session = native ? await readReplicaSession() : null;
  if (native && (!session || session.accountId !== accountId
    || (replicaSessionExpiry(session.expiresAt) ?? Infinity) <= Date.now())) return null;
  const assertCurrent = async () => {
    if (replicaSessionGeneration() !== generation || readPendingReplicaLogout()) changed();
    const current = await initializeControl();
    if (current.context.logoutPending || current.context.account?.id !== accountId
      || current.library.id !== initial.library.id || current.library.databaseName !== initial.library.databaseName
      || current.library.accountId !== initial.library.accountId) changed();
    if (native) {
      const latest = await readReplicaSession();
      if (!latest || latest.accountId !== accountId || latest.accessToken !== session!.accessToken
        || (replicaSessionExpiry(latest.expiresAt) ?? Infinity) <= Date.now()) changed();
    }
  };
  await assertCurrent();
  return {
    accountId, assertCurrent,
    transport: createReplicaTransport({ origin, native, accountId, accessToken: session?.accessToken, assertCurrent }),
  };
}

export async function loadReplicaAccount(): Promise<ReplicaAccountResult> {
  const native = isNativeApp();
  if (native && replicaApiOrigin() === null) return { configured: false, account: null };
  const generation = replicaSessionGeneration();
  const { context } = await initializeControl();
  if (context.logoutPending || readPendingReplicaLogout()) {
    return { configured: true, account: null, authMode: readReplicaAuthMode() };
  }
  const session = native ? await readReplicaSession() : null;
  const result = await authTransport(session).request<ReplicaAccountResult>("account");
  if (replicaSessionGeneration() !== generation || readPendingReplicaLogout()) changed();
  if (native && session && result.account && result.account.id !== session.accountId) changed();
  rememberReplicaAuthMode(result.authMode);
  return result;
}

async function revokePending(): Promise<void> {
  const pending = readPendingReplicaLogout();
  const { context } = await initializeControl();
  if (!pending && !context.logoutPending) return;
  const native = pending?.native ?? isNativeApp();
  // Legacy native Supabase JWTs have no Life server session to revoke. Opaque
  // native sessions and every web cookie do; never strand provider users in a
  // revocation retry that the server cannot perform.
  if (!native || (pending?.accessToken && /^[a-f0-9]{64}$/.test(pending.accessToken))) {
    const origin = native ? replicaApiOrigin() : "";
    if (origin === null) throw new ReplicaError("cloud_unconfigured");
    await createReplicaTransport({ origin, native, accountId: pending?.accountId, accessToken: pending?.accessToken })
      .request("auth/logout", {});
  }
  if (readPendingReplicaLogout()?.id === pending?.id) writePendingReplicaLogout(null);
  await control.transaction("rw", control.settings, async () => {
    const current = await control.settings.get("context");
    if (current?.logoutPending && !readPendingReplicaLogout()) await control.settings.put({ ...current, logoutPending: false });
  });
}

/** Can be retried on reconnect. Serialized with login so an old revoke cannot clear a new cookie. */
export async function retryReplicaLogout(): Promise<void> { return serializeAuth(revokePending); }

export async function startReplicaLogin(email: string): Promise<void> {
  await serializeAuth(async () => {
    await revokePending();
    await authTransport().request("auth/email/start", { email });
  });
}

async function login(path: string, body: unknown): Promise<ReplicaRemoteAccount> {
  const generation = invalidateReplicaSession();
  return serializeAuth(async () => {
    await revokePending();
    if (replicaSessionGeneration() !== generation) changed();
    const result = await authTransport().request<LoginResult>(path, body);
    if (!result.account || typeof result.account.id !== "string" || !result.account.id
      || typeof result.account.email !== "string") throw new ReplicaError("invalid_response");
    if (replicaSessionGeneration() !== generation) {
      // A web login reply may already have installed its HttpOnly cookie. Revoke it
      // before the next queued login, even though its local result was discarded.
      const pending = readPendingReplicaLogout() ?? { id: crypto.randomUUID(), native: isNativeApp() };
      writePendingReplicaLogout({ ...pending, accountId: result.account.id, accessToken: result.accessToken });
      await control.settings.update("context", { logoutPending: true });
      await revokePending();
      changed();
    }
    if (isNativeApp()) {
      if (!result.accessToken || !await writeReplicaSession({
        accountId: result.account.id, email: result.account.email, username: result.account.username,
        accessToken: result.accessToken, refreshToken: result.refreshToken,
        expiresAt: result.expiresAt, authMode: result.authMode,
      }, generation)) changed();
    }
    rememberReplicaAuthMode(result.authMode);
    return result.account;
  });
}

export async function passwordReplicaLogin(username: string, password: string): Promise<ReplicaRemoteAccount> {
  return login("auth/password/login", { username, password });
}

export async function verifyReplicaLogin(email: string, token: string): Promise<ReplicaRemoteAccount> {
  return login("auth/email/verify", { email, token });
}

export async function clearReplicaLogin(): Promise<void> {
  const saved = readReplicaSession();
  const existing = readPendingReplicaLogout();
  invalidateReplicaSession();
  const pending = existing ?? { id: crypto.randomUUID(), native: isNativeApp() };
  writePendingReplicaLogout(pending);
  const session = await saved;
  if (!existing && session) writePendingReplicaLogout({ ...pending, accountId: session.accountId, accessToken: session.accessToken });
  await initializeControl();
  await control.settings.update("context", { logoutPending: true });
  await serializeAuth(revokePending);
}
