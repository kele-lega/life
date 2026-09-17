import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { control, initializeControl, setLocalAccount } from "@/features/cloud-backup/local/control";
import { clearReplicaLogin, loadReplicaAccount, passwordReplicaLogin, replicaUserTransport, retryReplicaLogout } from "./account";
import { readPendingReplicaLogout, readReplicaSession, writeReplicaSession } from "./session";

const native = vi.hoisted(() => vi.fn(() => false));
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/runtime/platform", () => ({ isNativeApp: () => native(), hostedApiOrigin: () => native() ? "https://life.example" : "" }));
vi.mock("./transport", () => ({
  replicaApiOrigin: () => "https://life.example",
  createReplicaTransport: (options: unknown) => ({ request: (path: string, body?: unknown) => request(path, body, options) }),
}));
const account = { id: "A", email: "", username: "fixture-user" };
const result = { account, authMode: "test-password", accessToken: "a".repeat(64), expiresAt: Math.floor(Date.now() / 1000) + 3600 };

beforeEach(async () => {
  native.mockReturnValue(false);
  localStorage.clear();
  await control.delete();
  await control.open();
  await initializeControl();
  request.mockReset();
});
afterEach(async () => { await control.delete(); localStorage.clear(); });

describe("shared account client", () => {
  it("discovers native auth mode without a session", async () => {
    native.mockReturnValue(true);
    request.mockResolvedValue({ configured: true, authMode: "test-password", account: null });
    expect(await loadReplicaAccount()).toEqual({ configured: true, authMode: "test-password", account: null });
    expect(request).toHaveBeenCalledWith("account", undefined, expect.objectContaining({ native: true, accessToken: undefined }));
  });
  it.each([false, true])("logs in via password on native=%s without persisting the password", async (isNative) => {
    native.mockReturnValue(isNative);
    request.mockResolvedValue(result);
    expect(await passwordReplicaLogin("fixture-user", "synthetic-secret")).toEqual(account);
    expect(request).toHaveBeenCalledWith("auth/password/login", { username: "fixture-user", password: "synthetic-secret" }, expect.objectContaining({ native: isNative }));
    expect(await readReplicaSession()).toEqual(isNative ? expect.objectContaining({ accountId: "A", username: "fixture-user", authMode: "test-password" }) : null);
    expect(Object.values(localStorage).join(" ")).not.toContain("synthetic-secret");
    expect((await initializeControl()).library.accountId).toBeNull();
  });
  it("clears native usable credentials immediately on offline logout and retries revocation", async () => {
    native.mockReturnValue(true);
    await setLocalAccount(account);
    await writeReplicaSession({ accountId: "A", email: "", accessToken: result.accessToken, authMode: "test-password", expiresAt: result.expiresAt });
    request.mockRejectedValueOnce(new Error("offline"));
    const logout = clearReplicaLogin();
    expect(await readReplicaSession()).toBeNull();
    await expect(logout).rejects.toThrow("offline");
    expect((await initializeControl()).context.logoutPending).toBe(true);
    expect(readPendingReplicaLogout()?.accessToken).toBe(result.accessToken);
    request.mockResolvedValue({ ok: true });
    await retryReplicaLogout();
    expect(readPendingReplicaLogout()).toBeNull();
    expect((await initializeControl()).context.logoutPending).toBe(false);
    expect(request).toHaveBeenLastCalledWith("auth/logout", {}, expect.objectContaining({ accessToken: result.accessToken }));
  });
  it("blocks web account/automatic requests while an offline logout is pending", async () => {
    await setLocalAccount(account);
    request.mockRejectedValueOnce(new Error("offline"));
    await expect(clearReplicaLogin()).rejects.toThrow();
    request.mockClear();
    expect((await loadReplicaAccount()).account).toBeNull();
    expect(await replicaUserTransport()).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it("finishes deferred web revoke before new login, without a late revoke for the new cookie", async () => {
    await setLocalAccount(account);
    request.mockRejectedValueOnce(new Error("offline"));
    await expect(clearReplicaLogin()).rejects.toThrow();
    request.mockReset().mockImplementation(async (path: string) => path === "auth/password/login" ? result : { ok: true });
    await passwordReplicaLogin("fixture-user", "synthetic-secret");
    expect(request.mock.calls.map(([path]) => path)).toEqual(["auth/logout", "auth/password/login"]);
    await retryReplicaLogout();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])("discards delayed login after logout native=%s and revokes its result", async (isNative) => {
    native.mockReturnValue(isNative);
    let finish!: (value: unknown) => void;
    request.mockImplementation((path: string) => path === "auth/password/login" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ ok: true }));
    const login = passwordReplicaLogin("fixture-user", "synthetic-secret");
    const assertion = expect(login).rejects.toMatchObject({ code: "account_changed" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    const logout = clearReplicaLogin();
    finish(result);
    await assertion;
    await logout;
    expect(await readReplicaSession()).toBeNull();
    expect(request.mock.calls.some(([path]) => path === "auth/logout")).toBe(true);
  });
});
