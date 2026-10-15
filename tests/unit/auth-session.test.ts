import { describe, expect, it } from "vitest";
import {
  cookieNames,
  digest,
  isToken,
  newSession,
  trustedOrigin,
  validSession,
} from "@/server/auth/session-core";

describe("absolute organiser sessions", () => {
  it("stores only opaque token digests and expires exactly three hours after sign-in", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    const { token, csrf, session } = newSession(now);
    expect(isToken(token)).toBe(true);
    expect(isToken(csrf)).toBe(true);
    expect(token).not.toBe(csrf);
    expect(session._id).toBe(digest(token));
    expect(session.csrfDigest).toBe(digest(csrf));
    expect(JSON.stringify(session)).not.toContain(token);
    expect(session.expiresAt.getTime() - now.getTime()).toBe(10_800_000);
    expect(validSession(session, csrf, now)).toBe(true);
    expect(validSession(session, csrf, new Date("2026-10-15T12:59:59Z"))).toBe(true);
    expect(validSession(session, csrf, session.expiresAt)).toBe(false);
    expect(validSession(session, "a".repeat(64), now)).toBe(false);
    expect(
      validSession(
        { ...session, expiresAt: new Date("2026-10-15T14:00:00Z") },
        csrf,
        now,
      ),
    ).toBe(false);
  });
  it("requires the exact configured origin for mutations", () => {
    expect(
      trustedOrigin(
        new Headers({ origin: "https://puja.example", "sec-fetch-site": "same-origin" }),
        "https://puja.example",
      ),
    ).toBe(true);
    for (const origin of [
      "https://other.example",
      "null",
      "https://puja.example.evil.test",
    ]) {
      expect(trustedOrigin(new Headers({ origin }), "https://puja.example")).toBe(false);
    }
    expect(trustedOrigin(new Headers(), "https://puja.example")).toBe(false);
    expect(
      trustedOrigin(
        new Headers({ origin: "https://puja.example", "sec-fetch-site": "cross-site" }),
        "https://puja.example",
      ),
    ).toBe(false);
  });
  it("uses secure host-only cookie names in production and local HTTP names for development", () => {
    expect(cookieNames(true).session).toBe("__Host-saraswathi_session");
    expect(cookieNames(true).csrf).toBe("__Host-saraswathi_csrf");
    expect(cookieNames(false).session).toBe("saraswathi_session");
  });
});
