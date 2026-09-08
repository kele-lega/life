import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ensure } from "../shared/format";
import type { CloudConfig } from "./config";

export interface ObjectStorage {
  uploadUrl(key: string, bytes: number, hash: string): Promise<{ url: string; headers: Record<string, string> }>;
  read(key: string, maximumBytes: number): Promise<Uint8Array>;
  downloadUrl(key: string): Promise<string>;
  putManifest(key: string, bytes: Uint8Array, hash: string): Promise<void>;
}

export function s3Objects(config: CloudConfig): ObjectStorage {
  const client = new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2 });
  const checksum = (hash: string) => Buffer.from(hash, "hex").toString("base64");
  return {
    async uploadUrl(key, bytes, hash) {
      const command = new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentLength: bytes, ContentType: "application/octet-stream", ChecksumSHA256: checksum(hash) });
      return { url: await getSignedUrl(client, command, { expiresIn: 180, unhoistableHeaders: new Set(["x-amz-checksum-sha256"]), signableHeaders: new Set(["content-type"]) }), headers: { "Content-Type": "application/octet-stream", "x-amz-checksum-sha256": checksum(hash) } };
    },
    async read(key, maximumBytes) {
      const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(20_000) });
      ensure(response.Body && response.ContentLength !== undefined && response.ContentLength <= maximumBytes, "object_size");
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        size += chunk.length; ensure(size <= maximumBytes, "object_size"); chunks.push(chunk);
      }
      ensure(size === response.ContentLength, "object_size");
      return Buffer.concat(chunks);
    },
    async downloadUrl(key) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key, ResponseContentType: "application/octet-stream", ResponseContentDisposition: "attachment" }), { expiresIn: 180 });
    },
    async putManifest(key, bytes, hash) {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentType: "application/json", ChecksumSHA256: checksum(hash) }), { abortSignal: AbortSignal.timeout(20_000) });
      // Each backup owns a unique key. Supabase Storage does not expose S3 VersionId;
      // the manifest bytes are checked before the database snapshot becomes complete.
    },
  };
}
