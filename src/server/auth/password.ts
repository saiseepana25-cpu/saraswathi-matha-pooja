import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export class CredentialValidationError extends Error {}

export type PasswordHash = {
  algorithm: "scrypt";
  saltBase64: string;
  hashBase64: string;
  N: number;
  r: number;
  p: number;
  keyLength: number;
};

const parameters = { N: 131072, r: 8, p: 1, keyLength: 64 } as const;
const maxmem = 256 * 1024 * 1024;

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      parameters.keyLength,
      { N: parameters.N, r: parameters.r, p: parameters.p, maxmem },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
  });
}

export function validatePassword(password: string): void {
  const length = Array.from(password).length;
  if (
    length < 8 ||
    length > 15 ||
    !password.trim() ||
    /[\u0000-\u001f\u007f]/u.test(password)
  ) {
    throw new CredentialValidationError(
      "Use a password of 8–15 characters without control characters.",
    );
  }
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return {
    algorithm: "scrypt",
    saltBase64: salt.toString("base64"),
    hashBase64: hash.toString("base64"),
    ...parameters,
  };
}

export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  // Accept only the supported version/cost; corrupted records cannot request unbounded work.
  if (
    stored.algorithm !== "scrypt" ||
    stored.N !== parameters.N ||
    stored.r !== parameters.r ||
    stored.p !== parameters.p ||
    stored.keyLength !== parameters.keyLength ||
    Array.from(password).length > 15
  )
    return false;
  const salt = Buffer.from(stored.saltBase64, "base64");
  const expected = Buffer.from(stored.hashBase64, "base64");
  if (
    salt.length !== 16 ||
    expected.length !== parameters.keyLength ||
    salt.toString("base64") !== stored.saltBase64 ||
    expected.toString("base64") !== stored.hashBase64
  )
    return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(expected, actual);
}
