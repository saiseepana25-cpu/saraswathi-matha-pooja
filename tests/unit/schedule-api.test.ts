import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({
  getServerEnvironment: () => ({
    APP_ENV: "development",
    APP_ORIGIN: "http://localhost:3000",
  }),
}));
vi.mock("@/server/auth/service", () => ({ requireOrganiser: vi.fn() }));
vi.mock("@/server/db/mongodb", () => ({ getDatabase: vi.fn() }));
import { requireOrganiser } from "@/server/auth/service";
import { getDatabase } from "@/server/db/mongodb";
import { AuthError } from "@/server/auth/http";
import { PUT, GET } from "@/app/api/schedule/route";
import { emptySection } from "@/lib/schedule";

const findOne = vi.fn();
const insertOne = vi.fn();
const csrf = "a".repeat(64);
function request(body: unknown, cookie = true) {
  return new NextRequest("http://localhost:3000/api/schedule", {
    method: "PUT",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
      ...(cookie ? { cookie: "saraswathi_csrf=" + csrf, "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("APP_ENV", "development");
  vi.mocked(requireOrganiser).mockResolvedValue({
    username: "mock-organiser",
    expiresAt: new Date().toISOString(),
  });
  vi.mocked(getDatabase).mockResolvedValue({
    collection: () => ({ findOne, insertOne }),
  } as unknown as Awaited<ReturnType<typeof getDatabase>>);
  findOne.mockResolvedValue(null);
  insertOne.mockResolvedValue({ acknowledged: true });
});
describe("schedule API boundary", () => {
  it("rejects requests without CSRF before reading or writing content", async () => {
    const response = await PUT(request({}, false));
    expect(response.status).toBe(403);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("rejects expired or anonymous sessions before processing a save", async () => {
    vi.mocked(requireOrganiser).mockRejectedValue(new AuthError(401, "expired"));
    const response = await PUT(request({}));
    expect(response.status).toBe(401);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("rejects invalid schedule payloads without changing records", async () => {
    const response = await PUT(
      request({
        section: "programme",
        expectedRevision: 0,
        operationId: crypto.randomUUID(),
        data: { days: [] },
      }),
    );
    expect(response.status).toBe(422);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("returns pending empty dates without seeding sample content", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.snapshot.data.programme).toEqual(emptySection());
    expect(insertOne).not.toHaveBeenCalled();
  });
  it("returns no-store public snapshots after an authorised save", async () => {
    const response = await PUT(
      request({
        section: "programme",
        expectedRevision: 0,
        operationId: crypto.randomUUID(),
        data: emptySection(),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.snapshot).not.toHaveProperty("recentCommits");
    expect(insertOne).toHaveBeenCalledTimes(1);
  });
});
