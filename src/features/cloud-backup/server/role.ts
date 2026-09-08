import { BackupError } from "../shared/format";
import type { SqlDatabase } from "./sql";

export async function assertApplicationRole(sql: SqlDatabase) {
  const result = await sql.query<{ unsafe: boolean }>(`SELECT
    (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user)
    OR pg_has_role('life_cloud_worker','USAGE')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='life_cloud' AND pg_has_role(c.relowner,'USAGE')) AS unsafe`);
  if (result.rows[0]?.unsafe !== false) throw new BackupError("unsafe_database_role", "云数据库角色权限过高，云操作已暂停。请配置独立的受限应用账户。");
  const migration = await sql.query<{ version: number }>("SELECT version FROM life_cloud.schema_migrations WHERE version=3");
  if (!migration.rows.length) throw new BackupError("migration_required", "云数据库尚未完成 Foundation 迁移。");
}
