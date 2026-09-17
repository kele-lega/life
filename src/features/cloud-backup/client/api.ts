import { BackupError } from "../shared/format";
import type { Account } from "../local/control";

export interface CloudBackup {
  id: string; libraryId: string; capturedAt: string; completedAt: string | null;
  status: "uploading" | "verifying" | "complete" | "failed";
  totalBytes: number; error: string | null; verifiedParts: number; totalParts: number;
}
export interface CloudAccount { configured: boolean; account: Account | null; authMode?: "supabase" | "test-password" }
export async function cloudApi<T>(path: string, body?: unknown, expectedAccount?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/cloud/${path}`, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(expectedAccount ? { "X-Life-Account": expectedAccount } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  } catch { throw new BackupError("network", "网络暂时不可用。本机记录已保留，可以稍后重试。"); }
  const result = await response.json();
  if (!response.ok) throw new BackupError(result.code ?? "cloud_failure", result.message ?? "云操作未完成，请稍后重试。");
  return result as T;
}
