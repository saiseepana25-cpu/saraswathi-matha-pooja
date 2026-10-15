import { describe, expect, it, vi } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "@/server/auth/password";
import {
  normalizeUsername,
  provisionOrganiser,
  type OrganiserAccount,
  type OrganiserStore,
} from "@/server/auth/provision-organiser";

const password = "Test@Pass#123";
function memoryStore(initial?: OrganiserAccount) {
  let account = initial ?? null;
  const findOne = vi.fn(async () => account);
  const insertOne = vi.fn(async (document: OrganiserAccount) => {
    if (account) throw Object.assign(new Error("duplicate"), { code: 11000 });
    account = document;
    return { acknowledged: true, insertedId: document._id };
  });
  return {
    store: { findOne, insertOne } as unknown as OrganiserStore,
    findOne,
    insertOne,
    getAccount: () => account,
  };
}

describe("organiser credentials", () => {
  it("normalizes usernames and rejects ambiguous or invalid input", () => {
    expect(normalizeUsername("  Rittapadu.Organiser ")).toBe("rittapadu.organiser");
    for (const value of ["ab", "a b c", "$operator", "x".repeat(33), ".organiser"]) {
      expect(() => normalizeUsername(value)).toThrow();
    }
  });

  it("accepts passphrases without silently trimming and rejects unsafe lengths", () => {
    expect(() => validatePassword("  Test@123  ")).not.toThrow();
    expect(() => validatePassword("Ab@123!x")).not.toThrow();
    expect(() => validatePassword("Ab@123!xyz#4567")).not.toThrow();
    expect(() => validatePassword("Ab@123!")).toThrow();
    for (const value of ["short", " ".repeat(8), "x".repeat(16), "a long\npassphrase"]) {
      expect(() => validatePassword(value)).toThrow();
    }
  });

  it("uses independent salts and verifies only the exact password", async () => {
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first.saltBase64).not.toBe(second.saltBase64);
    expect(first.hashBase64).not.toBe(second.hashBase64);
    expect(JSON.stringify(first)).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password + "!", first)).toBe(false);
    expect(await verifyPassword(password, { ...first, N: 2 ** 30 })).toBe(false);
    expect(await verifyPassword(password, { ...first, hashBase64: "invalid" })).toBe(
      false,
    );
  }, 15_000);
});

describe("single organiser provisioning", () => {
  it("stores a hash, dates and the fixed account ID, without the plaintext password", async () => {
    const db = memoryStore();
    expect(await provisionOrganiser(db.store, " RITTAPADU ", password)).toBe("created");
    const account = db.getAccount()!;
    expect(account).toMatchObject({
      _id: "primary",
      schemaVersion: 1,
      usernameNormalized: "rittapadu",
      enabled: true,
    });
    expect(account.createdAt).toBeInstanceOf(Date);
    expect(await verifyPassword(password, account.password)).toBe(true);
    expect(JSON.stringify(account)).not.toContain(password);
    expect(db.insertOne).toHaveBeenCalledWith(account, {
      writeConcern: { w: "majority", wtimeoutMS: 10_000 },
    });
  }, 15_000);

  it("refuses a second account or password overwrite, even when the old account is disabled", async () => {
    const db = memoryStore({ _id: "primary", enabled: false } as OrganiserAccount);
    expect(await provisionOrganiser(db.store, "another", password)).toBe("exists");
    expect(db.insertOne).not.toHaveBeenCalled();
  });

  it("allows only one successful concurrent setup run", async () => {
    const db = memoryStore();
    const results = await Promise.all([
      provisionOrganiser(db.store, "organiser.one", password),
      provisionOrganiser(db.store, "organiser.two", password),
    ]);
    expect(results.sort()).toEqual(["created", "exists"]);
    expect(db.insertOne).toHaveBeenCalledTimes(2);
    expect(db.getAccount()?._id).toBe("primary");
  }, 15_000);

  it("rejects invalid credentials before attempting a write", async () => {
    const db = memoryStore();
    await expect(provisionOrganiser(db.store, "$invalid", password)).rejects.toThrow();
    await expect(provisionOrganiser(db.store, "valid", "short")).rejects.toThrow();
    expect(db.insertOne).not.toHaveBeenCalled();
  });

  it("does not report an uncertain or failed database write as success", async () => {
    const db = memoryStore();
    db.insertOne.mockRejectedValueOnce(new Error("connection lost"));
    await expect(provisionOrganiser(db.store, "organiser", password)).rejects.toThrow();
  }, 15_000);
});
