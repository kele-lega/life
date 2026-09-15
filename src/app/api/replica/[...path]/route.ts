import "server-only";
import { cloudConfigured } from "@/features/cloud-backup/server/config";
import { checkedCloudRuntime } from "@/features/cloud-backup/server/runtime";
import { BackupError } from "@/features/cloud-backup/shared/format";
import { createReplicaHandler } from "@/features/replica/server/handler";
import { ReplicaError } from "@/features/replica/shared/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!cloudConfigured()) {
    return Response.json({ code: "cloud_unconfigured", message: "\u4e91\u670d\u52a1\u5c1a\u672a\u914d\u7f6e\u3002\u672c\u673a\u8bb0\u5f55\u4ecd\u53ef\u4f7f\u7528\u3002" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const cloud = await checkedCloudRuntime();
    const migrated = await cloud.store.sql.query("SELECT version FROM life_cloud.schema_migrations WHERE version=4");
    if (!migrated.rows.length) throw new ReplicaError("migration_required", "\u4e91\u526f\u672c\u8fd8\u672a\u5b8c\u6210\u6570\u636e\u5e93\u8fc1\u79fb\u3002");
    return await createReplicaHandler({
      config: cloud.config,
      accounts: cloud.store,
      store: cloud.replicaStore,
      service: cloud.replicaService,
      auth: cloud.auth,
    })(request);
  } catch (error) {
    const code = error instanceof ReplicaError || error instanceof BackupError ? error.code : "cloud_unavailable";
    return Response.json({ code, message: error instanceof ReplicaError || error instanceof BackupError ? error.message : "\u4e91\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u672c\u673a\u8bb0\u5f55\u5df2\u4fdd\u7559\u3002" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export const GET = handle;
export const POST = handle;
