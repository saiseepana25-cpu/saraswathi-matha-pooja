import { createHash } from "node:crypto";
import { BSON, type Collection } from "mongodb";
import {
  emptySchedule,
  linksValid,
  type ScheduleSave,
  type ScheduleSnapshot,
} from "@/lib/schedule";

type Receipt = {
  operationId: string;
  requestHash: string;
  section: string;
  committedAt: Date;
};
export type ScheduleDocument = ScheduleSnapshot & {
  _id: "schedule";
  schemaVersion: 1;
  revision: number;
  createdAt: Date;
  recentCommits: Receipt[];
};
export type ScheduleStore = Pick<
  Collection<ScheduleDocument>,
  "findOne" | "insertOne" | "replaceOne"
>;
export class ScheduleTooLarge extends Error {}
export class ScheduleConflict extends Error {
  constructor(
    public code: "conflict" | "linked" | "operation",
    public snapshot: ScheduleSnapshot,
  ) {
    super(code);
  }
}
export function snapshot(document: ScheduleDocument | null): ScheduleSnapshot {
  if (!document) return emptySchedule();
  return {
    data: document.data,
    revisions: document.revisions,
    updatedAt: document.updatedAt,
  };
}
export async function readSchedule(store: ScheduleStore) {
  return snapshot(await store.findOne({ _id: "schedule" }));
}
export async function saveSchedule(store: ScheduleStore, input: ScheduleSave) {
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  for (let attempt = 0; attempt < 5; attempt++) {
    const document = await store.findOne({ _id: "schedule" });
    const current = snapshot(document);
    const receipt = document?.recentCommits.find(
      (item) => item.operationId === input.operationId,
    );
    if (receipt) {
      if (receipt.requestHash !== requestHash)
        throw new ScheduleConflict("operation", current);
      return { snapshot: current, replayed: true };
    }
    if (current.revisions[input.section] !== input.expectedRevision)
      throw new ScheduleConflict("conflict", current);
    const data = { ...current.data, [input.section]: input.data };
    if (!linksValid(data)) throw new ScheduleConflict("linked", current);
    const changed =
      JSON.stringify(current.data[input.section]) !== JSON.stringify(input.data);
    const now = new Date();
    const updated: ScheduleDocument = {
      _id: "schedule",
      schemaVersion: 1,
      revision: (document?.revision ?? 0) + 1,
      data,
      revisions: {
        ...current.revisions,
        [input.section]: input.expectedRevision + (changed ? 1 : 0),
      },
      updatedAt: {
        ...current.updatedAt,
        [input.section]: changed ? now.toISOString() : current.updatedAt[input.section],
      },
      createdAt: document?.createdAt ?? now,
      recentCommits: [
        ...(document?.recentCommits ?? []).filter(
          (item) => now.getTime() - item.committedAt.getTime() < 86_400_000,
        ),
        {
          operationId: input.operationId,
          requestHash,
          section: input.section,
          committedAt: now,
        },
      ].slice(-64),
    };
    if (BSON.calculateObjectSize(updated) > 2_000_000) throw new ScheduleTooLarge();
    const options = { writeConcern: { w: "majority" as const, wtimeoutMS: 5000 } };
    if (!document) {
      try {
        await store.insertOne(updated, options);
        return { snapshot: snapshot(updated), replayed: false };
      } catch (error) {
        if (typeof error === "object" && error && "code" in error && error.code === 11000)
          continue;
        throw error;
      }
    }
    const result = await store.replaceOne(
      { _id: "schedule", revision: document.revision },
      updated,
      options,
    );
    if (result.matchedCount === 1)
      return { snapshot: snapshot(updated), replayed: false };
  }
  throw new ScheduleConflict("conflict", await readSchedule(store));
}
