export type ReplicaAuthMode = "supabase" | "test-password";

export interface ReplicaSession {
  accountId: string;
  email: string;
  username?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  authMode?: ReplicaAuthMode;
}

const KEY = "life-replica-session-v1";
const GENERATION_KEY = "life-replica-session-generation-v1";
const LOGOUT_KEY = "life-replica-logout-v1";
const MODE_KEY = "life-replica-auth-mode-v1";
let memoryGeneration = "initial";

export interface PendingReplicaLogout {
  id: string;
  native: boolean;
  accountId?: string;
  // Revocation only: this token is never returned by readReplicaSession.
  accessToken?: string;
}

export function replicaSessionExpiry(expiresAt?: number): number | null {
  return expiresAt === undefined ? null : expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
}

export function validateReplicaSession(value: unknown): ReplicaSession | null {
  if (!value || typeof value !== "object") return null;
  const session = value as ReplicaSession;
  if (typeof session.accountId !== "string" || !session.accountId || typeof session.email !== "string"
    || typeof session.accessToken !== "string" || !session.accessToken
    || (session.username !== undefined && typeof session.username !== "string")
    || (session.refreshToken !== undefined && typeof session.refreshToken !== "string")
    || (session.expiresAt !== undefined && (!Number.isFinite(session.expiresAt) || session.expiresAt <= 0))
    || (session.authMode !== undefined && session.authMode !== "supabase" && session.authMode !== "test-password")) return null;
  if (session.authMode === "test-password" && (!/^[a-f0-9]{64}$/.test(session.accessToken) || session.expiresAt === undefined)) return null;
  return {
    accountId: session.accountId, email: session.email, accessToken: session.accessToken,
    ...(session.username === undefined ? {} : { username: session.username }),
    ...(session.expiresAt === undefined ? {} : { expiresAt: session.expiresAt }),
    ...(session.authMode === undefined ? {} : { authMode: session.authMode }),
    ...(session.authMode === "test-password" || session.refreshToken === undefined ? {} : { refreshToken: session.refreshToken }),
  };
}

export function replicaSessionGeneration(): string {
  try { return localStorage.getItem(GENERATION_KEY) ?? memoryGeneration; } catch { return memoryGeneration; }
}

/** Invalidate in-flight login/refresh operations synchronously, including other tabs. */
export function invalidateReplicaSession(): string {
  memoryGeneration = crypto.randomUUID();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(GENERATION_KEY, memoryGeneration);
    localStorage.removeItem(KEY);
  }
  return memoryGeneration;
}

export function readPendingReplicaLogout(): PendingReplicaLogout | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LOGOUT_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const row = value as PendingReplicaLogout;
    return typeof row.id === "string" && typeof row.native === "boolean"
      && (row.accountId === undefined || typeof row.accountId === "string")
      && (row.accessToken === undefined || typeof row.accessToken === "string") ? row : null;
  } catch { return null; }
}

export function writePendingReplicaLogout(value: PendingReplicaLogout | null): void {
  if (typeof localStorage === "undefined") return;
  if (value) localStorage.setItem(LOGOUT_KEY, JSON.stringify(value));
  else localStorage.removeItem(LOGOUT_KEY);
}

export function rememberReplicaAuthMode(mode?: ReplicaAuthMode): void {
  if (mode && typeof localStorage !== "undefined") localStorage.setItem(MODE_KEY, mode);
}

export function readReplicaAuthMode(): ReplicaAuthMode | undefined {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === "test-password" || value === "supabase" ? value : undefined;
  } catch { return undefined; }
}

export async function readReplicaSession(): Promise<ReplicaSession | null> {
  try {
    if (typeof localStorage === "undefined" || readPendingReplicaLogout()) return null;
    return validateReplicaSession(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch { return null; }
}

/** expectedGeneration is a compare-and-set for delayed provider/login replies. */
export async function writeReplicaSession(session: ReplicaSession | null, expectedGeneration?: string): Promise<boolean> {
  if (expectedGeneration !== undefined && replicaSessionGeneration() !== expectedGeneration) return false;
  if (typeof localStorage === "undefined") return false;
  const validated = session ? validateReplicaSession(session) : null;
  if (session && (!validated || readPendingReplicaLogout())) return false;
  invalidateReplicaSession();
  if (validated) {
    localStorage.setItem(KEY, JSON.stringify(validated));
    rememberReplicaAuthMode(validated.authMode);
  } else localStorage.removeItem(KEY);
  return true;
}
