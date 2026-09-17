import { hostedApiOrigin, isNativeApp } from "@/lib/runtime/platform";
import { replicaBlobPart, ReplicaError } from "../shared/protocol";

export interface ReplicaTransport {
  request<T>(path: string, body?: unknown): Promise<T>;
  put(url: string, headers: Record<string, string>, bytes: Uint8Array): Promise<void>;
  download(url: string): Promise<Uint8Array>;
}

export function replicaApiOrigin(): string | null {
  return hostedApiOrigin();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function createReplicaTransport(options: {
  origin?: string | null;
  accountId?: string | null;
  accessToken?: string | null;
  native?: boolean;
  assertCurrent?: () => Promise<void>;
} = {}): ReplicaTransport {
  const origin = options.origin === undefined ? replicaApiOrigin() : options.origin;
  const native = options.native ?? isNativeApp();
  return {
    async request<T>(path: string, body?: unknown): Promise<T> {
      if (origin === null) throw new ReplicaError("cloud_unconfigured", "\u4e91\u526f\u672c\u4e3b\u673a\u672a\u914d\u7f6e\u3002\u672c\u673a\u8bb0\u5f55\u4ecd\u53ef\u4f7f\u7528\u3002");
      const url = `${origin}/api/replica/${path}`;
      if (native) {
        const { CapacitorHttp } = await import("@capacitor/core");
        await options.assertCurrent?.();
        const response = await CapacitorHttp.request({
          url,
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: "https://localhost",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
            ...(options.accountId ? { "X-Life-Account": options.accountId } : {}),
          },
          data: body,
          connectTimeout: 30_000,
          readTimeout: 30_000,
        });
        const result = response.data as { code?: string; message?: string };
        if (response.status < 200 || response.status >= 300) {
          throw new ReplicaError(result?.code ?? "cloud_failure", result?.message ?? "\u4e91\u526f\u672c\u6682\u65f6\u4e0d\u53ef\u7528\u3002\u672c\u673a\u8bb0\u5f55\u5df2\u4fdd\u7559\u3002");
        }
        return result as T;
      }
      await options.assertCurrent?.();
      let response: Response;
      try {
        response = await fetch(url, {
          method: body === undefined ? "GET" : "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
            ...(options.accountId ? { "X-Life-Account": options.accountId } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new ReplicaError("network", "\u7f51\u7edc\u6682\u65f6\u4e0d\u53ef\u7528\u3002\u672c\u673a\u8bb0\u5f55\u5df2\u4fdd\u7559\uff0c\u53ef\u4ee5\u7a0d\u540e\u91cd\u8bd5\u3002");
      }
      const result = await response.json() as { code?: string; message?: string };
      if (!response.ok) throw new ReplicaError(result.code ?? "cloud_failure", result.message ?? "\u4e91\u526f\u672c\u6682\u65f6\u4e0d\u53ef\u7528\u3002\u672c\u673a\u8bb0\u5f55\u5df2\u4fdd\u7559\u3002");
      return result as T;
    },
    async put(url, headers, bytes) {
      if (native) {
        const { CapacitorHttp } = await import("@capacitor/core");
        await options.assertCurrent?.();
        const response = await CapacitorHttp.request({
          url,
          method: "PUT",
          headers,
          data: bytesToBase64(bytes),
          dataType: "file",
          connectTimeout: 120_000,
          readTimeout: 120_000,
        });
        if (response.status < 200 || response.status >= 300) throw new ReplicaError("upload_interrupted", "\u9644\u4ef6\u4e0a\u4f20\u672a\u5b8c\u6210\uff0c\u672c\u673a\u56fe\u7247\u5df2\u4fdd\u7559\u3002");
        return;
      }
      await options.assertCurrent?.();
      let response: Response;
      try {
        response = await fetch(url, { method: "PUT", headers, body: new Blob([replicaBlobPart(bytes)]), credentials: "omit", redirect: "error", signal: AbortSignal.timeout(120_000) });
      } catch {
        throw new ReplicaError("upload_interrupted", "\u9644\u4ef6\u4e0a\u4f20\u4e2d\u65ad\uff0c\u672c\u673a\u56fe\u7247\u5df2\u4fdd\u7559\u3002");
      }
      if (!response.ok) throw new ReplicaError("upload_interrupted", "\u9644\u4ef6\u4e0a\u4f20\u672a\u5b8c\u6210\uff0c\u672c\u673a\u56fe\u7247\u5df2\u4fdd\u7559\u3002");
    },
    async download(url) {
      if (native) {
        const { CapacitorHttp } = await import("@capacitor/core");
        await options.assertCurrent?.();
        const response = await CapacitorHttp.request({
          url,
          method: "GET",
          responseType: "arraybuffer",
          connectTimeout: 120_000,
          readTimeout: 120_000,
        });
        if (response.status < 200 || response.status >= 300) throw new ReplicaError("download_interrupted", "\u9644\u4ef6\u4e0b\u8f7d\u672a\u5b8c\u6210\uff0c\u672c\u673a\u5df2\u6709\u8bb0\u5f55\u4ecd\u53ef\u4f7f\u7528\u3002");
        const data = response.data;
        if (typeof data === "string") {
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        }
        if (data instanceof ArrayBuffer) return new Uint8Array(data);
        throw new ReplicaError("download_interrupted", "\u9644\u4ef6\u4e0b\u8f7d\u672a\u5b8c\u6210\uff0c\u672c\u673a\u5df2\u6709\u8bb0\u5f55\u4ecd\u53ef\u4f7f\u7528\u3002");
      }
      await options.assertCurrent?.();
      let response: Response;
      try {
        response = await fetch(url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(120_000) });
      } catch {
        throw new ReplicaError("download_interrupted", "\u9644\u4ef6\u4e0b\u8f7d\u4e2d\u65ad\uff0c\u672c\u673a\u5df2\u6709\u8bb0\u5f55\u4ecd\u53ef\u4f7f\u7528\u3002");
      }
      if (!response.ok) throw new ReplicaError("download_interrupted", "\u9644\u4ef6\u4e0b\u8f7d\u672a\u5b8c\u6210\uff0c\u672c\u673a\u5df2\u6709\u8bb0\u5f55\u4ecd\u53ef\u4f7f\u7528\u3002");
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
