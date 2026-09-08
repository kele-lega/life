import "server-only";
import { randomBytes } from "node:crypto";
import { BackupError, encodeJson, ensure, LIMITS, object, validateManifest } from "../shared/format";
import { CloudStore, digest, manifestOf } from "./store";
import { BackupService } from "./service";
import type { EmailAuth } from "./auth";
import type { CloudConfig } from "./config";

export interface HandlerDependencies { config: CloudConfig; store: CloudStore; service: BackupService; auth: EmailAuth }
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const json = (value: unknown, status = 200, extra: HeadersInit = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, private", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", ...extra } });

function cookieName(config: CloudConfig) { return config.origin.startsWith("https:") ? "__Host-life_session" : "life_session_local"; }
function readToken(request: Request, config: CloudConfig): string | null {
  const token = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${cookieName(config)}=`))?.slice(cookieName(config).length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function sessionCookie(config: CloudConfig, token: string, clear = false) {
  return `${cookieName(config)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 30 * 86400}${config.origin.startsWith("https:") ? "; Secure" : ""}`;
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new BackupError("invalid_request");
  const reader = request.body?.getReader(); ensure(reader, "invalid_request");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; ensure(size <= LIMITS.manifest + 1024, "request_limit"); chunks.push(value); }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8")); object(value); return value;
  } catch (error) { await reader.cancel().catch(() => {}); if (error instanceof BackupError) throw error; throw new BackupError("invalid_request"); }
}

export function createCloudHandler({ config, store, service, auth }: HandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const path = new URL(request.url).pathname.replace(/^\/api\/cloud\//, "");
      const method = request.method;
      ensure(method === "GET" || method === "POST", "method_not_allowed");
      // A fixed configured origin is the CSRF boundary, not the attacker-controlled Host header.
      if (method === "POST") ensure(request.headers.get("origin") === config.origin && request.headers.get("sec-fetch-site") !== "cross-site", "origin_rejected");
      const body = method === "POST" ? await readBody(request) : {};
      const token = readToken(request, config);
      if (path === "auth/logout" && method === "POST") {
        if (token) await store.revoke(digest(token));
        return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(config, "", true) });
      }
      if (["auth/email/start", "auth/email/verify", "auth/email/callback"].includes(path) && method === "POST") {
        const isCallback = path.endsWith("callback");
        const email = isCallback ? "" : (() => {
          ensure(typeof body.email === "string" && body.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email), "invalid_email");
          return body.email.trim();
        })();
        if (!isCallback) await store.limit(`email:${digest(email.toLowerCase())}:${path}`, path.endsWith("start") ? 5 : 10, 3600);
        await store.limit(`global:${path}`, path.endsWith("start") ? 100 : 200, 60);
        if (path.endsWith("start")) { await auth.start(email); return json({ ok: true }); }
        const verified = path.endsWith("callback")
          ? await (async () => {
            ensure(typeof body.accessToken === "string" && body.accessToken.length >= 100 && body.accessToken.length <= 8192 && !/\s/.test(body.accessToken), "otp_invalid");
            return auth.verifyAccessToken(body.accessToken);
          })()
          : await (async () => {
            ensure(typeof body.token === "string" && /^[0-9]{6,10}$/.test(body.token), "otp_invalid");
            return auth.verify(email, body.token);
          })();
        const nextToken = randomBytes(32).toString("hex");
        const account = await store.createSession(verified.subject, verified.email, digest(nextToken));
        if (token) await store.revoke(digest(token));
        return json({ account }, 200, { "Set-Cookie": sessionCookie(config, nextToken) });
      }
      const account = token ? await store.session(digest(token)) : null;
      if (path === "account" && method === "GET") return json({ configured: true, account });
      if (!account) throw new BackupError("unauthorized", "云会话已过期，请重新登录。本机记录仍可使用。");
      if (request.headers.get("x-life-account") !== account.id) throw new BackupError("account_changed", "云账户已变化，请重新登录后重试。");
      if (path === "libraries/bind" && method === "POST") {
        ensure(uuid(body.libraryId) && uuid(body.installationId), "invalid_request");
        await store.bind(account.id, body.libraryId, body.installationId); return json({ ok: true });
      }
      if (path === "backups" && method === "GET") {
        const params = new URL(request.url).searchParams;
        const before = params.get("before"); const library = params.get("libraryId");
        ensure((before === null || uuid(before)) && (library === null || uuid(library)), "invalid_request");
        const backups = await store.list(account.id, before ?? undefined);
        return json({ backups, nextCursor: backups.length === 100 ? backups.at(-1)!.id : null, latestForLibrary: library ? await store.latestComplete(account.id, library) : null });
      }
      if (path === "backups" && method === "POST") {
        ensure(uuid(body.id)); const manifest = validateManifest(body.manifest); ensure(uuid(manifest.libraryId));
        await store.createBackup(account.id, body.id, manifest, config.accountQuotaBytes);
        return json({ id: body.id, manifestSha256: digest(encodeJson(manifest)) });
      }
      const match = /^backups\/([a-f0-9-]{36})(?:\/(uploads|ack|finalize|downloads|verify))?$/.exec(path);
      ensure(match && uuid(match[1]), "not_found");
      const [, id, action] = match;
      if (!action && method === "GET") {
        const backup = await store.get(account.id, id);
        return json({ id, status: backup.status, completedAt: backup.completed_at, error: backup.error_code, manifest: manifestOf(backup), manifestSha256: backup.manifest_sha256 });
      }
      ensure(method === "POST", "method_not_allowed");
      if (action === "finalize") { await store.finalize(account.id, id); return json({ status: (await store.get(account.id, id)).status }, 202); }
      if (action === "verify") { await service.verifySlice(account.id, id); return json({ status: (await store.get(account.id, id)).status }); }
      ensure(typeof body.path === "string" && body.path.length <= 200 && Number.isSafeInteger(body.index) && Number(body.index) >= 0, "invalid_request");
      if (action === "uploads") return json(await service.upload(account.id, id, body.path, Number(body.index)));
      if (action === "downloads") return json(await service.download(account.id, id, body.path, Number(body.index)));
      if (action === "ack") {
        await service.acknowledge(account.id, id, body.path, Number(body.index)); return json({ ok: true });
      }
      throw new BackupError("not_found");
    } catch (error) {
      const code = error instanceof BackupError ? error.code : "cloud_unavailable";
      const status = code === "unauthorized" ? 401 : ["account_changed", "origin_rejected"].includes(code) ? 403 : code === "not_found" ? 404 : code === "rate_limit" ? 429 : code === "cloud_unavailable" ? 503 : 400;
      return json({ code, message: error instanceof BackupError ? error.message : "云服务暂时不可用，本机记录已保留。请稍后重试。" }, status);
    }
  };
}
