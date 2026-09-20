import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensure } from "../shared/format";
import type { CloudConfig } from "./config";
import type { ObjectStorage } from "./objects";

const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,500}$/;

export function objectKeyValid(key: string): boolean {
  return KEY.test(key) && !key.includes("..") && !key.startsWith("/");
}

function sign(secret: string, key: string, exp: string, method: string): string {
  return createHmac("sha256", secret).update(`${method}:${key}:${exp}`).digest("hex");
}

export function signedObjectUrl(config: CloudConfig, key: string, method: "PUT" | "GET", seconds = 180): string {
  ensure(config.objectSigningKey && objectKeyValid(key), "cloud_configuration");
  const exp = String(Math.floor(Date.now() / 1000) + seconds);
  const sig = sign(config.objectSigningKey, key, exp, method);
  return `${config.origin}/api/objects/${key.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}&m=${method}`;
}

export function verifyObjectSignature(config: CloudConfig, key: string, exp: string, sig: string, method: string): boolean {
  if (!config.objectSigningKey || !objectKeyValid(key) || !/^\d{10,12}$/.test(exp) || !/^[a-f0-9]{64}$/.test(sig)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(config.objectSigningKey, key, exp, method), "hex");
  const actual = Buffer.from(sig, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function filePath(root: string, key: string): string {
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(path.resolve(root) + path.sep) && resolved !== path.resolve(root)) {
    throw new Error("object_path");
  }
  return resolved;
}

export function localObjects(config: CloudConfig): ObjectStorage {
  const root = config.objectDir!;
  return {
    async uploadUrl(key, _bytes) {
      return { url: signedObjectUrl(config, key, "PUT"), headers: { "Content-Type": "application/octet-stream" } };
    },
    async downloadUrl(key) {
      return signedObjectUrl(config, key, "GET");
    },
    async read(key, maximumBytes) {
      const bytes = await readFile(filePath(root, key));
      ensure(bytes.byteLength <= maximumBytes, "object_size");
      return bytes;
    },
    async putManifest(key, bytes) {
      const full = filePath(root, key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes);
    },
  };
}

export async function writeSignedObject(root: string, key: string, bytes: Uint8Array): Promise<void> {
  const full = filePath(root, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

export async function readSignedObject(root: string, key: string, maximumBytes: number): Promise<Uint8Array> {
  const bytes = await readFile(filePath(root, key));
  ensure(bytes.byteLength <= maximumBytes, "object_size");
  return bytes;
}
