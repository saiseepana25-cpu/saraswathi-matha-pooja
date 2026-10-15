import type { Collection } from "mongodb";
import {
  CredentialValidationError,
  hashPassword,
  validatePassword,
  type PasswordHash,
} from "./password";

export const ORGANISER_ID = "primary" as const;
export type OrganiserAccount = {
  _id: typeof ORGANISER_ID;
  schemaVersion: 1;
  usernameNormalized: string;
  password: PasswordHash;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type OrganiserStore = Pick<Collection<OrganiserAccount>, "findOne" | "insertOne">;

export function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalized)) {
    throw new CredentialValidationError(
      "Use a username of 3–32 letters, numbers, dots, underscores or hyphens, starting with a letter or number.",
    );
  }
  return normalized;
}

export async function hasOrganiser(store: OrganiserStore): Promise<boolean> {
  // Refuse provisioning even if an existing legacy record uses a different ID.
  return (await store.findOne({}, { projection: { _id: 1 } })) !== null;
}

export async function provisionOrganiser(
  store: OrganiserStore,
  username: string,
  password: string,
): Promise<"created" | "exists"> {
  if (await hasOrganiser(store)) return "exists";
  const usernameNormalized = normalizeUsername(username);
  validatePassword(password);
  const passwordHash = await hashPassword(password);
  const now = new Date();
  try {
    // MongoDB's unique _id makes concurrent first runs mutually exclusive.
    await store.insertOne(
      {
        _id: ORGANISER_ID,
        schemaVersion: 1,
        usernameNormalized,
        password: passwordHash,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      { writeConcern: { w: "majority", wtimeoutMS: 10_000 } },
    );
    return "created";
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return "exists";
    }
    // Do not swallow uncertain writes: caller must not claim success.
    throw error;
  }
}
