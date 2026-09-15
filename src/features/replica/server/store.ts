import { randomUUID } from "node:crypto";
import { digest } from "@/features/cloud-backup/server/store";
import type { SqlConnection, SqlDatabase } from "@/features/cloud-backup/server/sql";
import {
  encodeJson,
  ensureReplica,
  isHash,
  isReplicaEntity,
  isUuid,
  MAX_REPLICA_BLOB_BYTES,
  mutationDigestInput,
  REPLICA_SQL_TABLE,
  ReplicaError,
  type ReplicaEntity,
  type ReplicaOp,
  type ReplicaReceipt,
} from "../shared/protocol";

const TERMINAL_PROPOSAL = new Set(["accepted", "corrected", "rejected", "superseded"]);

export interface ReplicaWriterInfo {
  writerId: string;
  epoch: number;
  fenced: boolean;
  headCommitSeq: number;
}

export class ReplicaStore {
  constructor(readonly sql: SqlDatabase) {}

  tenant<T>(account: string, work: (sql: SqlConnection) => Promise<T>): Promise<T> {
    return this.sql.transaction(async (sql) => {
      await sql.query("SELECT set_config('life.account_id',$1,true)", [account]);
      return work(sql);
    });
  }

  async registerWriter(account: string, writerId: string, libraryId: string | null, installationId: string | null): Promise<ReplicaWriterInfo> {
    ensureReplica(isUuid(writerId), "invalid_request");
    return this.tenant(account, async (sql) => {
      await sql.query("SELECT id FROM life_cloud.accounts WHERE id=$1 FOR UPDATE", [account]);
      const state = await sql.query<{ writer_id: string; epoch: number; head_commit_seq: string }>(
        "SELECT writer_id, epoch, head_commit_seq FROM life_cloud.replica_state WHERE account_id=$1 FOR UPDATE",
        [account],
      );
      if (!state.rows[0]) {
        await sql.query(
          "INSERT INTO life_cloud.replica_writers(id,account_id,library_id,installation_id,epoch) VALUES($1,$2,$3,$4,1)",
          [writerId, account, libraryId, installationId],
        );
        await sql.query(
          "INSERT INTO life_cloud.replica_state(account_id,writer_id,epoch,head_commit_seq) VALUES($1,$2,1,0)",
          [account, writerId],
        );
        return { writerId, epoch: 1, fenced: false, headCommitSeq: 0 };
      }
      const current = state.rows[0];
      if (current.writer_id === writerId) {
        const writer = await sql.query<{ fenced_at: Date | null }>(
          "SELECT fenced_at FROM life_cloud.replica_writers WHERE account_id=$1 AND id=$2",
          [account, writerId],
        );
        ensureReplica(!writer.rows[0]?.fenced_at, "fenced", "\u6b64\u8bbe\u5907\u5df2\u4e0d\u518d\u662f\u4e91\u526f\u672c\u5199\u8005\u3002\u672c\u673a\u8bb0\u5f55\u4ecd\u53ef\u67e5\u770b\u3002");
        return { writerId, epoch: Number(current.epoch), fenced: false, headCommitSeq: Number(current.head_commit_seq) };
      }
      throw new ReplicaError("writer_exists", "\u4e91\u526f\u672c\u5df2\u6709\u5176\u4ed6\u5199\u8005\u3002\u8bf7\u5728\u65b0\u8bbe\u5907\u4e0a\u4f7f\u7528\u707e\u96be\u6062\u590d\uff0c\u800c\u4e0d\u8981\u5e76\u884c\u63a8\u9001\u3002");
    });
  }

