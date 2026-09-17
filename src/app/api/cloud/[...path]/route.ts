import "server-only";
import { cloudAuthMode, cloudConfigured } from "@/features/cloud-backup/server/config";
import { createCloudHandler } from "@/features/cloud-backup/server/handler";
import { checkedCloudRuntime } from "@/features/cloud-backup/server/runtime";
import { BackupError } from "@/features/cloud-backup/shared/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!cloudConfigured()) {
    if (request.method === "GET" && new URL(request.url).pathname === "/api/cloud/account") {
      let authMode = null;
      try { authMode = cloudAuthMode(); } catch { /* Invalid configuration is reported without secret details. */ }
      return Response.json({ configured: false, authMode, account: null }, { headers: { "Cache-Control": "no-store, private" } });
    }
    return Response.json({ code: "cloud_unconfigured", message: "云服务尚未配置，本地导出和恢复仍可使用。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try { return await createCloudHandler(await checkedCloudRuntime())(request); }
  catch (error) { return Response.json({ code: error instanceof BackupError ? error.code : "cloud_unavailable", message: error instanceof BackupError ? error.message : "云服务暂时不可用，本机记录已保留。" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
export const GET = handle;
export const POST = handle;
