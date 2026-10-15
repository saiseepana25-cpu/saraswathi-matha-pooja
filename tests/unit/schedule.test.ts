import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  emptySchedule,
  mergeScheduleSnapshots,
  emptySection,
  linksValid,
  publicEntries,
  saveScheduleSchema,
  type ScheduleSave,
  type ScheduleEntry,
} from "@/lib/schedule";
import {
  saveSchedule,
  ScheduleTooLarge,
  readSchedule,
  type ScheduleDocument,
  type ScheduleStore,
} from "@/server/schedule/store";

function entry(title = "Example event"): ScheduleEntry {
  return {
    id: randomUUID(),
    title: { en: title, te: "ఉదాహరణ కార్యక్రమం" },
    time: "09:30",
    notes: null,
    programmeEventId: null,
  };
}
function input(
  section: ScheduleSave["section"] = "programme",
  event = entry(),
): ScheduleSave {
  const data = emptySection();
  data.days[0].entries.push(event);
  return { section, operationId: randomUUID(), expectedRevision: 0, data };
}
function memoryStore() {
  let document: ScheduleDocument | null = null;
  const store = {
    findOne: async () => (document ? structuredClone(document) : null),
    insertOne: async (next: ScheduleDocument) => {
      if (document) throw Object.assign(new Error("duplicate"), { code: 11000 });
      document = structuredClone(next);
      return { acknowledged: true, insertedId: "schedule" };
    },
    replaceOne: async (filter: { revision: number }, next: ScheduleDocument) => {
      if (!document || document.revision !== filter.revision) return { matchedCount: 0 };
      document = structuredClone(next);
      return { matchedCount: 1 };
    },
  } as unknown as ScheduleStore;
  return { store, document: () => document };
}
describe("schedule validation and inheritance", () => {
  it("requires exactly three fixed dates, bilingual names and unique stable IDs", () => {
    const good = input();
    expect(saveScheduleSchema.safeParse(good).success).toBe(true);
    const missing = structuredClone(good);
    missing.data.days.pop();
    expect(saveScheduleSchema.safeParse(missing).success).toBe(false);
    const wrongDate = structuredClone(good);
    wrongDate.data.days.reverse();
    expect(saveScheduleSchema.safeParse(wrongDate).success).toBe(false);
    const englishOnly = structuredClone(good);
    englishOnly.data.days[0].entries[0].title!.te = "";
    expect(saveScheduleSchema.safeParse(englishOnly).success).toBe(false);
    const duplicate = structuredClone(good);
    duplicate.data.days[1].entries.push(duplicate.data.days[0].entries[0]);
    expect(saveScheduleSchema.safeParse(duplicate).success).toBe(false);
  });
  it("rejects invalid times, partial optional translations and forged linked titles", () => {
    const bad = input();
    bad.data.days[0].entries[0].time = "25:00";
    expect(saveScheduleSchema.safeParse(bad).success).toBe(false);
    bad.data.days[0].entries[0].time = null;
    bad.data.days[0].entries[0].notes = { en: "Instructions", te: "" };
    expect(saveScheduleSchema.safeParse(bad).success).toBe(false);
    const linked = input("puja");
    linked.data.days[0].entries[0].programmeEventId = randomUUID();
    expect(saveScheduleSchema.safeParse(linked).success).toBe(false);
  });
  it("resolves linked names and times only from the same day's programme, and sorts public entries", () => {
    const data = emptySchedule().data;
    const event = entry();
    data.programme.days[0].entries.push(event);
    const puja: ScheduleEntry = {
      ...entry(),
      title: null,
      time: null,
      programmeEventId: event.id,
    };
    data.puja.days[0].entries.push(puja);
    expect(linksValid(data)).toBe(true);
    expect(publicEntries([puja], "2026-10-16", data.programme)[0]).toMatchObject({
      title: event.title,
      time: event.time,
    });
    data.puja.days[1].entries.push({ ...puja, id: randomUUID() });
    expect(linksValid(data)).toBe(false);
    const late = { ...entry(), time: "18:00" };
    const pending = { ...entry(), time: null };
    expect(
      publicEntries([pending, late, event], "2026-10-16", data.programme).map(
        (item) => item.time,
      ),
    ).toEqual(["09:30", "18:00", null]);
  });
});
describe("atomic whole-section saving", () => {
  it("publishes one section across dates and returns only public fields", async () => {
    const { store } = memoryStore();
    const save = input();
    save.data.days[2].entries.push(entry("Third day"));
    const result = await saveSchedule(store, save);
    expect(result.snapshot.revisions).toEqual({ programme: 1, puja: 0, prasadam: 0 });
    expect(result.snapshot.data.programme.days[2].entries).toHaveLength(1);
    expect(result.snapshot.updatedAt.programme).not.toBeNull();
    expect(result.snapshot).not.toHaveProperty("recentCommits");
    expect(result.snapshot).not.toHaveProperty("createdAt");
    expect(await readSchedule(store)).toEqual(result.snapshot);
  });
  it("replays an exact retry without a second revision and rejects reused operation IDs", async () => {
    const { store } = memoryStore();
    const save = input();
    await saveSchedule(store, save);
    const replay = await saveSchedule(store, save);
    expect(replay.replayed).toBe(true);
    expect(replay.snapshot.revisions.programme).toBe(1);
    const changed = structuredClone(save);
    changed.data.days[0].entries[0].time = null;
    await expect(saveSchedule(store, changed)).rejects.toMatchObject({
      code: "operation",
    });
  });
  it("preserves other sections during concurrent saves", async () => {
    const { store } = memoryStore();
    await Promise.all([
      saveSchedule(store, input()),
      saveSchedule(store, input("prasadam")),
    ]);
    const result = await readSchedule(store);
    expect(result.revisions).toEqual({ programme: 1, puja: 0, prasadam: 1 });
    expect(result.data.programme.days[0].entries).toHaveLength(1);
    expect(result.data.prasadam.days[0].entries).toHaveLength(1);
  });
  it("rejects stale saves instead of overwriting newer data", async () => {
    const { store } = memoryStore();
    const results = await Promise.allSettled([
      saveSchedule(store, input()),
      saveSchedule(store, input()),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect((await readSchedule(store)).revisions.programme).toBe(1);
  });
  it("prevents deletion of referenced events, including a concurrent link/delete race", async () => {
    const { store } = memoryStore();
    const programme = input();
    const event = programme.data.days[0].entries[0];
    await saveSchedule(store, programme);
    const puja = input("puja", {
      ...entry(),
      title: null,
      time: null,
      programmeEventId: event.id,
    });
    const remove = {
      ...programme,
      operationId: randomUUID(),
      expectedRevision: 1,
      data: emptySection(),
    };
    const results = await Promise.allSettled([
      saveSchedule(store, puja),
      saveSchedule(store, remove),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(linksValid((await readSchedule(store)).data)).toBe(true);
  });
  it("does not change publication timestamps for an unchanged save", async () => {
    const { store } = memoryStore();
    const save = input();
    const first = await saveSchedule(store, save);
    const second = await saveSchedule(store, {
      ...save,
      operationId: randomUUID(),
      expectedRevision: 1,
    });
    expect(second.snapshot.revisions.programme).toBe(1);
    expect(second.snapshot.updatedAt.programme).toBe(first.snapshot.updatedAt.programme);
  });
  it("does not report a failed database write as saved", async () => {
    const { store } = memoryStore();
    store.insertOne = async () => {
      throw new Error("connection lost");
    };
    await expect(saveSchedule(store, input())).rejects.toThrow("connection lost");
  });
});

it("caps the complete combined schedule before writing an oversized document", async () => {
  const { store } = memoryStore();
  const first = input();
  first.data.days[0].entries = Array.from({ length: 100 }, () => ({
    ...entry(),
    notes: { en: "a".repeat(2000), te: "అ".repeat(2000) },
  }));
  first.data.days[1].entries = Array.from({ length: 40 }, () => ({
    ...entry(),
    notes: { en: "a".repeat(2000), te: "అ".repeat(2000) },
  }));
  await saveSchedule(store, first);
  const second = {
    ...first,
    section: "prasadam" as const,
    operationId: crypto.randomUUID(),
    expectedRevision: 0,
  };
  await expect(saveSchedule(store, second)).rejects.toBeInstanceOf(ScheduleTooLarge);
  expect((await readSchedule(store)).revisions.prasadam).toBe(0);
});

it("never replaces a newer published snapshot with a delayed older response", () => {
  const older = emptySchedule();
  older.revisions.programme = 1;
  older.data.programme.days[0].entries = [entry("Older")];
  const newer = structuredClone(older);
  newer.revisions.prasadam = 1;
  newer.data.prasadam.days[0].entries = [entry("New meal")];
  const result = mergeScheduleSnapshots(newer, older);
  expect(result.revisions.prasadam).toBe(1);
  expect(result.data.prasadam.days[0].entries[0].title?.en).toBe("New meal");
});
