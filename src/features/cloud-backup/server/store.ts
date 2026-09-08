import { createHash, randomUUID } from "node:crypto";
import { BackupError, decodeJson, encodeJson, ensure, validateManifest, type BackupManifest } from "../shared/format";
import type { Account } from "../local/control";
import type { CloudBackup } from "../client/api";
import type { SqlConnection, SqlDatabase } from "./sql";

export interface StoredBackup { id: string; account_id: string; library_id: string; manifest_bytes: Uint8Array; manifest_sha256: string; status: CloudBackup["status"]; total_bytes: string; captured_at: Date; completed_at: Date | null; error_code: string | null; manifest_object_version: string | null }
export interface StoredPart { path: string; part_index: number; object_key: string; byte_length: number; sha256: string; object_version: string | null; verified: boolean }
export const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const manifestOf = (backup: StoredBackup): BackupManifest => validateManifest(decodeJson(new Uint8Array(backup.manifest_bytes)));

export class CloudStore {
  constructor(readonly sql: SqlDatabase) {}
  tenant<T>(account: string, work: (sql: SqlConnection) => Promise<T>): Promise<T> {
    return this.sql.transaction(async (sql) => { await sql.query("SELECT set_config('life.account_id',$1,true)", [account]); return work(sql); });
  }
  async limit(key: string, maximum: number, seconds: number) {
    const result = await this.sql.query<{ attempts: number }>(`INSERT INTO life_cloud.auth_limits(key,window_start,attempts) VALUES($1,now(),1)
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN life_cloud.auth_limits.window_start < now()-($2 * interval '1 second') THEN 1 ELSE life_cloud.auth_limits.attempts+1 END,
      window_start=CASE WHEN life_cloud.auth_limits.window_start < now()-($2 * interval '1 second') THEN now() ELSE life_cloud.auth_limits.window_start END RETURNING attempts`, [key, seconds]);
    if (result.rows[0].attempts > maximum) throw new BackupError("rate_limit", "请求较多，请稍后再试。");
  }
  async createSession(subject: string, email: string, tokenHash: string): Promise<Account> {
    return this.sql.transaction(async (sql) => {
      const result = await sql.query<{ id: string; email: string; status: string }>(`INSERT INTO life_cloud.accounts(id,auth_provider,auth_subject,email) VALUES($1,'supabase',$2,$3)
        ON CONFLICT(auth_provider,auth_subject) DO UPDATE SET email=EXCLUDED.email RETURNING id,email,status`, [randomUUID(), subject, email]);
      const account = result.rows[0];
      if (account.status !== "active") throw new BackupError("unauthorized", "账户暂不可用。");
      await sql.query("INSERT INTO life_cloud.sessions(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days')", [randomUUID(), account.id, tokenHash]);
      return { id: account.id, email: account.email };
    });
  }
  async session(tokenHash: string): Promise<Account | null> {
    const result = await this.sql.query<Account>(`SELECT a.id,a.email FROM life_cloud.sessions s JOIN life_cloud.accounts a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND a.status='active'`, [tokenHash]);
    return result.rows[0] ?? null;
  }
  async revoke(tokenHash: string) { await this.sql.query("UPDATE life_cloud.sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL", [tokenHash]); }
  async bind(account: string, library: string, installation: string) {
    await this.tenant(account, async (sql) => {
      const result = await sql.query("SELECT id FROM life_cloud.libraries WHERE account_id=$1 AND id=$2", [account, library]);
      if (result.rows.length) return;
      try { await sql.query("INSERT INTO life_cloud.libraries(id,account_id,installation_id) VALUES($1,$2,$3)", [library, account, installation]); }
      catch { throw new BackupError("binding_mismatch", "此库无法绑定到当前账户。"); }
    });
  }
  async createBackup(account: string, id: string, manifest: BackupManifest, quota: number) {
    const encoded = Buffer.from(encodeJson(manifest));
    const hash = digest(encoded);
    const total = manifest.files.reduce((sum, file) => sum + file.bytes, encoded.byteLength);
    await this.tenant(account, async (sql) => {
      // Account-level row lock makes quota reservation atomic across tabs/devices.
      await sql.query("SELECT id FROM life_cloud.accounts WHERE id=$1 FOR UPDATE", [account]);
      const existing = await sql.query<StoredBackup>("SELECT * FROM life_cloud.backups WHERE account_id=$1 AND id=$2", [account, id]);
      if (existing.rows[0]) { ensure(existing.rows[0].manifest_sha256 === hash, "idempotency_mismatch"); return; }
      const binding = await sql.query("SELECT id FROM life_cloud.libraries WHERE account_id=$1 AND id=$2", [account, manifest.libraryId]);
      if (!binding.rows.length) throw new BackupError("binding_required", "请先绑定本机生活库。");
      const used = await sql.query<{ used: string }>("SELECT COALESCE(SUM(total_bytes),0)::text AS used FROM life_cloud.backups WHERE account_id=$1", [account]);
      if (Number(used.rows[0].used) + total > quota) throw new BackupError("cloud_quota", "云空间不足。已有备份已保留，可使用本地完整导出。");
      await sql.query(`INSERT INTO life_cloud.backups(id,account_id,library_id,manifest_bytes,manifest_sha256,format_version,dexie_version,captured_at,total_bytes,table_counts)
        VALUES($1,$2,$3,$4,$5,1,6,$6,$7,$8)`, [id, account, manifest.libraryId, encoded, hash, manifest.capturedAt, total, JSON.stringify(manifest.counts)]);
      for (const file of manifest.files) {
        await sql.query("INSERT INTO life_cloud.backup_files(account_id,backup_id,path,table_name,byte_length,sha256) VALUES($1,$2,$3,$4,$5,$6)", [account, id, file.path, file.table ?? null, file.bytes, file.sha256]);
        for (const part of file.parts) await sql.query(`INSERT INTO life_cloud.backup_parts(account_id,backup_id,path,part_index,object_key,byte_length,sha256)
          VALUES($1,$2,$3,$4,$5,$6,$7)`, [account, id, file.path, part.index, `${account}/${id}/${randomUUID()}/${part.index}`, part.bytes, part.sha256]);
      }
    });
  }
  async get(account: string, id: string): Promise<StoredBackup> {
    return this.tenant(account, async (sql) => {
      const result = await sql.query<StoredBackup>("SELECT * FROM life_cloud.backups WHERE account_id=$1 AND id=$2", [account, id]);
      if (!result.rows[0]) throw new BackupError("not_found", "找不到此备份。");
      return result.rows[0];
    });
  }
  async list(account: string, before?: string): Promise<CloudBackup[]> {
    return this.tenant(account, async (sql) => {
      const result = await sql.query<StoredBackup & { verified_parts: string; total_parts: string }>(`SELECT b.*,
        (SELECT count(*) FROM life_cloud.backup_parts p WHERE p.account_id=b.account_id AND p.backup_id=b.id AND p.verified)::text AS verified_parts,
        (SELECT count(*) FROM life_cloud.backup_parts p WHERE p.account_id=b.account_id AND p.backup_id=b.id)::text AS total_parts
        FROM life_cloud.backups b WHERE account_id=$1 AND ($2::uuid IS NULL OR (received_at,id)<
          (SELECT received_at,id FROM life_cloud.backups WHERE account_id=$1 AND id=$2))
        ORDER BY received_at DESC,id DESC LIMIT 100`, [account, before ?? null]);
      return result.rows.map((row) => ({ id: row.id, libraryId: row.library_id, capturedAt: new Date(row.captured_at).toISOString(), completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null, status: row.status, totalBytes: Number(row.total_bytes), error: row.error_code, verifiedParts: Number(row.verified_parts), totalParts: Number(row.total_parts) }));
    });
  }
  async latestComplete(account: string, library: string): Promise<string | null> {
    return this.tenant(account, async (sql) => {
      const result = await sql.query<{ captured_at: Date }>("SELECT captured_at FROM life_cloud.backups WHERE account_id=$1 AND library_id=$2 AND status='complete' ORDER BY completed_at DESC,id DESC LIMIT 1", [account, library]);
      return result.rows[0] ? new Date(result.rows[0].captured_at).toISOString() : null;
    });
  }
  async parts(account: string, id: string): Promise<StoredPart[]> {
    await this.get(account, id);
    return this.tenant(account, async (sql) => (await sql.query<StoredPart>("SELECT * FROM life_cloud.backup_parts WHERE account_id=$1 AND backup_id=$2 ORDER BY path,part_index", [account, id])).rows);
  }
  async acknowledgePart(account: string, id: string, path: string, index: number) {
    await this.tenant(account, async (sql) => {
      const backup = await sql.query<StoredBackup>("SELECT * FROM life_cloud.backups WHERE account_id=$1 AND id=$2 FOR UPDATE", [account, id]);
      ensure(backup.rows[0] && ["uploading", "failed"].includes(backup.rows[0].status), "immutable_backup");
      const part = await sql.query<StoredPart>("SELECT * FROM life_cloud.backup_parts WHERE account_id=$1 AND backup_id=$2 AND path=$3 AND part_index=$4", [account, id, path, index]);
      ensure(part.rows[0], "unknown_part");
      if (part.rows[0].verified) return;
      await sql.query("UPDATE life_cloud.backup_parts SET verified=true WHERE account_id=$1 AND backup_id=$2 AND path=$3 AND part_index=$4", [account, id, path, index]);
    });
  }
  async finalize(account: string, id: string) {
    await this.tenant(account, async (sql) => {
      const result = await sql.query<StoredBackup>("SELECT * FROM life_cloud.backups WHERE account_id=$1 AND id=$2 FOR UPDATE", [account, id]);
      ensure(result.rows[0], "not_found");
      if (result.rows[0].status === "complete" || result.rows[0].status === "verifying") return;
      const pending = await sql.query<{ count: string }>("SELECT count(*)::text FROM life_cloud.backup_parts WHERE account_id=$1 AND backup_id=$2 AND NOT verified", [account, id]);
      ensure(pending.rows[0].count === "0", "incomplete_upload");
      await sql.query("UPDATE life_cloud.backups SET status='verifying',error_code=NULL WHERE account_id=$1 AND id=$2", [account, id]);
    });
  }
  async claim(account: string, id: string): Promise<string | null> {
    const token = randomUUID();
    return this.tenant(account, async (sql) => {
      const result = await sql.query(`UPDATE life_cloud.backups SET lease_token=$3,lease_until=now()+interval '3 minutes'
        WHERE account_id=$1 AND id=$2 AND status='verifying' AND (lease_until IS NULL OR lease_until<now()) RETURNING id`, [account, id, token]);
      return result.rows.length ? token : null;
    });
  }
  async release(account: string, id: string, token: string, error?: string) {
    await this.tenant(account, async (sql) => { await sql.query(`UPDATE life_cloud.backups SET lease_token=NULL,lease_until=NULL,
      status=CASE WHEN $4::text IS NULL THEN status ELSE 'failed' END,error_code=$4 WHERE account_id=$1 AND id=$2 AND lease_token=$3 AND status='verifying'`, [account, id, token, error ?? null]); });
  }
  async pendingFiles(account: string, id: string): Promise<string[]> {
    return this.tenant(account, async (sql) => (await sql.query<{ path: string }>("SELECT path FROM life_cloud.backup_files WHERE account_id=$1 AND backup_id=$2 AND NOT verified ORDER BY path", [account, id])).rows.map(({ path }) => path));
  }
  async verifiedFile(account: string, id: string, token: string, path: string) {
    await this.tenant(account, async (sql) => { await sql.query(`UPDATE life_cloud.backup_files SET verified=true WHERE account_id=$1 AND backup_id=$2 AND path=$4
      AND EXISTS(SELECT 1 FROM life_cloud.backups WHERE account_id=$1 AND id=$2 AND lease_token=$3 AND lease_until>now() AND status='verifying')`, [account, id, token, path]); });
  }
  async complete(account: string, id: string, token: string, warnings: string[]) {
    await this.tenant(account, async (sql) => {
      const result = await sql.query(`UPDATE life_cloud.backups SET status='complete',completed_at=now(),lease_token=NULL,lease_until=NULL
        WHERE account_id=$1 AND id=$2 AND lease_token=$3 AND lease_until>now() AND status='verifying'
        AND NOT EXISTS(SELECT 1 FROM life_cloud.backup_files WHERE account_id=$1 AND backup_id=$2 AND NOT verified) RETURNING id`, [account, id, token]);
      ensure(result.rows.length === 1, "verification_lease");
      await sql.query("INSERT INTO life_cloud.backup_verifications(id,account_id,backup_id,kind,validator_version,result) VALUES($1,$2,$3,'upload','16A.1',$4)", [randomUUID(), account, id, JSON.stringify({ filesVerified: true, graphVerified: true, warnings })]);
    });
  }
}
