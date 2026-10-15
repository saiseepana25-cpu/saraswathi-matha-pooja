import "server-only";
import type { NextRequest } from "next/server";
import { getDatabase } from "@/server/db/mongodb";
import { normalizeUsername, type OrganiserAccount } from "./provision-organiser";
import { validatePassword, verifyPassword, type PasswordHash } from "./password";
import {
  digest,
  isToken,
  newSession,
  validSession,
  type OrganiserSession,
} from "./session-core";
import { AuthError, tokens } from "./http";

type Attempt = { _id: string; count: number; expiresAt: Date };
const dummy: PasswordHash = {
  algorithm: "scrypt",
  N: 131072,
  r: 8,
  p: 1,
  keyLength: 64,
  saltBase64: Buffer.alloc(16).toString("base64"),
  hashBase64: Buffer.alloc(64).toString("base64"),
};
let indexPromise: Promise<unknown> | undefined;
async function authDatabase() {
  const db = await getDatabase();
  indexPromise ??= Promise.all([
    db
      .collection("admin_sessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("login_attempts")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).catch((error) => {
    indexPromise = undefined;
    throw error;
  });
  await indexPromise;
  return db;
}
export async function currentOrganiser(request: NextRequest) {
  const { token, csrf } = tokens(request);
  if (!isToken(token) || !isToken(csrf)) return null;
  const db = await getDatabase();
  const session = await db
    .collection<OrganiserSession>("admin_sessions")
    .findOne({ _id: digest(token) });
  if (!session || !validSession(session, csrf)) return null;
  const account = await db
    .collection<OrganiserAccount>("organisers")
    .findOne(
      { _id: "primary", enabled: true },
      { projection: { usernameNormalized: 1 } },
    );
  if (!account) return null;
  return {
    username: account.usernameNormalized,
    expiresAt: session.expiresAt.toISOString(),
  };
}
export async function requireOrganiser(request: NextRequest) {
  const account = await currentOrganiser(request);
  if (!account) throw new AuthError(401, "expired");
  return account;
}
async function takeAttempt(key: string, seconds: number, limit: number) {
  const db = await authDatabase();
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const _id = digest(key + ":" + bucket);
  const collection = db.collection<Attempt>("login_attempts");
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expiresAt: new Date((bucket + 2) * seconds * 1000) },
  };
  let result;
  try {
    result = await collection.findOneAndUpdate({ _id }, update, {
      upsert: true,
      returnDocument: "after",
    });
  } catch (error) {
    if (!(typeof error === "object" && error && "code" in error && error.code === 11000))
      throw error;
    result = await collection.findOneAndUpdate({ _id }, update, {
      returnDocument: "after",
    });
  }
  if (!result || result.count > limit)
    throw new AuthError(
      429,
      "limited",
      Math.max(1, Math.ceil(((bucket + 1) * seconds * 1000 - Date.now()) / 1000)),
    );
}
export async function signIn(
  request: NextRequest,
  input: { username: string; password: string },
) {
  let username: string;
  try {
    username = normalizeUsername(input.username);
    validatePassword(input.password);
  } catch {
    throw new AuthError(400, "invalid");
  }
  // The global bucket also bounds attempts when an IP header is unavailable/untrusted.
  const ip = process.env.VERCEL
    ? (request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown")
    : "local";
  await takeAttempt("global", 60, 10);
  await takeAttempt("ip:" + digest(ip), 900, 5);
  const db = await authDatabase();
  const account = await db
    .collection<OrganiserAccount>("organisers")
    .findOne({ _id: "primary" });
  const matches = await verifyPassword(input.password, account?.password ?? dummy);
  if (!account || !account.enabled || account.usernameNormalized !== username || !matches)
    throw new AuthError(401, "credentials");
  const { token, csrf, session } = newSession();
  await db
    .collection<OrganiserSession>("admin_sessions")
    .insertOne(session, { writeConcern: { w: "majority", wtimeoutMS: 5000 } });
  const old = tokens(request).token;
  if (isToken(old))
    await db
      .collection<OrganiserSession>("admin_sessions")
      .deleteOne({ _id: digest(old) });
  return {
    token,
    csrf,
    user: {
      username: account.usernameNormalized,
      expiresAt: session.expiresAt.toISOString(),
    },
    expiresAt: session.expiresAt,
  };
}
export async function signOut(request: NextRequest) {
  const token = tokens(request).token;
  if (isToken(token)) {
    const db = await getDatabase();
    await db
      .collection<OrganiserSession>("admin_sessions")
      .deleteOne({ _id: digest(token) });
  }
}