  async promoteWriter(account: string, writerId: string, libraryId: string | null, installationId: string | null): Promise<ReplicaWriterInfo> {
    ensureReplica(isUuid(writerId), "invalid_request");
    return this.tenant(account, async (sql) => {
      await sql.query("SELECT id FROM life_cloud.accounts WHERE id=$1 FOR UPDATE", [account]);
      const state = await sql.query<{ writer_id: string; epoch: number; head_commit_seq: string }>(
        "SELECT writer_id, epoch, head_commit_seq FROM life_cloud.replica_state WHERE account_id=$1 FOR UPDATE",
        [account],
      );
      if (!state.rows[0]) {
        await sql.query(
          "INSERT INTO life_cloud.replica_writers(id,account_id,library_id,installation_id,epoch) VALUES($1,$2,$3,$4,1)",
          [writerId, account, libraryId, installationId],
        );
        await sql.query(
          "INSERT INTO life_cloud.replica_state(account_id,writer_id,epoch,head_commit_seq) VALUES($1,$2,1,0)",
          [account, writerId],
        );
        return { writerId, epoch: 1, fenced: false, headCommitSeq: 0 };
      }
      const current = state.rows[0];
      if (current.writer_id === writerId) {
        return { writerId, epoch: Number(current.epoch), fenced: false, headCommitSeq: Number(current.head_commit_seq) };
      }
      const nextEpoch = Number(current.epoch) + 1;
      await sql.query("UPDATE life_cloud.replica_writers SET fenced_at=now() WHERE account_id=$1 AND id=$2 AND fenced_at IS NULL", [account, current.writer_id]);
      await sql.query(
        "INSERT INTO life_cloud.replica_writers(id,account_id,library_id,installation_id,epoch) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET epoch=EXCLUDED.epoch, fenced_at=NULL, library_id=EXCLUDED.library_id, installation_id=EXCLUDED.installation_id",
        [writerId, account, libraryId, installationId, nextEpoch],
      );
      await sql.query(
        "UPDATE life_cloud.replica_state SET writer_id=$2, epoch=$3, updated_at=now() WHERE account_id=$1",
        [account, writerId, nextEpoch],
      );
      return { writerId, epoch: nextEpoch, fenced: false, headCommitSeq: Number(current.head_commit_seq) };
    });
  }

  async createUpload(account: string, attachmentId: string, sha256: string, byteLength: number, objectEnv: string) {
    ensureReplica(typeof attachmentId === "string" && attachmentId.length > 0 && attachmentId.length <= 1024, "invalid_request");
    ensureReplica(isHash(sha256), "invalid_request");
    ensureReplica(Number.isSafeInteger(byteLength) && byteLength >= 0 && byteLength <= MAX_REPLICA_BLOB_BYTES, "invalid_request");
    const objectKey = `${objectEnv}/replica/${account}/${attachmentId}/${randomUUID()}`;
    return this.tenant(account, async (sql) => {
      const verified = await sql.query<{ object_key: string }>(
        "SELECT object_key FROM life_cloud.replica_objects WHERE account_id=$1 AND attachment_id=$2 AND sha256=$3 AND verified_at IS NOT NULL LIMIT 1",
        [account, attachmentId, sha256],
      );
      if (verified.rows[0]) return { objectKey: verified.rows[0].object_key, alreadyVerified: true as const };
      await sql.query(
        "INSERT INTO life_cloud.replica_objects(account_id,object_key,attachment_id,sha256,byte_length) VALUES($1,$2,$3,$4,$5)",
        [account, objectKey, attachmentId, sha256, byteLength],
      );
      return { objectKey, alreadyVerified: false as const, byteLength, sha256 };
    });
  }

  async objectMetadata(account: string, objectKey: string) {
    return this.tenant(account, async (sql) => {
      const row = await sql.query<{ attachment_id: string; sha256: string; byte_length: string; verified_at: Date | null }>(
        "SELECT attachment_id, sha256, byte_length, verified_at FROM life_cloud.replica_objects WHERE account_id=$1 AND object_key=$2",
        [account, objectKey],
      );
      ensureReplica(row.rows[0], "not_found");
      return row.rows[0];
    });
  }

  async markObjectVerified(account: string, objectKey: string, sha256: string, byteLength: number) {
    return this.tenant(account, async (sql) => {
      const row = await sql.query<{ attachment_id: string; sha256: string; byte_length: string; verified_at: Date | null }>(
        "SELECT attachment_id, sha256, byte_length, verified_at FROM life_cloud.replica_objects WHERE account_id=$1 AND object_key=$2 FOR UPDATE",
        [account, objectKey],
      );
      ensureReplica(row.rows[0], "not_found");
      const object = row.rows[0];
      ensureReplica(object.sha256 === sha256 && Number(object.byte_length) === byteLength, "part_checksum");
      if (object.verified_at) return { attachmentId: object.attachment_id, verified: true as const };
      await sql.query("UPDATE life_cloud.replica_objects SET verified_at=now() WHERE account_id=$1 AND object_key=$2 AND verified_at IS NULL", [account, objectKey]);
      return { attachmentId: object.attachment_id, verified: true as const };
    });
  }

