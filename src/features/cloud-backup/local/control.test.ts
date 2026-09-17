// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { activateLibrary, bindLocalLibrary, ControlDatabase, initializeControl, setLocalAccount } from "./control";

const stores: ControlDatabase[] = [];
function storage() { const value = new ControlDatabase(`test-control-${crypto.randomUUID()}`); stores.push(value); return value; }
afterEach(async () => { for (const store of stores.splice(0)) await store.delete(); });

it("registers the existing anonymous life database without copying or rewriting its rows", async () => {
  const store = storage();
  const initial = await initializeControl(store);
  expect(initial.library.databaseName).toBe("life");
  expect(initial.library.accountId).toBeNull();
  expect(await initializeControl(store)).toEqual(initial);
});

it("binds idempotently and never reassigns an account's original library on logout/login B", async () => {
  const store = storage(); const { library } = await initializeControl(store);
  await setLocalAccount({ id: "A", email: "a@example.test" }, false, store);
  await bindLocalLibrary(library.id, "A", store);
  await bindLocalLibrary(library.id, "A", store);
  const guest = await setLocalAccount(null, true, store);
  expect(guest.id).not.toBe(library.id);
  expect((await store.libraries.get(library.id))?.accountId).toBe("A");
  expect((await initializeControl(store)).context.logoutPending).toBe(true);
  await setLocalAccount({ id: "B", email: "b@example.test" }, false, store);
  await expect(activateLibrary(library.id, store)).rejects.toMatchObject({ code: "library_locked" });
  await expect(bindLocalLibrary(library.id, "B", store)).rejects.toMatchObject({ code: "binding_mismatch" });
  await setLocalAccount({ id: "A", email: "a@example.test" }, false, store);
  expect((await activateLibrary(library.id, store)).id).toBe(library.id);
});

it("refuses to activate a restore that has not passed verification", async () => {
  const store = storage(); const { library } = await initializeControl(store);
  await store.libraries.add({ ...library, id: "incomplete", databaseName: "pending", ready: false });
  await expect(activateLibrary("incomplete", store)).rejects.toMatchObject({ code: "library_locked" });
  expect((await initializeControl(store)).library.id).toBe(library.id);
});

it("does not auto-select a downloaded Replica restore that was never confirmed", async () => {
  const store = storage();
  const { library } = await initializeControl(store);
  const account = { id: "A", email: "a@example.test" };
  await setLocalAccount(account, false, store);
  await bindLocalLibrary(library.id, account.id, store);
  await store.libraries.add({
    id: "staged-restore",
    databaseName: "life-restore-staged",
    accountId: account.id,
    createdAt: "2099-01-01T00:00:00.000Z",
    restoredFrom: "replica:4",
    ready: true,
  });
  const guest = await setLocalAccount(null, true, store);
  expect(guest.id).not.toBe(library.id);
  expect((await setLocalAccount(account, false, store)).id).toBe(library.id);
  expect((await store.settings.get("context"))?.activeLibraryId).toBe(library.id);
});

it("resumes the last explicitly opened library instead of the newest restored copy", async () => {
  const store = storage();
  const { library: original } = await initializeControl(store);
  const account = { id: "A", email: "a@example.test" };
  await setLocalAccount(account, false, store);
  await bindLocalLibrary(original.id, account.id, store);
  const older = {
    id: "restore-older",
    databaseName: "life-restore-older",
    accountId: account.id,
    createdAt: "2026-09-17T01:00:00.000Z",
    restoredFrom: "replica:1",
    ready: true,
  };
  const newer = {
    id: "restore-newer",
    databaseName: "life-restore-newer",
    accountId: account.id,
    createdAt: "2026-09-17T02:00:00.000Z",
    restoredFrom: "replica:2",
    ready: true,
  };
  await store.libraries.bulkAdd([older, newer]);
  expect((await activateLibrary(older.id, store)).id).toBe(older.id);
  await setLocalAccount(null, true, store);
  expect((await setLocalAccount(account, false, store)).id).toBe(older.id);
  expect((await store.settings.get("context"))?.lastActiveByAccount).toMatchObject({ A: older.id });
});
