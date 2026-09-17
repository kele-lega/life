import { afterEach, expect, it } from "vitest";
import { readReplicaSession, replicaSessionGeneration, writeReplicaSession } from "./session";

afterEach(() => localStorage.clear());

it("rejects malformed persisted credentials and accepts legacy provider sessions", async () => {
  for (const value of ["{", "null", "[]", JSON.stringify({ accountId: "A", accessToken: 123 }), JSON.stringify({ accountId: "A", email: "", accessToken: "bad", authMode: "test-password", expiresAt: 1 })]) {
    localStorage.setItem("life-replica-session-v1", value);
    expect(await readReplicaSession()).toBeNull();
  }
  localStorage.setItem("life-replica-session-v1", JSON.stringify({ accountId: "A", email: "a@test", accessToken: "legacy", refreshToken: "refresh" }));
  expect((await readReplicaSession())?.accessToken).toBe("legacy");
});

it("persists validated test session across reread and does not store provider refresh tokens", async () => {
  const session = { accountId: "A", email: "", username: "fixture-user", accessToken: "a".repeat(64), expiresAt: 1_800_000_000, authMode: "test-password" as const };
  expect(await writeReplicaSession({ ...session, refreshToken: "must-not-refresh" })).toBe(true);
  expect(await readReplicaSession()).toEqual(session);
});

it("compares generations before delayed writes and advances on a successful replacement", async () => {
  await writeReplicaSession({ accountId: "A", email: "", accessToken: "old" });
  const generation = replicaSessionGeneration();
  expect(await writeReplicaSession({ accountId: "A", email: "", accessToken: "fresh" }, generation)).toBe(true);
  expect(await writeReplicaSession({ accountId: "A", email: "", accessToken: "late" }, generation)).toBe(false);
  const beforeLogout = replicaSessionGeneration();
  await writeReplicaSession(null);
  expect(await writeReplicaSession({ accountId: "A", email: "", accessToken: "resurrect" }, beforeLogout)).toBe(false);
  expect(await readReplicaSession()).toBeNull();
});
