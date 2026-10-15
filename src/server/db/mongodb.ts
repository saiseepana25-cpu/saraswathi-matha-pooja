import "server-only";
import { MongoClient } from "mongodb";
import { getServerEnvironment } from "@/server/env";

const processCache = globalThis as typeof globalThis & {
  saraswathiMongoClient?: Promise<MongoClient>;
};

export async function getDatabase() {
  const env = getServerEnvironment();
  if (!processCache.saraswathiMongoClient) {
    const client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      maxIdleTimeMS: 30_000,
      retryWrites: true,
      writeConcern: { w: "majority", wtimeoutMS: 5_000 },
    });
    processCache.saraswathiMongoClient = client
      .connect()
      .catch(async (error: unknown) => {
        processCache.saraswathiMongoClient = undefined;
        await client.close().catch(() => undefined);
        throw error;
      });
  }
  const client = await processCache.saraswathiMongoClient;
  return client.db(env.MONGODB_DB);
}
