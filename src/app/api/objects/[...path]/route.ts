import "server-only";
import { cloudConfigured, cloudConfig } from "@/features/cloud-backup/server/config";
import { objectKeyValid, readSignedObject, verifyObjectSignature, writeSignedObject } from "@/features/cloud-backup/server/local-objects";
import { MAX_REPLICA_BLOB_BYTES } from "@/features/replica/shared/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = MAX_REPLICA_BLOB_BYTES;

function objectKey(request: Request): string | null {
  const url = new URL(request.url);
  const prefix = "/api/objects/";
  if (!url.pathname.startsWith(prefix)) return null;
  const key = decodeURIComponent(url.pathname.slice(prefix.length));
  return objectKeyValid(key) ? key : null;
}

async function handle(request: Request) {
  if (!cloudConfigured()) return new Response("not_found", { status: 404 });
  const config = cloudConfig();
  if (!config.objectDir || !config.objectSigningKey) return new Response("not_found", { status: 404 });
  const key = objectKey(request);
  if (!key) return new Response("invalid_request", { status: 400 });
  const url = new URL(request.url);
  const exp = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  const method = url.searchParams.get("m") ?? request.method;
  if (request.method === "PUT") {
    if (method !== "PUT" || !verifyObjectSignature(config, key, exp, sig, "PUT")) return new Response("unauthorized", { status: 401 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return new Response("object_size", { status: 400 });
    await writeSignedObject(config.objectDir, key, bytes);
    return new Response(null, { status: 200 });
  }
  if (request.method === "GET") {
    if (method !== "GET" || !verifyObjectSignature(config, key, exp, sig, "GET")) return new Response("unauthorized", { status: 401 });
    try {
      const bytes = await readSignedObject(config.objectDir, key, MAX_BYTES);
      return new Response(Buffer.from(bytes), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store, private" },
      });
    } catch {
      return new Response("not_found", { status: 404 });
    }
  }
  return new Response("method_not_allowed", { status: 405 });
}

export const GET = handle;
export const PUT = handle;
