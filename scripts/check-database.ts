import { MongoClient } from "mongodb";
import { parseServerEnvironment } from "../src/config/env";

async function main() {
  const env = parseServerEnvironment(process.env);
  const client = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    await client.db(env.MONGODB_DB).command({ ping: 1 });
    console.log(`Database connection verified: ${env.MONGODB_DB}. No data was changed.`);
  } finally {
    await client.close();
  }
}

main().catch(() => {
  console.error("Database check failed. Check .env.local and Atlas access settings.");
  process.exitCode = 1;
});
