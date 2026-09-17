import { decodeJson, encodeJson, isHash, sha256 } from "@/features/cloud-backup/shared/format";

export const REPLICA_ENTITIES = [
  "moment",
  "momentAppend",
  "attachment",
  "diary",
  "lifeEvent",
  "lifeExtractionJob",
  "lifeEventProposal",
] as const;
export type ReplicaEntity = (typeof REPLICA_ENTITIES)[number];

export const ENTITY_TABLE = {
  moment: "moments",
  momentAppend: "momentAppends",
  attachment: "attachments",
  diary: "diaries",
  lifeEvent: "lifeEvents",
  lifeExtractionJob: "lifeExtractionJobs",
  lifeEventProposal: "lifeEventProposals",
} as const;

export const REPLICA_SQL_TABLE = {
  moment: "replica_moments",
  momentAppend: "replica_moment_appends",
  attachment: "replica_attachments",
  diary: "replica_diaries",
  lifeEvent: "replica_life_events",
  lifeExtractionJob: "replica_jobs",
  lifeEventProposal: "replica_proposals",
} as const;

export const MAX_REPLICA_BLOB_BYTES = 32 * 1024 * 1024;
export const MAX_REPLICA_MUTATION_BYTES = 4 * 1024 * 1024;
export const BACKFILL_BATCH = 50;

export interface ReplicaOp {
  entity: ReplicaEntity;
  op: "upsert";
  id: string;
  record: Record<string, unknown>;
}

export interface ReplicaMutationPayload {
  mutationId: string;
  createdAt: string;
  ops: ReplicaOp[];
}

export interface ReplicaMutationEnvelope extends ReplicaMutationPayload {
  writerId: string;
  epoch: number;
  payloadSha256: string;
}

export interface ReplicaReceipt {
  mutationId: string;
  commitSeq: number;
  epoch: number;
}

export interface ReplicaCloudStatus {
  counts: Record<ReplicaEntity, number>;
  commitSeq: number;
  lastSyncedAt: string | null;
  writerId: string | null;
  epoch: number;
  blobCount: number;
  blobBytes: number;
}

export class ReplicaError extends Error {
  constructor(public readonly code: string, message = "\u4e91\u7aef\u526f\u672c\u6682\u4e0d\u53ef\u7528\u3002\u672c\u673a\u8bb0\u5f55\u5df2\u4fdd\u7559\u3002") {
    super(message);
    this.name = "ReplicaError";
  }
}

export function ensureReplica(condition: unknown, code: string, message?: string): asserts condition {
  if (!condition) throw new ReplicaError(code, message);
}

export function replicaRecord(value: object): Record<string, unknown> {
  return decodeJson(encodeJson(JSON.parse(JSON.stringify(value)))) as Record<string, unknown>;
}

export function mutationDigestInput(payload: ReplicaMutationPayload): string {
  return encodeJson({
    mutationId: payload.mutationId,
    createdAt: payload.createdAt,
    ops: payload.ops,
  });
}

export function replicaBlobPart(bytes: Uint8Array): BlobPart {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  return sha256(new Blob([replicaBlobPart(bytes)]));
}

export async function mutationPayloadSha256(payload: ReplicaMutationPayload): Promise<string> {
  return hashBytes(new TextEncoder().encode(mutationDigestInput(payload)));
}

export function isReplicaEntity(value: unknown): value is ReplicaEntity {
  return typeof value === "string" && (REPLICA_ENTITIES as readonly string[]).includes(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

export { encodeJson, decodeJson, isHash, sha256 };
