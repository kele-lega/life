import Dexie from "dexie";

import { db } from "@/lib/db/client";

import type { LifeEventSourceRef } from "../model/types";

export const lifeEventSourceKey = (source: LifeEventSourceRef): string =>
  JSON.stringify([source.type, source.id]);

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintLifeEventText(parts: readonly string[]): Promise<string> {
  return `sha256:text-v1:${await sha256Hex(JSON.stringify(parts))}`;
}

/** Read originals in batches in the caller's transaction. Never write to them. */
export async function readLifeEventSourceFingerprints(
  refs: readonly LifeEventSourceRef[],
): Promise<Map<string, string>> {
  const unique = [...new Map(refs.map((ref) => [lifeEventSourceKey(ref), ref])).values()];
  const ids = (type: LifeEventSourceRef["type"]) =>
    unique.filter((ref) => ref.type === type).map((ref) => ref.id);
  const [moments, appends, diaries] = await Promise.all([
    db.moments.bulkGet(ids("moment")),
    db.momentAppends.bulkGet(ids("momentAppend")),
    db.diaries.bulkGet(ids("diary")),
  ]);
  const parents = await db.moments.bulkGet([
    ...new Set(appends.flatMap((append) => append ? [append.momentId] : [])),
  ]);
  const activeParents = new Set(
    parents.filter((parent) => parent?.deletedAt === null).map((parent) => parent!.id),
  );
  const texts: [LifeEventSourceRef, readonly string[]][] = [];
  for (const moment of moments) {
    if (moment?.deletedAt === null) texts.push([{ type: "moment", id: moment.id }, [moment.originalText]]);
  }
  for (const append of appends) {
    if (append?.deletedAt === null && activeParents.has(append.momentId)) {
      texts.push([{ type: "momentAppend", id: append.id }, [append.text]]);
    }
  }
  for (const diary of diaries) {
    if (diary?.deletedAt === null) texts.push([{ type: "diary", id: diary.id }, [diary.title, diary.body]]);
  }

  // WebCrypto is local but asynchronous; keep the IndexedDB snapshot alive.
  return new Map(await Dexie.waitFor(Promise.all(texts.map(async ([ref, parts]): Promise<[string, string]> => [
    lifeEventSourceKey(ref),
    await fingerprintLifeEventText(parts),
  ]))));
}
