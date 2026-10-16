import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  browseHouseholds,
  collectedChandasRupees,
  MAX_RUPEES,
  CHANDAS_PAGE_SIZE,
  duplicateHouseholdIds,
  emptyChandas,
  householdSchema,
  householdDisplayName,
  householdsSchema,
  insertHousehold,
  matchesContribution,
  saveChandasSchema,
  type Household,
  type ChandasSave,
} from "@/lib/chandas";
import {
  ChandasConflict,
  chandasSnapshot,
  readChandas,
  saveChandas,
  type ChandasDocument,
  type ChandasStore,
} from "@/server/chandas/store";
const row = (
  name = "Sai",
  contribution: Household["contribution"] = { type: "pending" },
): Household => ({ id: randomUUID(), name: { en: name, te: "సాయి" }, contribution });
const input = (households = [row()]): ChandasSave => ({
  households,
  expectedRevision: 0,
  operationId: randomUUID(),
});
function memory() {
  let document: ChandasDocument | null = null;
  const store = {
    findOne: async () => (document ? structuredClone(document) : null),
    insertOne: async (next: ChandasDocument) => {
      if (document) throw Object.assign(new Error(), { code: 11000 });
      document = structuredClone(next);
      return { acknowledged: true };
    },
    replaceOne: async (filter: { writeVersion: number }, next: ChandasDocument) => {
      if (!document || document.writeVersion !== filter.writeVersion)
        return { matchedCount: 0 };
      document = structuredClone(next);
      return { matchedCount: 1 };
    },
  } as unknown as ChandasStore;
  return { store, document: () => document };
}
describe("Chandas household validation and browsing", () => {
  it("accepts Pending and Vigraham without a money value, and rejects mixed states", () => {
    expect(householdSchema.safeParse(row()).success).toBe(true);
    expect(householdSchema.safeParse(row("Idol", { type: "vigraham" })).success).toBe(
      true,
    );
    expect(
      householdSchema.safeParse({
        ...row(),
        contribution: { type: "vigraham", amountRupees: 500 },
      }).success,
    ).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    "rejects invalid money amount %s",
    (amountRupees) => {
      expect(
        householdSchema.safeParse(row("Sai", { type: "money", amountRupees })).success,
      ).toBe(false);
    },
  );
  it("accepts either household name and requires at least one with bounded unique IDs", () => {
    const value = row();
    expect(
      householdSchema.safeParse({ ...value, name: { en: "Sai", te: " " } }).success,
    ).toBe(true);
    expect(
      householdSchema.parse({ ...value, name: { en: " ", te: " సాయి " } }).name,
    ).toEqual({ en: "", te: "సాయి" });
    expect(
      householdSchema.safeParse({ ...value, name: { en: " ", te: " " } }).success,
    ).toBe(false);
    expect(
      householdSchema.safeParse({ ...value, name: { en: "a".repeat(121), te: "సాయి" } })
        .success,
    ).toBe(false);
    expect(householdsSchema.safeParse([value, value]).success).toBe(false);
    expect(
      householdsSchema.safeParse(Array.from({ length: 1001 }, () => row())).success,
    ).toBe(false);
    expect(saveChandasSchema.safeParse({ ...input(), total: 100 }).success).toBe(false);
  });
  it.each([
    [50, "50-99"],
    [99, "50-99"],
    [100, "100-199"],
    [101, "100-199"],
    [199, "100-199"],
    [200, "200-299"],
    [301, "300-399"],
    [401, "400-499"],
    [501, "500-999"],
    [999, "500-999"],
    [1000, "1000-1999"],
    [1100, "1000-1999"],
    [1999, "1000-1999"],
    [2000, "2000+"],
    [2100, "2000+"],
  ] as const)(
    "filters actual amount %i into %s without rounding",
    (amountRupees, filter) => {
      const value = row("Sai", { type: "money", amountRupees });
      expect(matchesContribution(value, filter)).toBe(true);
      expect(value.contribution).toEqual({ type: "money", amountRupees });
      expect(matchesContribution(value, "pending")).toBe(false);
      expect(matchesContribution(value, "vigraham")).toBe(false);
    },
  );
  it("preserves stable identity and contributions while inserting at position 2", () => {
    const sai = row("Sai");
    const soman = row("Soman", { type: "money", amountRupees: 501 });
    const kornakar = row("Kornakar");
    const result = insertHousehold([sai, soman], kornakar, 2);
    expect(result.map((item) => item.name.en)).toEqual(["Sai", "Kornakar", "Soman"]);
    expect(result[2]).toEqual(soman);
    expect(() => insertHousehold(result, row(), 0)).toThrow();
  });
  it("searches both spellings across the full list and preserves original serials when sorting/filtering", () => {
    const rows = Array.from({ length: 130 }, (_, index) => ({
      ...row("House " + index),
      name: { en: "House " + index, te: "గృహం " + index },
    }));
    rows[95] = row("  SOMAN  RAO ", { type: "money", amountRupees: 101 });
    rows[95].name.te = "సోమన్ రావు";
    const results = browseHouseholds(rows, "soman   rao", "100-199", "desc", "en");
    expect(results.map((item) => item.serial)).toEqual([96]);
    expect(browseHouseholds(rows, "సోమన్", "all", "original", "te")[0].serial).toBe(96);
    expect(CHANDAS_PAGE_SIZE).toBe(30);
    expect(
      Array.from(
        { length: 5 },
        (_, index) => rows.slice(index * 30, (index + 1) * 30).length,
      ),
    ).toEqual([30, 30, 30, 30, 10]);
  });
  it("uses the available name for language fallback, sorting and search", () => {
    const a = { ...row(), name: { en: "Zebra", te: "" } };
    const b = { ...row(), name: { en: "Alpha", te: "" } };
    const c = { ...row(), name: { en: "", te: "సాయి" } };
    expect(householdDisplayName(a.name, "te")).toBe("Zebra");
    expect(householdDisplayName(c.name, "en")).toBe("సాయి");
    expect(
      browseHouseholds([a, b], "", "all", "asc", "te").map(({ row }) => row.id),
    ).toEqual([b.id, a.id]);
    expect(
      browseHouseholds([a, b, c], "సాయి", "all", "original", "en").map(
        ({ row }) => row.id,
      ),
    ).toEqual([c.id]);
    expect(duplicateHouseholdIds([a, b, c]).size).toBe(0);
  });
  it("warns on normalized duplicate names without rejecting distinct households", () => {
    const a = row("Sai Rao"),
      b = row(" SAI   RAO ");
    b.name.te = "వేరే పేరు";
    expect(duplicateHouseholdIds([a, b]).size).toBe(2);
    expect(householdsSchema.safeParse([a, b]).success).toBe(true);
  });
});
describe("Chandas atomic publication", () => {
  it("reads an honest empty list without inserting examples", async () => {
    const db = memory();
    expect(await readChandas(db.store)).toEqual(emptyChandas());
    expect(db.document()).toBe(null);
  });
  it("publishes the whole list and replays an unchanged operation idempotently", async () => {
    const db = memory(),
      save = input([
        row("Sai", { type: "money", amountRupees: 101 }),
        row("Idol", { type: "vigraham" }),
      ]);
    const first = await saveChandas(db.store, save),
      second = await saveChandas(db.store, save);
    expect(first.snapshot.revision).toBe(1);
    expect(second.replayed).toBe(true);
    expect(second.snapshot).toEqual(first.snapshot);
    expect(chandasSnapshot(db.document())).not.toHaveProperty("recentCommits");
    expect(first.snapshot).not.toHaveProperty("total");
  });
  it("rejects stale whole-list saves and changed payloads reusing an operation ID", async () => {
    const db = memory(),
      save = input();
    await saveChandas(db.store, save);
    await expect(
      saveChandas(db.store, { ...save, households: [row()] }),
    ).rejects.toMatchObject({ code: "operation" });
    await expect(saveChandas(db.store, input())).rejects.toBeInstanceOf(ChandasConflict);
  });
  it("only one concurrent save against the same revision succeeds", async () => {
    const db = memory();
    const outcomes = await Promise.allSettled([
      saveChandas(db.store, input()),
      saveChandas(db.store, input()),
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(db.document()?.revision).toBe(1);
  });
  it("replaces amounts, allows clearing to Pending, and preserves timestamp on no-op saves", async () => {
    const db = memory(),
      first = input([row("Sai", { type: "money", amountRupees: 500 })]);
    const saved = await saveChandas(db.store, first);
    const corrected = structuredClone(first.households);
    corrected[0].contribution = { type: "money", amountRupees: 600 };
    const result = await saveChandas(db.store, {
      ...input(corrected),
      expectedRevision: 1,
    });
    expect(result.snapshot.households[0].contribution).toEqual({
      type: "money",
      amountRupees: 600,
    });
    const noOp = await saveChandas(db.store, {
      ...input(corrected),
      expectedRevision: 2,
    });
    expect(noOp.snapshot.revision).toBe(2);
    expect(noOp.snapshot.updatedAt).toBe(result.snapshot.updatedAt);
    corrected[0].contribution = { type: "pending" };
    const cleared = await saveChandas(db.store, {
      ...input(corrected),
      expectedRevision: 2,
    });
    expect(cleared.snapshot.households[0].contribution).toEqual({ type: "pending" });
    expect(saved.snapshot.revision).toBe(1);
  });
  it("does not claim success when a write fails", async () => {
    const db = memory();
    db.store.insertOne = async () => {
      throw new Error("unavailable");
    };
    await expect(saveChandas(db.store, input())).rejects.toThrow("unavailable");
    expect(db.document()).toBe(null);
  });
});

describe("Published Chandas collected amount", () => {
  it("adds exact Money amounts and excludes Pending and Vigraham", () => {
    const rows = [
      row("A", { type: "money", amountRupees: 101 }),
      row("B", { type: "money", amountRupees: 501 }),
      row("C", { type: "money", amountRupees: 1100 }),
      row("D"),
      row("E", { type: "vigraham" }),
    ];
    expect(collectedChandasRupees(rows)).toBe(1702n);
    expect(rows[0].contribution).toEqual({ type: "money", amountRupees: 101 });
  });
  it("returns a genuine zero for empty and non-money lists", () => {
    expect(collectedChandasRupees([])).toBe(0n);
    expect(collectedChandasRupees([row(), row("Idol", { type: "vigraham" })])).toBe(0n);
  });
  it("preserves exact integer totals beyond the Number safe-integer limit", () => {
    const rows = Array.from({ length: 1000 }, () =>
      row("A", { type: "money", amountRupees: MAX_RUPEES }),
    );
    expect(collectedChandasRupees(rows)).toBe(BigInt(MAX_RUPEES) * 1000n);
    expect(collectedChandasRupees(rows) > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});
