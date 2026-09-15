import { digest } from "@/features/cloud-backup/server/store";
import type { ObjectStorage } from "@/features/cloud-backup/server/objects";
import type { CloudConfig } from "@/features/cloud-backup/server/config";
import { ensureReplica, MAX_REPLICA_BLOB_BYTES } from "../shared/protocol";
import { ReplicaStore } from "./store";

export class ReplicaService {
  constructor(readonly store: ReplicaStore, readonly objects: ObjectStorage, readonly config: CloudConfig) {}

  async upload(account: string, attachmentId: string, sha256: string, byteLength: number) {
    const created = await this.store.createUpload(account, attachmentId, sha256, byteLength, this.config.objectEnv);
    if (created.alreadyVerified) return { verified: true as const, objectKey: created.objectKey };
    return { verified: false as const, objectKey: created.objectKey, ...(await this.objects.uploadUrl(created.objectKey, byteLength, sha256)) };
  }

  async finalize(account: string, objectKey: string, sha256: string, byteLength: number) {
    ensureReplica(objectKey.startsWith(`${this.config.objectEnv}/replica/${account}/`), "invalid_request");
    const metadata = await this.store.objectMetadata(account, objectKey);
    ensureReplica(metadata.sha256 === sha256 && Number(metadata.byte_length) === byteLength, "part_checksum");
    if (!metadata.verified_at) {
      const bytes = await this.objects.read(objectKey, Math.min(byteLength, MAX_REPLICA_BLOB_BYTES));
      ensureReplica(bytes.byteLength === byteLength && digest(bytes) === sha256, "part_checksum");
    }
    await this.store.markObjectVerified(account, objectKey, sha256, byteLength);
    return { verified: true as const, objectKey };
  }

  async download(account: string, attachmentId: string, sha256: string) {
    const object = await this.store.verifiedObject(account, attachmentId, sha256);
    ensureReplica(object, "not_found");
    return { url: await this.objects.downloadUrl(object.object_key), bytes: Number(object.byte_length), sha256 };
  }
}
