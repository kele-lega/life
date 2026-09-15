import type { ReplicaMutationPayload } from "../shared/protocol";

export type ReplicaMutationStatus = "pending" | "acked" | "fenced";
export type ReplicaBlobStatus = "pending" | "verified" | "too_large";

export interface ReplicaMutationRow {
  mutationId: string;
  status: ReplicaMutationStatus;
  payloadSha256: string;
  payload: ReplicaMutationPayload;
  createdAt: string;
  nextRetryAt: string;
  attemptCount: number;
  lastError: string | null;
  ackedCommitSeq: number | null;
}

export interface ReplicaStateRow {
  id: "current";
  writerId: string;
  epoch: number;
  accountId: string | null;
  lastAckedMutationId: string | null;
  lastCommitSeq: number;
  fenced: boolean;
  backfillComplete: boolean;
}

export interface ReplicaBlobRow {
  attachmentId: string;
  sha256: string;
  byteLength: number;
  objectKey: string | null;
  status: ReplicaBlobStatus;
  verifiedAt: string | null;
}