  async verifiedObject(account: string, attachmentId: string, sha256: string) {
    return this.tenant(account, async (sql) => {
      const row = await sql.query<{ object_key: string; byte_length: string }>(
        "SELECT object_key, byte_length FROM life_cloud.replica_objects WHERE account_id=$1 AND attachment_id=$2 AND sha256=$3 AND verified_at IS NOT NULL LIMIT 1",
        [account, attachmentId, sha256],
      );
      return row.rows[0] ?? null;
    });
  }

  async applyMutation(account: string, writerId: string, epoch: number, mutationId: string, createdAt: string, ops: ReplicaOp[]): Promise<ReplicaReceipt> {
    ensureReplica(isUuid(writerId) && isUuid(mutationId), "invalid_request");
    ensureReplica(Number.isInteger(epoch) && epoch >= 1, "invalid_request");
    ensureReplica(typeof createdAt === "string" && Number.isFinite(Date.parse(createdAt)), "invalid_request");
    ensureReplica(Array.isArray(ops) && ops.length > 0 && ops.length <= 200, "invalid_request");
    const payloadSha256 = digest(mutationDigestInput({ mutationId, createdAt, ops }));
    return this.tenant(account, async (sql) => {
      const state = await sql.query<{ writer_id: string; epoch: number; head_commit_seq: string }>(
        "SELECT writer_id, epoch, head_commit_seq FROM life_cloud.replica_state WHERE account_id=$1 FOR UPDATE",
        [account],
      );
      ensureReplica(state.rows[0], "writer_unregistered", "\u5c1a\u672a\u6ce8\u518c\u4e91\u526f\u672c\u5199\u8005\u3002");
      const current = state.rows[0];
      if (current.writer_id !== writerId || Number(current.epoch) !== epoch) {
        throw new ReplicaError("fenced", "\u6b64\u8bbe\u5907\u5df2\u4e0d\u518d\u662f\u4e91\u526f\u672c\u5199\u8005\u3002\u672c\u673a\u8bb0\u5f55\u4ecd\u53ef\u67e5\u770b\u3002");
      }
      const existing = await sql.query<{ payload_sha256: string; commit_seq: string; epoch: number }>(
        "SELECT payload_sha256, commit_seq, epoch FROM life_cloud.replica_mutations WHERE account_id=$1 AND mutation_id=$2",
        [account, mutationId],
      );
      if (existing.rows[0]) {
        ensureReplica(existing.rows[0].payload_sha256 === payloadSha256, "mutation_conflict", "\u76f8\u540c mutation \u4e0d\u80fd\u643a\u5e26\u4e0d\u540c\u5185\u5bb9\u3002");
        return { mutationId, commitSeq: Number(existing.rows[0].commit_seq), epoch: Number(existing.rows[0].epoch) };
      }
      for (const op of ops) await this.applyOp(sql, account, op);
      const commitSeq = Number(current.head_commit_seq) + 1;
      await sql.query(
        "INSERT INTO life_cloud.replica_mutations(account_id,mutation_id,writer_id,epoch,payload_sha256,payload,commit_seq) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",
        [account, mutationId, writerId, epoch, payloadSha256, encodeJson({ mutationId, createdAt, ops }), commitSeq],
      );
      await sql.query("UPDATE life_cloud.replica_state SET head_commit_seq=$2, updated_at=now() WHERE account_id=$1", [account, commitSeq]);
      return { mutationId, commitSeq, epoch };
    });
  }

  async snapshot(account: string) {
    return this.tenant(account, async (sql) => {
      const state = await sql.query<{ writer_id: string; epoch: number; head_commit_seq: string }>(
        "SELECT writer_id, epoch, head_commit_seq FROM life_cloud.replica_state WHERE account_id=$1",
        [account],
      );
      ensureReplica(state.rows[0], "not_found");
      const records: Record<ReplicaEntity, Record<string, unknown>[]> = {
        moment: [],
        momentAppend: [],
        attachment: [],
        diary: [],
        lifeEvent: [],
        lifeExtractionJob: [],
        lifeEventProposal: [],
      };
      for (const entity of Object.keys(REPLICA_SQL_TABLE) as ReplicaEntity[]) {
        const table = REPLICA_SQL_TABLE[entity];
        const rows = await sql.query<{ id: string; record: Record<string, unknown> }>(`SELECT id, record FROM life_cloud.${table} WHERE account_id=$1 ORDER BY id`, [account]);
        records[entity] = rows.rows.map((row) => row.record);
      }
      const objects = await sql.query<{ attachment_id: string; sha256: string; byte_length: string; object_key: string }>(
        "SELECT attachment_id, sha256, byte_length, object_key FROM life_cloud.replica_objects WHERE account_id=$1 AND verified_at IS NOT NULL ORDER BY attachment_id, sha256",
        [account],
      );
      return {
        writerId: state.rows[0].writer_id,
        epoch: Number(state.rows[0].epoch),
        commitSeq: Number(state.rows[0].head_commit_seq),
        records,
        objects: objects.rows.map((row) => ({
          attachmentId: row.attachment_id,
          sha256: row.sha256,
          byteLength: Number(row.byte_length),
          objectKey: row.object_key,
        })),
      };
    });
  }

