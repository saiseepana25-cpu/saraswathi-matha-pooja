import { randomUUID } from "node:crypto";
import { Binary, type Db } from "mongodb";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  gallerySaveSchema,
  emptyGallery,
  MAIN_LIMIT,
  THUMB_LIMIT,
  ORIGINAL_LIMIT,
} from "@/lib/gallery";
import { validateImage } from "@/server/gallery/images";
import {
  publicGallery,
  publishItems,
  requireBatch,
  saveGallery,
  createBatch,
  uploadPhoto,
  readGallery,
  type GalleryDocument,
  type MediaDocument,
  type MediaBatch,
} from "@/server/gallery/store";
const item = () => ({
  id: randomUUID(),
  mediaId: randomUUID(),
  publishedAt: "2026-10-16T00:00:00Z",
  width: 500,
  height: 700,
});
const batch = (): MediaBatch => ({
  _id: randomUUID(),
  ownerId: "primary",
  scope: "gallery",
  baseRevision: 0,
  state: "open",
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date(),
});
const input = () => ({
  operationId: randomUUID(),
  expectedRevision: 0,
  mediaBatchId: null,
  items: [],
  confirmedRemovalIds: [],
});
function memory() {
  const tables = new Map<string, Record<string, unknown>[]>();
  function matches(doc: Record<string, unknown>, query: Record<string, unknown>) {
    return Object.entries(query).every(([key, value]) => {
      const actual = doc[key];
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const condition = value as { $in?: unknown[]; $nin?: unknown[]; $gt?: Date };
        if (condition.$in) return condition.$in.includes(actual);
        if (condition.$nin) return !condition.$nin.includes(actual);
        if (condition.$gt) return actual instanceof Date && actual > condition.$gt;
      }
      return actual === value;
    });
  }
  const collection = (name: string) => {
    if (!tables.has(name)) tables.set(name, []);
    return {
      findOne: async (query: Record<string, unknown>) =>
        tables.get(name)!.find((doc) => matches(doc, query)) ?? null,
      updateOne: async (
        query: Record<string, unknown>,
        update: {
          $set?: Record<string, unknown>;
          $inc?: Record<string, number>;
          $setOnInsert?: Record<string, unknown>;
        },
        options?: { upsert?: boolean },
      ) => {
        let doc = tables.get(name)!.find((doc) => matches(doc, query));
        if (!doc && options?.upsert) {
          doc = { ...query, ...update.$setOnInsert };
          tables.get(name)!.push(doc);
        }
        if (doc) {
          Object.assign(doc, update.$set);
          for (const [key, value] of Object.entries(update.$inc ?? {}))
            doc[key] = Number(doc[key] ?? 0) + value;
        }
      },
      insertOne: async (doc: Record<string, unknown>) => {
        tables.get(name)!.push(doc);
      },
      countDocuments: async (query: Record<string, unknown>) =>
        tables.get(name)!.filter((doc) => matches(doc, query)).length,
      find: (query: Record<string, unknown>) => ({
        toArray: async () => tables.get(name)!.filter((doc) => matches(doc, query)),
      }),
    };
  };
  const db = {
    collection,
    client: {
      withSession: async (callback: (session: unknown) => Promise<unknown>) =>
        callback({
          withTransaction: async (action: () => Promise<unknown>) => {
            // MongoDB snapshot isolation is represented by rollback; no live database is used.
            const backup = structuredClone(tables);
            try {
              return await action();
            } catch (error) {
              tables.clear();
              for (const [key, value] of backup) tables.set(key, value);
              throw error;
            }
          },
        }),
    },
  } as unknown as Db;
  return { db, tables, collection };
}
describe("Gallery contract and image validation", () => {
  it("allows 60 unique photos but rejects 61, captions, duplicated IDs and selection order", () => {
    const photos = Array.from({ length: 60 }, (_, selectionIndex) => ({
      ...item(),
      selectionIndex,
    }));
    const wire = photos.map(({ id, mediaId, selectionIndex }) => ({
      id,
      mediaId,
      selectionIndex,
    }));
    expect(gallerySaveSchema.safeParse({ ...input(), items: wire }).success).toBe(true);
    expect(
      gallerySaveSchema.safeParse({ ...input(), items: [...wire, wire[0]] }).success,
    ).toBe(false);
    expect(
      gallerySaveSchema.safeParse({ ...input(), caption: "No captions" }).success,
    ).toBe(false);
    expect(
      gallerySaveSchema.safeParse({
        ...input(),
        items: [wire[0], { ...wire[1], selectionIndex: 0 }],
      }).success,
    ).toBe(false);
    expect(ORIGINAL_LIMIT).toBe(7_000_000);
    expect(MAIN_LIMIT).toBe(3_000_000);
    expect(THUMB_LIMIT).toBe(200_000);
  });
  it("preserves unchanged references, places additions first and requires exact removal confirmation", () => {
    const old = item(),
      removed = item(),
      added = item(),
      b = batch();
    const file = {
      _id: added.mediaId,
      ownerId: "primary",
      scope: "gallery",
      batchId: b._id,
      main: { width: 900, height: 600 },
    } as MediaDocument;
    const body = {
      ...input(),
      mediaBatchId: b._id,
      items: [
        { id: old.id, mediaId: old.mediaId, selectionIndex: null },
        { id: added.id, mediaId: added.mediaId, selectionIndex: 0 },
      ],
      confirmedRemovalIds: [removed.id],
    };
    const result = publishItems(
      [old, removed],
      body,
      new Map([[file._id, file]]),
      "2026-10-17T00:00:00Z",
    );
    expect(result[0]).toMatchObject({
      id: added.id,
      width: 900,
      height: 600,
      publishedAt: "2026-10-17T00:00:00Z",
    });
    expect(result[1]).toEqual(old);
    expect(() =>
      publishItems(
        [old, removed],
        { ...body, confirmedRemovalIds: [] },
        new Map([[file._id, file]]),
        "now",
      ),
    ).toThrow("removalConfirmation");
    expect(() =>
      publishItems(
        [old, removed],
        { ...body, mediaBatchId: randomUUID() },
        new Map([[file._id, file]]),
        "now",
      ),
    ).toThrow("invalidReference");
    expect(() =>
      publishItems(
        [old],
        {
          ...input(),
          items: [{ id: randomUUID(), mediaId: old.mediaId, selectionIndex: 0 }],
        },
        new Map([[old.mediaId, file]]),
        "now",
      ),
    ).toThrow();
  });
  it("keeps media batches private, scoped, time limited and revision bound", () => {
    const b = batch();
    expect(requireBatch(b, 0)).toEqual(b);
    expect(() => requireBatch({ ...b, state: "abandoned" })).toThrow("batchUnavailable");
    expect(() => requireBatch({ ...b, expiresAt: new Date(0) })).toThrow(
      "batchUnavailable",
    );
    expect(() => requireBatch(b, 3)).toThrow("batchRevision");
    const doc = {
      _id: "current",
      ...emptyGallery(),
      writeVersion: 4,
      recentCommits: [{ operationId: "private" }],
    } as unknown as GalleryDocument;
    expect(publicGallery(doc)).toEqual(emptyGallery());
  });
  it.each(["jpeg", "png", "webp"] as const)(
    "decodes actual %s bytes and preserves image dimensions",
    async (format) => {
      const bytes = await sharp({
        create: { width: 80, height: 120, channels: 3, background: "#d586a1" },
      })
        [format]()
        .toBuffer();
      const info = await validateImage(bytes, "main");
      expect(info).toMatchObject({
        width: 80,
        height: 120,
        byteLength: bytes.length,
        mimeType: format === "jpeg" ? "image/jpeg" : "image/" + format,
      });
    },
  );
  it("rejects corrupt, unsupported and oversized binary uploads", async () => {
    await expect(validateImage(Buffer.from("not an image"), "main")).rejects.toThrow(
      "invalidImage",
    );
    const gif = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "red" },
    })
      .gif()
      .toBuffer();
    await expect(validateImage(gif, "main")).rejects.toThrow("imageType");
    await expect(validateImage(Buffer.alloc(MAIN_LIMIT + 1), "main")).rejects.toThrow(
      "imageSize",
    );
    await expect(
      validateImage(Buffer.alloc(THUMB_LIMIT + 1), "thumbnail"),
    ).rejects.toThrow("imageSize");
  });
});
describe("Gallery storage publication lifecycle", () => {
  it("does not seed records on a public read", async () => {
    const { db, tables } = memory();
    expect(await readGallery(db)).toEqual(emptyGallery());
    expect(tables.get("gallery")).toEqual([]);
  });
  it("replays exact saves before revision/batch checks and rejects changed operation keys", async () => {
    const { db } = memory();
    const body = input();
    const first = await saveGallery(db, body);
    expect(first.snapshot.revision).toBe(0);
    expect((await saveGallery(db, body)).replayed).toBe(true);
    await expect(
      saveGallery(db, { ...body, confirmedRemovalIds: [randomUUID()] }),
    ).rejects.toThrow("operation");
    await expect(saveGallery(db, { ...input(), expectedRevision: 99 })).rejects.toThrow(
      "conflict",
    );
  });
  it("creates batches idempotently and enforces two open batches", async () => {
    const { db } = memory();
    const body = { clientBatchId: randomUUID(), expectedRevision: 0 };
    expect((await createBatch(db, body))._id).toBe(body.clientBatchId);
    expect((await createBatch(db, body))._id).toBe(body.clientBatchId);
    await expect(createBatch(db, { ...body, expectedRevision: 1 })).rejects.toThrow(
      "batchRevision",
    );
    await createBatch(db, { clientBatchId: randomUUID(), expectedRevision: 0 });
    await expect(
      createBatch(db, { clientBatchId: randomUUID(), expectedRevision: 0 }),
    ).rejects.toThrow("stagingLimit");
  });
  it("stages validated binary privately, retries without duplicates, then atomically publishes and removes", async () => {
    const { db, tables } = memory();
    const batchId = randomUUID(),
      fileId = randomUUID();
    await createBatch(db, { clientBatchId: batchId, expectedRevision: 0 });
    const bytes = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "gold" },
    })
      .webp()
      .toBuffer();
    const staged = await uploadPhoto(db, batchId, fileId, bytes, bytes);
    expect((await readGallery(db)).items).toEqual([]);
    expect((await uploadPhoto(db, batchId, fileId, bytes, bytes)).mediaId).toBe(
      staged.mediaId,
    );
    expect(tables.get("media")).toHaveLength(1);
    expect((tables.get("media")![0].main as { bytes: unknown }).bytes).toBeInstanceOf(
      Binary,
    );
    const other = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "red" },
    })
      .webp()
      .toBuffer();
    await expect(uploadPhoto(db, batchId, fileId, other, bytes)).rejects.toThrow(
      "fileKeyReused",
    );
    const body = {
      ...input(),
      mediaBatchId: batchId,
      items: [{ id: randomUUID(), mediaId: staged.mediaId, selectionIndex: 0 }],
    };
    const result = await saveGallery(db, body);
    expect(result.snapshot.revision).toBe(1);
    expect(result.snapshot.items).toHaveLength(1);
    expect((await saveGallery(db, body)).replayed).toBe(true);
    await expect(
      saveGallery(db, { ...input(), expectedRevision: 1, items: [] }),
    ).rejects.toThrow("removalConfirmation");
    expect((await readGallery(db)).items).toHaveLength(1);
    const removed = await saveGallery(db, {
      ...input(),
      expectedRevision: 1,
      confirmedRemovalIds: [body.items[0].id],
    });
    expect(removed.snapshot.items).toEqual([]);
    expect(tables.get("media")).toHaveLength(1);
  });
});

it("enforces the private staging byte budget before inserting another photo", async () => {
  const { db, collection } = memory();
  const id = randomUUID();
  await createBatch(db, { clientBatchId: id, expectedRevision: 0 });
  await collection("media").insertOne({
    _id: randomUUID(),
    scope: "gallery",
    batchId: randomUUID(),
    main: { byteLength: 100000000 },
    thumbnail: { byteLength: 0 },
  });
  const bytes = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(uploadPhoto(db, id, randomUUID(), bytes, bytes)).rejects.toThrow(
    "stagingLimit",
  );
  expect((await readGallery(db)).items).toEqual([]);
});
