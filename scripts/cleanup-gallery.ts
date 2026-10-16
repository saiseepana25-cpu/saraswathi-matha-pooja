import { MongoClient } from "mongodb";
import { parseServerEnvironment } from "../src/config/env";
type Gallery = { _id: string; items: { mediaId: string }[]; writeVersion: number };
type Batch = { _id: string; scope: string; state: string; expiresAt: Date };
type Media = {
  _id: string;
  scope: string;
  batchId: string;
  main: { byteLength: number };
  thumbnail: { byteLength: number };
};
async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.GALLERY_WRITES_PAUSED !== "true")
    throw new Error(
      "Pause gallery writes in every running deployment before applying cleanup.",
    );
  const env = parseServerEnvironment(process.env);
  const client = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await client.connect();
    const db = client.db(env.MONGODB_DB);
    await client.withSession((session) =>
      session.withTransaction(
        async () => {
          const gallery = db.collection<Gallery>("gallery");
          const current = await gallery.findOne({ _id: "current" }, { session });
          if (!current) {
            console.log("No gallery state; nothing to reclaim.");
            return;
          }
          if (apply)
            await gallery.updateOne(
              { _id: "current" },
              { $inc: { writeVersion: 1 } },
              { session },
            );
          const referenced = current.items.map((item) => item.mediaId);
          const old = await db
            .collection<Batch>("media_batches")
            .find(
              {
                scope: "gallery",
                $or: [{ state: "abandoned" }, { expiresAt: { $lte: new Date() } }],
              },
              { session },
            )
            .toArray();
          const candidates = await db
            .collection<Media>("media")
            .find(
              {
                scope: "gallery",
                batchId: { $in: old.map((batch) => batch._id) },
                _id: { $nin: referenced },
              },
              {
                session,
                projection: { _id: 1, "main.byteLength": 1, "thumbnail.byteLength": 1 },
              },
            )
            .toArray();
          const bytes = candidates.reduce(
            (sum, file) => sum + file.main.byteLength + file.thumbnail.byteLength,
            0,
          );
          console.log(
            JSON.stringify({
              mode: apply ? "apply" : "preview",
              database: env.MONGODB_DB,
              unreferencedPhotos: candidates.length,
              reclaimableBytes: bytes,
            }),
          );
          if (!apply) return;
          // Publication shares the same gallery lock; references cannot change concurrently.
          const checked = await gallery.findOne({ _id: "current" }, { session });
          const safe = candidates
            .map((file) => file._id)
            .filter((id) => !checked!.items.some((item) => item.mediaId === id));
          if (safe.length)
            await db
              .collection<Media>("media")
              .deleteMany({ scope: "gallery", _id: { $in: safe } }, { session });
          for (const batch of old) {
            const remains = await db
              .collection<Media>("media")
              .countDocuments({ batchId: batch._id }, { session });
            if (!remains)
              await db
                .collection<Batch>("media_batches")
                .deleteOne({ _id: batch._id, scope: "gallery" }, { session });
          }
          console.log(
            "Unreferenced eligible uploads reclaimed. Published photos were preserved.",
          );
        },
        { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
      ),
    );
  } finally {
    await client.close();
  }
}
main().catch(() => {
  console.error(
    "Gallery cleanup failed. Check Atlas connectivity, database permissions and the pause setting. No cleanup success is claimed.",
  );
  process.exitCode = 1;
});
