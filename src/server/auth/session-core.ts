import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PROJECT } from "@/config/project";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const isToken = (value: string | undefined): value is string =>
  !!value && /^[a-f0-9]{64}$/.test(value);
export type OrganiserSession = {
  _id: string;
  schemaVersion: 1;
  adminId: "primary";
  csrfDigest: string;
  issuedAt: Date;
  expiresAt: Date;
};
export function newSession(now = new Date()) {
  const token = randomBytes(32).toString("hex");
  const csrf = randomBytes(32).toString("hex");
  const session: OrganiserSession = {
    _id: digest(token),
    schemaVersion: 1,
    adminId: "primary",
    csrfDigest: digest(csrf),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + PROJECT.sessionSeconds * 1000),
  };
  return { token, csrf, session };
}
export function validSession(session: OrganiserSession, csrf: string, now = new Date()) {
  return (
    session.schemaVersion === 1 &&
    session.adminId === "primary" &&
    session.issuedAt instanceof Date &&
    session.expiresAt instanceof Date &&
    session.issuedAt <= now &&
    session.expiresAt > now &&
    session.expiresAt.getTime() - session.issuedAt.getTime() ===
      PROJECT.sessionSeconds * 1000 &&
    isToken(csrf) &&
    /^[a-f0-9]{64}$/.test(session.csrfDigest) &&
    timingSafeEqual(
      Buffer.from(session.csrfDigest, "hex"),
      Buffer.from(digest(csrf), "hex"),
    )
  );
}
export function cookieNames(production: boolean) {
  return {
    session: production ? "__Host-saraswathi_session" : "saraswathi_session",
    csrf: production ? "__Host-saraswathi_csrf" : "saraswathi_csrf",
  };
}
export function trustedOrigin(headers: Headers, expected: string) {
  return (
    headers.get("origin") === new URL(expected).origin &&
    !["cross-site", "none"].includes(headers.get("sec-fetch-site") ?? "")
  );
}
