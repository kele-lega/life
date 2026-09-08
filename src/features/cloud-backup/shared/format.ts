/** Portable backup protocol. It deliberately has no database or provider dependency. */
export const TABLE_NAMES = ["moments", "momentAppends", "attachments", "diaries", "lifeEvents", "lifeExtractionJobs", "lifeEventProposals"] as const;
export type TableName = typeof TABLE_NAMES[number];
export type BackupRow = Record<string, unknown> & { id: string };
export type BackupRecords = Record<TableName, BackupRow[]>;
export const FORMAT_VERSION = 1;
export const DEXIE_VERSION = 6;
export const PART_BYTES = 4 * 1024 * 1024;
export const IMAGE_PATH = /^images\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif|svg|avif|heic|bin)$/;
export const LIMITS = { archive: 256 * 1024 * 1024, json: 32 * 1024 * 1024, manifest: 4 * 1024 * 1024, files: 10_000, records: 100_000, part: PART_BYTES } as const;

export interface FilePart { index: number; bytes: number; sha256: string }
export interface BackupFile {
  path: string;
  bytes: number;
  sha256: string;
  parts: FilePart[];
  table?: TableName;
  attachmentId?: string;
  blobType?: string;
}
export interface BackupManifest {
  format: "life-backup";
  version: 1;
  dexieVersion: 6;
  exporterVersion: string;
  libraryId: string;
  capturedAt: string;
  counts: Record<TableName, number>;
  files: BackupFile[];
}
export interface BackupArchive { manifest: BackupManifest; files: Map<string, Blob> }
export class BackupError extends Error {
  constructor(public readonly code: string, message = "备份文件未通过完整性检查，原生活库未改动。") { super(message); this.name = "BackupError"; }
}
export const emptyRecords = (): BackupRecords => ({ moments: [], momentAppends: [], attachments: [], diaries: [], lifeEvents: [], lifeExtractionJobs: [], lifeEventProposals: [] });
export function ensure(condition: unknown, code = "invalid_archive"): asserts condition { if (!condition) throw new BackupError(code); }
export function object(value: unknown): asserts value is Record<string, unknown> { ensure(value !== null && typeof value === "object" && !Array.isArray(value)); }
export function string(value: unknown): asserts value is string { ensure(typeof value === "string"); }
export const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 1024;
export const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function byteArray(value: Uint8Array): Uint8Array<ArrayBuffer> { return new Uint8Array(value); }
export async function sha256(value: Blob | Uint8Array): Promise<string> {
  const data = value instanceof Uint8Array ? byteArray(value) : await value.arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (n) => n.toString(16).padStart(2, "0")).join("");
}

/** Reject unsupported values instead of JSON.stringify silently dropping them. */
export function encodeJson(value: unknown): string {
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): string => {
    ensure(depth <= 64, "json_depth");
    if (item === null || typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") { ensure(Number.isFinite(item)); return Object.is(item, -0) ? "-0" : JSON.stringify(item); }
    ensure(typeof item === "object" && item !== null && !seen.has(item), "unsupported_value");
    ensure(Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null, "unsupported_value");
    seen.add(item);
    const result = Array.isArray(item)
      ? `[${Array.from(item, (child) => visit(child, depth + 1)).join(",")}]`
      : `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${visit((item as Record<string, unknown>)[key], depth + 1)}`).join(",")}}`;
    seen.delete(item);
    return result;
  };
  return visit(value, 0);
}

/** A canonical encoding is part of v1, also rejecting duplicate/ambiguous JSON keys. */
export function decodeJson(input: string | Uint8Array): unknown {
  try {
    // Never let a permissive UTF-8 decoder replace bytes in the user's original text.
    const text = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
    const data: unknown = JSON.parse(text);
    ensure(encodeJson(data) === text, "noncanonical_json");
    return data;
  } catch (error) { if (error instanceof BackupError) throw error; throw new BackupError("invalid_json"); }
}

export function validateManifest(value: unknown): BackupManifest {
  object(value);
  ensure(value.format === "life-backup" && value.version === FORMAT_VERSION && value.dexieVersion === DEXIE_VERSION, "unsupported_version");
  ensure(isId(value.libraryId) && typeof value.exporterVersion === "string" && typeof value.capturedAt === "string" && Number.isFinite(Date.parse(value.capturedAt)));
  object(value.counts);
  ensure(Object.keys(value.counts).length === TABLE_NAMES.length);
  for (const table of TABLE_NAMES) ensure(Number.isSafeInteger(value.counts[table]) && Number(value.counts[table]) >= 0);
  ensure(Object.values(value.counts).reduce<number>((sum, count) => sum + Number(count), 0) <= LIMITS.records, "record_limit");
  ensure(Array.isArray(value.files) && value.files.length <= LIMITS.files);
  const paths = new Set<string>();
  const attachments = new Set<string>();
  const tables = new Set<string>();
  let bytes = 0;
  let jsonBytes = 0;
  for (const file of value.files) {
    object(file);
    ensure(typeof file.path === "string" && !paths.has(file.path));
    paths.add(file.path);
    ensure(Number.isSafeInteger(file.bytes) && Number(file.bytes) >= 0 && isHash(file.sha256));
    bytes += Number(file.bytes);
    if (file.table !== undefined) {
      ensure(TABLE_NAMES.includes(file.table as TableName) && new RegExp(`^records/${file.table}/[0-9]{6}\\.json$`).test(file.path));
      ensure(file.attachmentId === undefined && file.blobType === undefined && Number(file.bytes) <= PART_BYTES);
      tables.add(file.table as string);
      jsonBytes += Number(file.bytes);
    } else {
      ensure(IMAGE_PATH.test(file.path) && isId(file.attachmentId) && !attachments.has(file.attachmentId));
      ensure(typeof file.blobType === "string" && file.blobType.length <= 255);
      attachments.add(file.attachmentId);
    }
    ensure(Array.isArray(file.parts) && file.parts.length === Math.max(1, Math.ceil(Number(file.bytes) / PART_BYTES)));
    let partBytes = 0;
    file.parts.forEach((part, index) => {
      object(part);
      const expected = Math.min(PART_BYTES, Number(file.bytes) - index * PART_BYTES);
      ensure(part.index === index && part.bytes === expected && isHash(part.sha256));
      partBytes += Number(part.bytes);
    });
    ensure(partBytes === file.bytes);
  }
  ensure(bytes <= LIMITS.archive && jsonBytes <= LIMITS.json, "capacity");
  ensure(tables.size === TABLE_NAMES.length && attachments.size === value.counts.attachments);
  ensure(new TextEncoder().encode(encodeJson(value)).byteLength <= LIMITS.manifest, "manifest_limit");
  return value as unknown as BackupManifest;
}

export async function describeFile(path: string, blob: Blob, extra: Pick<BackupFile, "table" | "attachmentId" | "blobType">): Promise<BackupFile> {
  const parts: FilePart[] = [];
  for (let start = 0; start < blob.size || (start === 0 && blob.size === 0); start += PART_BYTES) {
    const part = blob.slice(start, start + PART_BYTES);
    parts.push({ index: parts.length, bytes: part.size, sha256: await sha256(part) });
  }
  return { path, bytes: blob.size, sha256: await sha256(blob), parts, ...extra };
}
