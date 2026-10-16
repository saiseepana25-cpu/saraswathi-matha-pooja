import { createHash, randomUUID } from "node:crypto";
import { Binary, type ClientSession, type Db } from "mongodb";
import {
  emptyGallery,
  type GallerySnapshot,
  type GallerySave,
  type GalleryItem,
} from "@/lib/gallery";
import { AuthError } from "@/server/auth/http";
import { validateImage } from "./images";
type Receipt = { operationId: string; hash: string; committedAt: Date };
export type GalleryDocument = GallerySnapshot & {
  _id: "current";
  writeVersion: number;
  recentCommits: Receipt[];
};
export type MediaBatch = {
  _id: string;
  ownerId: "primary";
  scope: "gallery";
  baseRevision: number;
  state: "open" | "abandoned";
  expiresAt: Date;
  createdAt: Date;
};
export type MediaDocument = {
  _id: string;
  ownerId: "primary";
  scope: "gallery";
  batchId: string;
  clientFileId: string;
  createdAt: Date;
  main: Awaited<ReturnType<typeof validateImage>> & { bytes: Binary };
  thumbnail: Awaited<ReturnType<typeof validateImage>> & { bytes: Binary };
};
export class GalleryConflict extends Error {
  constructor(
    public snapshot: GallerySnapshot,
    public code = "conflict",
  ) {
    super(code);
  }
}
export function publicGallery(doc: GalleryDocument | null): GallerySnapshot {
  return doc
    ? { items: doc.items, revision: doc.revision, updatedAt: doc.updatedAt }
    : emptyGallery();
}
export async function readGallery(db: Db) {
  return publicGallery(
    await db.collection<GalleryDocument>("gallery").findOne({ _id: "current" }),
  );
}
async function initialize(db: Db) {
  try {
    await db.collection<GalleryDocument>("gallery").updateOne(
      { _id: "current" },
      {
        $setOnInsert: {
          _id: "current",
          ...emptyGallery(),
          writeVersion: 0,
          recentCommits: [],
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (!(typeof error === "object" && error && "code" in error && error.code === 11000))
      throw error;
  }
}
export async function galleryTransaction<T>(
  db: Db,
  action: (doc: GalleryDocument, session: ClientSession) => Promise<T>,
) {
  await initialize(db);
  return db.client.withSession((session) =>
    session.withTransaction(
      async () => {
        const collection = db.collection<GalleryDocument>("gallery");
        const doc = await collection.findOne({ _id: "current" }, { session });
        if (!doc) throw new Error("Gallery missing.");
        // All publication, staging and maintenance operations contend on this document.
        await collection.updateOne(
          { _id: "current" },
          { $inc: { writeVersion: 1 } },
          { session },
        );
        return action(doc, session);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority", wtimeoutMS: 5000 },
        maxCommitTimeMS: 5000,
      },
    ),
  );
}
export function requireBatch(batch: MediaBatch | null, revision?: number) {
  if (
    !batch ||
    batch.ownerId !== "primary" ||
    batch.scope !== "gallery" ||
    batch.state !== "open" ||
    batch.expiresAt.getTime() <= Date.now()
  )
    throw new AuthError(410, "batchUnavailable");
  if (revision !== undefined && batch.baseRevision !== revision)
    throw new AuthError(409, "batchRevision");
  return batch;
}
export async function createBatch(
  db: Db,
  input: { clientBatchId: string; expectedRevision: number },
  authorize: () => void = () => undefined,
) {
  return galleryTransaction(db, async (doc, session) => {
    authorize();
    const batches = db.collection<MediaBatch>("media_batches");
    const existing = await batches.findOne({ _id: input.clientBatchId }, { session });
    if (existing) return requireBatch(existing, input.expectedRevision);
    if (doc.revision !== input.expectedRevision)
      throw new GalleryConflict(publicGallery(doc));
    const count = await batches.countDocuments(
      {
        ownerId: "primary",
        scope: "gallery",
        state: "open",
        expiresAt: { $gt: new Date() },
      },
      { session },
    );
    if (count >= 2) throw new AuthError(409, "stagingLimit");
    const now = new Date();
    const batch: MediaBatch = {
      _id: input.clientBatchId,
      ownerId: "primary",
      scope: "gallery",
      baseRevision: input.expectedRevision,
      state: "open",
      createdAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    };
    authorize();
    await batches.insertOne(batch, { session });
    return batch;
  });
}
export async function abandonBatch(
  db: Db,
  id: string,
  authorize: () => void = () => undefined,
) {
  await galleryTransaction(db, async (_doc, session) => {
    authorize();
    await db
      .collection<MediaBatch>("media_batches")
      .updateOne(
        { _id: id, ownerId: "primary", scope: "gallery" },
        { $set: { state: "abandoned" } },
        { session },
      );
  });
}
export async function uploadPhoto(
  db: Db,
  batchId: string,
  clientFileId: string,
  mainBytes: Buffer,
  thumbBytes: Buffer,
  authorize: () => void = () => undefined,
) {
  const [main, thumbnail] = await Promise.all([
    validateImage(mainBytes, "main"),
    validateImage(thumbBytes, "thumbnail"),
  ]);
  const mediaId = randomUUID();
  return galleryTransaction(db, async (doc, session) => {
    authorize();
    const activeBatch = requireBatch(
      await db
        .collection<MediaBatch>("media_batches")
        .findOne({ _id: batchId }, { session }),
    );
    if (activeBatch.baseRevision !== doc.revision)
      throw new GalleryConflict(publicGallery(doc));
    const media = db.collection<MediaDocument>("media");
    const existing = await media.findOne(
      { batchId, clientFileId, ownerId: "primary", scope: "gallery" },
      { session },
    );
    if (existing) {
      if (
        existing.main.sha256 !== main.sha256 ||
        existing.thumbnail.sha256 !== thumbnail.sha256
      )
        throw new AuthError(409, "fileKeyReused");
      return {
        mediaId: existing._id,
        width: existing.main.width,
        height: existing.main.height,
      };
    }
    if ((await media.countDocuments({ batchId }, { session })) >= 60)
      throw new AuthError(409, "stagingLimit");
    const staged = await media
      .find(
        { scope: "gallery", _id: { $nin: doc.items.map((item) => item.mediaId) } },
        { session, projection: { "main.byteLength": 1, "thumbnail.byteLength": 1 } },
      )
      .toArray();
    const bytes = staged.reduce(
      (sum, file) => sum + file.main.byteLength + file.thumbnail.byteLength,
      0,
    );
    if (bytes + main.byteLength + thumbnail.byteLength > 100_000_000)
      throw new AuthError(409, "stagingLimit");
    authorize();
    await media.insertOne(
      {
        _id: mediaId,
        ownerId: "primary",
        scope: "gallery",
        batchId,
        clientFileId,
        createdAt: new Date(),
        main: { ...main, bytes: new Binary(mainBytes) },
        thumbnail: { ...thumbnail, bytes: new Binary(thumbBytes) },
      },
      { session },
    );
    return { mediaId, width: main.width, height: main.height };
  });
}
export function publishItems(
  current: GalleryItem[],
  input: GallerySave,
  files: Map<string, MediaDocument>,
  now: string,
) {
  const retained = new Map(current.map((item) => [item.id, item]));
  const removals = current
    .filter((item) => !input.items.some((next) => next.id === item.id))
    .map((item) => item.id)
    .sort();
  if (JSON.stringify(removals) !== JSON.stringify([...input.confirmedRemovalIds].sort()))
    throw new AuthError(422, "removalConfirmation");
  const additions: { item: GalleryItem; index: number }[] = [];
  for (const item of input.items) {
    const old = retained.get(item.id);
    if (old) {
      if (old.mediaId !== item.mediaId || item.selectionIndex !== null)
        throw new AuthError(422, "invalidReference");
    } else {
      const file = files.get(item.mediaId);
      if (
        !file ||
        file.ownerId !== "primary" ||
        file.scope !== "gallery" ||
        file.batchId !== input.mediaBatchId ||
        item.selectionIndex === null ||
        current.some((oldItem) => oldItem.mediaId === item.mediaId)
      )
        throw new AuthError(422, "invalidReference");
      additions.push({
        index: item.selectionIndex,
        item: {
          id: item.id,
          mediaId: item.mediaId,
          width: file.main.width,
          height: file.main.height,
          publishedAt: now,
        },
      });
    }
  }
  additions.sort((a, b) => a.index - b.index);
  return [
    ...additions.map((value) => value.item),
    ...current.filter((item) => input.items.some((next) => next.id === item.id)),
  ];
}
export async function saveGallery(
  db: Db,
  input: GallerySave,
  authorize: () => void = () => undefined,
) {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return galleryTransaction(db, async (doc, session) => {
    authorize();
    const receipt = doc.recentCommits.find(
      (value) => value.operationId === input.operationId,
    );
    if (receipt) {
      if (receipt.hash !== hash)
        throw new GalleryConflict(publicGallery(doc), "operation");
      return { snapshot: publicGallery(doc), replayed: true };
    }
    if (doc.revision !== input.expectedRevision)
      throw new GalleryConflict(publicGallery(doc));
    const newIds = input.items
      .filter((item) => !doc.items.some((old) => old.id === item.id))
      .map((item) => item.mediaId);
    if (newIds.length)
      requireBatch(
        await db
          .collection<MediaBatch>("media_batches")
          .findOne({ _id: input.mediaBatchId! }, { session }),
        input.expectedRevision,
      );
    const files = await db
      .collection<MediaDocument>("media")
      .find({ _id: { $in: newIds } }, { session })
      .toArray();
    const now = new Date();
    const items = publishItems(
      doc.items,
      input,
      new Map(files.map((file) => [file._id, file])),
      now.toISOString(),
    );
    const changed = JSON.stringify(items) !== JSON.stringify(doc.items);
    const next = {
      items,
      revision: doc.revision + (changed ? 1 : 0),
      updatedAt: changed ? now.toISOString() : doc.updatedAt,
    };
    authorize();
    await db.collection<GalleryDocument>("gallery").updateOne(
      { _id: "current" },
      {
        $set: {
          ...next,
          recentCommits: [
            ...doc.recentCommits.filter(
              (value) => now.getTime() - value.committedAt.getTime() < 86_400_000,
            ),
            { operationId: input.operationId, hash, committedAt: now },
          ].slice(-64),
        },
      },
      { session },
    );
    if (input.mediaBatchId)
      await db
        .collection<MediaBatch>("media_batches")
        .updateOne(
          { _id: input.mediaBatchId },
          { $set: { state: "abandoned" } },
          { session },
        );
    return { snapshot: next, replayed: false };
  });
}
