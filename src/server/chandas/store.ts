import { createHash } from "node:crypto";
import { BSON, type Collection } from "mongodb";
import { emptyChandas, type ChandasSave, type ChandasSnapshot } from "@/lib/chandas";

export type ChandasDocument = ChandasSnapshot & {
  _id: "current";
  schemaVersion: 1;
  writeVersion: number;
  createdAt: Date;
  updatedBy: "primary" | null;
  recentCommits: { operationId: string; requestHash: string; committedAt: Date }[];
};
export type ChandasStore = Pick<
  Collection<ChandasDocument>,
  "findOne" | "insertOne" | "replaceOne"
>;
export class ChandasConflict extends Error {
  constructor(
    public snapshot: ChandasSnapshot,
    public code: "conflict" | "operation" = "conflict",
  ) {
    super(code);
  }
}
export class ChandasTooLarge extends Error {}
export function chandasSnapshot(document: ChandasDocument | null): ChandasSnapshot {
  return document
    ? {
        households: document.households,
        revision: document.revision,
        updatedAt: document.updatedAt,
      }
    : emptyChandas();
}
export async function readChandas(store: ChandasStore) {
  return chandasSnapshot(await store.findOne({ _id: "current" }));
}
export async function saveChandas(store: ChandasStore, input: ChandasSave) {
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  for (let retry = 0; retry < 5; retry++) {
    const document = await store.findOne({ _id: "current" });
    const current = chandasSnapshot(document);
    const receipt = document?.recentCommits.find(
      (item) => item.operationId === input.operationId,
    );
    if (receipt) {
      if (receipt.requestHash !== requestHash)
        throw new ChandasConflict(current, "operation");
      return { snapshot: current, replayed: true };
    }
    if (input.expectedRevision !== current.revision) throw new ChandasConflict(current);
    const changed =
      JSON.stringify(input.households) !== JSON.stringify(current.households);
    const now = new Date();
    const next: ChandasDocument = {
      _id: "current",
      schemaVersion: 1,
      writeVersion: (document?.writeVersion ?? 0) + 1,
      households: input.households,
      revision: current.revision + (changed ? 1 : 0),
      updatedAt: changed ? now.toISOString() : current.updatedAt,
      updatedBy: changed ? "primary" : (document?.updatedBy ?? null),
      createdAt: document?.createdAt ?? now,
      recentCommits: [
        ...(document?.recentCommits ?? []).filter(
          (item) => now.getTime() - item.committedAt.getTime() < 86_400_000,
        ),
        { operationId: input.operationId, requestHash, committedAt: now },
      ].slice(-64),
    };
    if (BSON.calculateObjectSize(next) > 2_000_000) throw new ChandasTooLarge();
    const options = { writeConcern: { w: "majority" as const, wtimeoutMS: 5000 } };
    if (!document) {
      try {
        await store.insertOne(next, options);
        return { snapshot: chandasSnapshot(next), replayed: false };
      } catch (error) {
        if (typeof error === "object" && error && "code" in error && error.code === 11000)
          continue;
        throw error;
      }
    }
    const result = await store.replaceOne(
      { _id: "current", writeVersion: document.writeVersion },
      next,
      options,
    );
    if (result.matchedCount === 1)
      return { snapshot: chandasSnapshot(next), replayed: false };
  }
  throw new ChandasConflict(await readChandas(store));
}
