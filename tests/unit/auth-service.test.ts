import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/mongodb", () => ({ getDatabase: vi.fn() }));
vi.mock("@/server/auth/password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/password")>()),
  verifyPassword: vi.fn(),
}));
import { getDatabase } from "@/server/db/mongodb";
import { verifyPassword } from "@/server/auth/password";
import { currentOrganiser, signIn, signOut } from "@/server/auth/service";
import { digest, newSession } from "@/server/auth/session-core";

const records = {
  organisers: { findOne: vi.fn() },
  admin_sessions: {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    deleteOne: vi.fn(),
    createIndex: vi.fn(),
  },
  login_attempts: { findOneAndUpdate: vi.fn(), createIndex: vi.fn() },
};
const request = (token?: string, csrf?: string) =>
  new NextRequest("http://localhost:3000/api/auth/login", {
    headers: token
      ? { cookie: "saraswathi_session=" + token + "; saraswathi_csrf=" + csrf }
      : {},
  });
beforeEach(() => {
  vi.stubEnv("APP_ENV", "development");
  vi.mocked(getDatabase).mockResolvedValue({
    collection: (name: string) => records[name as keyof typeof records],
  } as unknown as Awaited<ReturnType<typeof getDatabase>>);
  records.organisers.findOne.mockResolvedValue({
    _id: "primary",
    enabled: true,
    usernameNormalized: "test-organiser",
    password: {},
  });
  records.admin_sessions.insertOne.mockResolvedValue({ acknowledged: true });
  records.admin_sessions.deleteOne.mockResolvedValue({ deletedCount: 1 });
  records.admin_sessions.createIndex.mockResolvedValue("expiresAt_1");
  records.login_attempts.createIndex.mockResolvedValue("expiresAt_1");
  records.login_attempts.findOneAndUpdate.mockResolvedValue({ count: 1 });
  vi.mocked(verifyPassword).mockResolvedValue(true);
});
describe("private authentication service", () => {
  it("does not contact Atlas for anonymous visitors", async () => {
    expect(await currentOrganiser(request())).toBeNull();
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("checks expiry and CSRF before returning the organiser", async () => {
    const { token, csrf, session } = newSession();
    records.admin_sessions.findOne.mockResolvedValue(session);
    expect(await currentOrganiser(request(token, csrf))).toEqual({
      username: "test-organiser",
      expiresAt: session.expiresAt.toISOString(),
    });
    expect(await currentOrganiser(request(token, "a".repeat(64)))).toBeNull();
    records.admin_sessions.findOne.mockResolvedValue(
      newSession(new Date(Date.now() - 10_800_001)).session,
    );
    expect(await currentOrganiser(request(token, csrf))).toBeNull();
  });
  it("denies a disabled or missing account even if the session is valid", async () => {
    const { token, csrf, session } = newSession();
    records.admin_sessions.findOne.mockResolvedValue(session);
    records.organisers.findOne.mockResolvedValue(null);
    expect(await currentOrganiser(request(token, csrf))).toBeNull();
    expect(records.organisers.findOne).toHaveBeenCalledWith(
      { _id: "primary", enabled: true },
      { projection: { usernameNormalized: 1 } },
    );
  });
  it("creates a session only after checking username and password", async () => {
    const result = await signIn(request(), {
      username: " TEST-ORGANISER ",
      password: "Test@123",
    });
    expect(result.user.username).toBe("test-organiser");
    expect(records.admin_sessions.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: digest(result.token),
        csrfDigest: digest(result.csrf),
      }),
      expect.objectContaining({ writeConcern: { w: "majority", wtimeoutMS: 5000 } }),
    );
  });
  it("uses the same credential failure for wrong passwords and unknown usernames", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(
      signIn(request(), { username: "test-organiser", password: "Test@123" }),
    ).rejects.toMatchObject({ status: 401, code: "credentials" });
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await expect(
      signIn(request(), { username: "someone-else", password: "Test@123" }),
    ).rejects.toMatchObject({ status: 401, code: "credentials" });
    expect(records.admin_sessions.insertOne).not.toHaveBeenCalled();
  });
  it("limits attempts before expensive password verification", async () => {
    records.login_attempts.findOneAndUpdate.mockResolvedValue({ count: 11 });
    await expect(
      signIn(request(), { username: "test-organiser", password: "Test@123" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(verifyPassword).not.toHaveBeenCalled();
  });
  it("deletes only the current session when signing out", async () => {
    const { token, csrf } = newSession();
    await signOut(request(token, csrf));
    expect(records.admin_sessions.deleteOne).toHaveBeenCalledWith({ _id: digest(token) });
  });
});