  private async applyOp(sql: SqlConnection, account: string, op: ReplicaOp): Promise<void> {
    ensureReplica(isReplicaEntity(op.entity) && op.op === "upsert", "invalid_request");
    ensureReplica(typeof op.id === "string" && op.id.length > 0 && op.id.length <= 1024, "invalid_request");
    ensureReplica(op.record !== null && typeof op.record === "object" && !Array.isArray(op.record), "invalid_request");
    ensureReplica(op.record.id === op.id, "invalid_request");
    const table = REPLICA_SQL_TABLE[op.entity];
    const existing = await sql.query<{ record: Record<string, unknown> }>(`SELECT record FROM life_cloud.${table} WHERE account_id=$1 AND id=$2`, [account, op.id]);
    const current = existing.rows[0]?.record ?? null;
    this.assertInvariants(op, current);
    if (op.entity === "attachment") await this.assertVerifiedBlob(sql, account, op, current);
    const updatedAt = typeof op.record.updatedAt === "string" ? op.record.updatedAt : new Date().toISOString();
    const encoded = encodeJson(op.record);
    if (op.entity === "lifeExtractionJob" || op.entity === "lifeEventProposal") {
      await sql.query(
        `INSERT INTO life_cloud.${table}(account_id,id,record,updated_at) VALUES($1,$2,$3::jsonb,$4)
         ON CONFLICT (account_id,id) DO UPDATE SET record=EXCLUDED.record, updated_at=EXCLUDED.updated_at`,
        [account, op.id, encoded, updatedAt],
      );
      return;
    }
    const deletedAt = op.record.deletedAt === null || op.record.deletedAt === undefined ? null : String(op.record.deletedAt);
    await sql.query(
      `INSERT INTO life_cloud.${table}(account_id,id,record,updated_at,deleted_at) VALUES($1,$2,$3::jsonb,$4,$5)
       ON CONFLICT (account_id,id) DO UPDATE SET record=EXCLUDED.record, updated_at=EXCLUDED.updated_at, deleted_at=EXCLUDED.deleted_at`,
      [account, op.id, encoded, updatedAt, deletedAt],
    );
  }

  private assertInvariants(op: ReplicaOp, current: Record<string, unknown> | null) {
    if (op.entity === "moment" && current) {
      ensureReplica(current.originalText === op.record.originalText, "original_text_immutable", "\u968f\u7b14\u539f\u6587\u4e0d\u53ef\u4fee\u6539\u3002");
      ensureReplica(current.createdAt === op.record.createdAt, "created_at_immutable");
    }
    if (op.entity === "lifeEventProposal" && current) {
      const previous = String(current.status ?? "");
      const next = String(op.record.status ?? "");
      if (TERMINAL_PROPOSAL.has(previous) && previous !== next) {
        throw new ReplicaError("proposal_terminal", "\u5ba1\u6838\u7ed3\u679c\u4e0d\u80fd\u56de\u9000\u3002");
      }
    }
  }

  private async assertVerifiedBlob(sql: SqlConnection, account: string, op: ReplicaOp, current: Record<string, unknown> | null) {
    const sha256 = op.record.sha256;
    ensureReplica(isHash(sha256), "invalid_request");
    if (current && current.sha256 === sha256) return;
    const verified = await sql.query(
      "SELECT object_key FROM life_cloud.replica_objects WHERE account_id=$1 AND attachment_id=$2 AND sha256=$3 AND verified_at IS NOT NULL LIMIT 1",
      [account, op.id, sha256],
    );
    ensureReplica(verified.rows[0], "blob_pending", "\u9644\u4ef6\u5c1a\u672a\u5b8c\u6210 SHA-256 \u6821\u9a8c\u3002");
  }
}
