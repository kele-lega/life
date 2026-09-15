import "server-only";
import { BackupError, object as assertObject } from "@/features/cloud-backup/shared/format";
import type { EmailAuth } from "@/features/cloud-backup/server/auth";
import type { CloudConfig } from "@/features/cloud-backup/server/config";
import type { CloudStore } from "@/features/cloud-backup/server/store";
import { digest } from "@/features/cloud-backup/server/store";
import {
  ensureReplica,
  isHash,
  isReplicaEntity,
  isUuid,
  MAX_REPLICA_MUTATION_BYTES,
  ReplicaError,
  type ReplicaOp,
} from "../shared/protocol";
import type { ReplicaService } from "./service";
import type { ReplicaStore } from "./store";

export interface ReplicaHandlerDependencies {
  config: CloudConfig;
  accounts: CloudStore;
  store: ReplicaStore;
  service: ReplicaService;
  auth: EmailAuth;
}

const json = (value: unknown, status = 200, extra: HeadersInit = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", ...extra },
});

function cookieName(config: CloudConfig) {
  return config.origin.startsWith("https:") ? "__Host-life_session" : "life_session_local";
}

function readCookieToken(request: Request, config: CloudConfig): string | null {
  const token = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${cookieName(config)}=`))?.slice(cookieName(config).length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function readBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] && match[1].length >= 20 && match[1].length <= 8192 ? match[1] : null;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ReplicaError("invalid_request");
  const reader = request.body?.getReader();
  ensureReplica(reader, "invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      ensureReplica(size <= MAX_REPLICA_MUTATION_BYTES + 1024, "request_limit");
      chunks.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    assertObject(value);
    return value;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof ReplicaError || error instanceof BackupError) throw error;
    throw new ReplicaError("invalid_request");
  }
}

function statusOf(code: string): number {
  if (code === "unauthorized") return 401;
  if (code === "origin_rejected" || code === "account_changed") return 403;
  if (code === "not_found") return 404;
  if (["fenced", "mutation_conflict", "blob_pending", "writer_exists", "original_text_immutable", "created_at_immutable", "proposal_terminal", "writer_unregistered"].includes(code)) return 409;
  if (code === "rate_limit") return 429;
  if (code === "cloud_unavailable" || code === "cloud_unconfigured" || code === "migration_required") return 503;
  return 400;
}

function parseOps(value: unknown): ReplicaOp[] {
  ensureReplica(Array.isArray(value), "invalid_request");
  return value.map((item) => {
    assertObject(item);
    ensureReplica(isReplicaEntity(item.entity) && item.op === "upsert" && typeof item.id === "string", "invalid_request");
    assertObject(item.record);
    return { entity: item.entity, op: "upsert", id: item.id, record: item.record };
  });
}

export function createReplicaHandler({ config, accounts, store, service, auth }: ReplicaHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/api\/replica\//, "");
      const method = request.method;
      ensureReplica(method === "GET" || method === "POST", "method_not_allowed");
      const origin = request.headers.get("origin");
      const native = origin === "https://localhost";
      const bearer = readBearer(request);
      if (method === "POST" && !bearer) {
        const nativeAuth = ["auth/email/start", "auth/email/verify", "auth/email/callback", "auth/refresh"].includes(path);
        if (native || (!origin && nativeAuth && !readCookieToken(request, config))) {
          ensureReplica(nativeAuth, "origin_rejected");
        } else {
          ensureReplica(origin === config.origin && request.headers.get("sec-fetch-site") !== "cross-site", "origin_rejected");
        }
      }
      const body = method === "POST" ? await readBody(request) : {};

      if (["auth/email/start", "auth/email/verify", "auth/email/callback"].includes(path) && method === "POST") {
        const isCallback = path.endsWith("callback");
        const email = isCallback ? "" : (() => {
          ensureReplica(typeof body.email === "string" && body.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email), "invalid_email");
          return body.email.trim();
        })();
        if (!isCallback) await accounts.limit(`replica-email:${digest(email.toLowerCase())}:${path}`, path.endsWith("start") ? 5 : 10, 3600);
        await accounts.limit(`replica-global:${path}`, path.endsWith("start") ? 100 : 200, 60);
        if (path.endsWith("start")) { await auth.start(email); return json({ ok: true }); }
        const verified = isCallback
          ? await (async () => {
            const accessToken = body.accessToken;
            ensureReplica(typeof accessToken === "string" && accessToken.length >= 100 && accessToken.length <= 8192 && !/\s/.test(accessToken), "otp_invalid");
            try {
              const identity = await auth.verifyAccessToken(accessToken);
              return { ...identity, accessToken };
            } catch (error) {
              if (error instanceof ReplicaError) throw error;
              throw new ReplicaError("unauthorized", "\u4e91\u4f1a\u8bdd\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002\u672c\u673a\u8bb0\u5f55\u4ecd\u53ef\u4f7f\u7528\u3002");
            }
          })()
          : await (async () => {
            ensureReplica(typeof body.token === "string" && /^[0-9]{6,10}$/.test(body.token), "otp_invalid");
            return auth.verify(email, body.token);
          })();
        const account = await accounts.ensureAccount(verified.subject, verified.email);
        return json({
          account,
          accessToken: verified.accessToken,
          refreshToken: verified.refreshToken,
          expiresAt: verified.expiresAt,
        });
      }

      if (path === "auth/refresh" && method === "POST") {
        ensureReplica(typeof body.refreshToken === "string" && body.refreshToken.length >= 20 && body.refreshToken.length <= 8192, "otp_invalid");
        const verified = await auth.refresh(body.refreshToken);
        const account = await accounts.ensureAccount(verified.subject, verified.email);
        return json({ account, accessToken: verified.accessToken, refreshToken: verified.refreshToken, expiresAt: verified.expiresAt });
      }

      const cookieToken = bearer ? null : readCookieToken(request, config);
      const account = bearer
        ? await (async () => {
          try {
            const identity = await auth.verifyAccessToken(bearer);
            return accounts.ensureAccount(identity.subject, identity.email);
          } catch (error) {
            if (error instanceof ReplicaError) throw error;
            throw new ReplicaError("unauthorized", "\u4e91\u4f1a\u8bdd\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002\u672c\u673a\u8bb0\u5f55\u4ecd\u53ef\u4f7f\u7528\u3002");
          }
        })()
        : cookieToken ? await accounts.session(digest(cookieToken)) : null;

      if (path === "account" && method === "GET") return json({ configured: true, account });
      if (!account) throw new ReplicaError("unauthorized", "\u4e91\u4f1a\u8bdd\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002\u672c\u673a\u8bb0\u5f55\u4ecd\u53ef\u4f7f\u7528\u3002");
      const claimed = request.headers.get("x-life-account");
      if (claimed && claimed !== account.id) throw new ReplicaError("account_changed", "\u4e91\u8d26\u6237\u5df2\u53d8\u5316\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u540e\u91cd\u8bd5\u3002");
      if (!bearer && claimed !== account.id) throw new ReplicaError("account_changed", "\u4e91\u8d26\u6237\u5df2\u53d8\u5316\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u540e\u91cd\u8bd5\u3002");

      if (path === "writers/register" && method === "POST") {
        ensureReplica(isUuid(body.writerId), "invalid_request");
        const libraryId = body.libraryId === undefined || body.libraryId === null ? null : body.libraryId;
        const installationId = body.installationId === undefined || body.installationId === null ? null : body.installationId;
        ensureReplica(libraryId === null || isUuid(libraryId), "invalid_request");
        ensureReplica(installationId === null || isUuid(installationId), "invalid_request");
        return json(await store.registerWriter(account.id, body.writerId, libraryId, installationId));
      }
      if (path === "writers/promote" && method === "POST") {
        ensureReplica(isUuid(body.writerId), "invalid_request");
        const libraryId = body.libraryId === undefined || body.libraryId === null ? null : body.libraryId;
        const installationId = body.installationId === undefined || body.installationId === null ? null : body.installationId;
        ensureReplica(libraryId === null || isUuid(libraryId), "invalid_request");
        ensureReplica(installationId === null || isUuid(installationId), "invalid_request");
        return json(await store.promoteWriter(account.id, body.writerId, libraryId, installationId));
      }
      if (path === "mutations" && method === "POST") {
        ensureReplica(isUuid(body.writerId) && isUuid(body.mutationId) && Number.isInteger(body.epoch), "invalid_request");
        ensureReplica(typeof body.createdAt === "string" && typeof body.payloadSha256 === "string", "invalid_request");
        const ops = parseOps(body.ops);
        const receipt = await store.applyMutation(account.id, body.writerId, Number(body.epoch), body.mutationId, body.createdAt, ops);
        return json(receipt);
      }
      if (path === "attachments/uploads" && method === "POST") {
        ensureReplica(typeof body.attachmentId === "string" && isHash(body.sha256) && Number.isSafeInteger(body.byteLength), "invalid_request");
        return json(await service.upload(account.id, body.attachmentId, body.sha256, Number(body.byteLength)));
      }
      if (path === "attachments/finalize" && method === "POST") {
        ensureReplica(typeof body.objectKey === "string" && isHash(body.sha256) && Number.isSafeInteger(body.byteLength), "invalid_request");
        return json(await service.finalize(account.id, body.objectKey, body.sha256, Number(body.byteLength)));
      }
      if (path === "attachments/downloads" && method === "POST") {
        ensureReplica(typeof body.attachmentId === "string" && isHash(body.sha256), "invalid_request");
        return json(await service.download(account.id, body.attachmentId, body.sha256));
      }
      if (path === "snapshot" && method === "GET") return json(await store.snapshot(account.id));
      throw new ReplicaError("not_found");
    } catch (error) {
      const code = error instanceof ReplicaError || error instanceof BackupError ? error.code : "cloud_unavailable";
      return json({ code, message: error instanceof ReplicaError || error instanceof BackupError ? error.message : "\u4e91\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u672c\u673a\u8bb0\u5f55\u5df2\u4fdd\u7559\u3002" }, statusOf(code));
    }
  };
}
