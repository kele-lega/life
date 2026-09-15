export interface ReplicaSession {
  accountId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

const KEY = "life-replica-session-v1";

export async function readReplicaSession(): Promise<ReplicaSession | null> {
  try {
    if (typeof localStorage === "undefined") return null;
    const value = localStorage.getItem(KEY);
    return value ? JSON.parse(value) as ReplicaSession : null;
  } catch {
    return null;
  }
}

export async function writeReplicaSession(session: ReplicaSession | null): Promise<void> {
  if (typeof localStorage === "undefined") return;
  if (!session) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(session));
}
