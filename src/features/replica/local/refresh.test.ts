import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { control, initializeControl, setLocalAccount } from "@/features/cloud-backup/local/control";
import { readReplicaSession, writeReplicaSession } from "../client/session";
import { refreshIfNeeded } from "./push";

const native = vi.hoisted(() => vi.fn(() => true));
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/runtime/platform", () => ({ isNativeApp: () => native(), hostedApiOrigin: () => "https://life.example" }));
vi.mock("../client/transport", () => ({
  replicaApiOrigin: () => "https://life.example",
  createReplicaTransport: () => ({ request: (path: string, body?: unknown) => request(path, body) }),
}));

const account = { id: "A", email: "native@example.test" };
async function save(expiresAt: number, authMode?: "test-password") {
  await writeReplicaSession({ accountId: account.id, email: account.email, accessToken: authMode ? "a".repeat(64) : "old-token", refreshToken: "refresh-token", expiresAt, authMode });
}
beforeEach(async () => {
  localStorage.clear();
  await control.delete();
  await control.open();
  await initializeControl();
  await setLocalAccount(account);
  request.mockReset();
});
afterEach(async () => { await control.delete(); localStorage.clear(); });

describe("native replica token refresh", () => {
  it("returns null without a token so local records stay usable", async () => {
    expect(await refreshIfNeeded()).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it("does not refresh a valid token", async () => {
    await save(Date.now() + 3600_000);
    expect((await refreshIfNeeded())?.accountId).toBe("A");
    expect(request).not.toHaveBeenCalled();
  });
  it("refreshes a soon-expiring provider session", async () => {
    await save(Date.now() + 10_000);
    request.mockResolvedValue({ account, accessToken: "new-token", refreshToken: "new-refresh", expiresAt: Date.now() + 3600_000 });
    expect((await refreshIfNeeded())?.accountId).toBe("A");
    expect(request).toHaveBeenCalledWith("auth/refresh", { refreshToken: "refresh-token" });
    expect((await readReplicaSession())?.accessToken).toBe("new-token");
  });
  it("keeps expired provider credentials for retry but pauses network after failed refresh", async () => {
    await save(Date.now() - 10_000);
    request.mockRejectedValue(new Error("offline"));
    expect(await refreshIfNeeded()).toBeNull();
    expect((await readReplicaSession())?.accessToken).toBe("old-token");
    expect((await initializeControl()).context.account).toEqual(account);
  });
  it("never provider-refreshes expired test-password sessions", async () => {
    await save(Math.floor(Date.now() / 1000) - 10, "test-password");
    expect(await refreshIfNeeded(true)).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect((await readReplicaSession())?.authMode).toBe("test-password");
  });
  it.each(["logout", "new-account"])("discards delayed refresh after %s", async (action) => {
    await save(Date.now() + 10_000);
    let finish!: (result: unknown) => void;
    request.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = refreshIfNeeded();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    await writeReplicaSession(action === "logout" ? null : { accountId: "B", email: "b@test", accessToken: "b-token" });
    await setLocalAccount(action === "logout" ? null : { id: "B", email: "b@test" });
    finish({ account, accessToken: "late-token", refreshToken: "late-refresh", expiresAt: Date.now() + 3600_000 });
    await pending;
    expect((await readReplicaSession())?.accessToken ?? null).toBe(action === "logout" ? null : "b-token");
  });
  it("rejects provider refresh returning another account", async () => {
    await save(Date.now() + 10_000);
    request.mockResolvedValue({ account: { id: "B", email: "b@test" }, accessToken: "wrong-token", refreshToken: "new-refresh" });
    await refreshIfNeeded();
    expect((await readReplicaSession())?.accessToken).toBe("old-token");
  });
});
