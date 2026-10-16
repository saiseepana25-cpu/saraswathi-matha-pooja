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
import { GET, PUT } from "@/app/api/chandas/route";
import { requireOrganiser } from "@/server/auth/service";
import { getDatabase } from "@/server/db/mongodb";
import { AuthError } from "@/server/auth/http";
const csrf = "a".repeat(64),
  findOne = vi.fn(),
  insertOne = vi.fn();
const body = () => ({
  households: [],
  expectedRevision: 0,
  operationId: crypto.randomUUID(),
});
function request(value: unknown, validCsrf = true, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/chandas", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin,
      ...(validCsrf ? { cookie: "saraswathi_csrf=" + csrf, "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify(value),
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
describe("Chandas API authorisation and validation", () => {
  it("denies missing CSRF and cross-origin saves before database access", async () => {
    expect((await PUT(request(body(), false))).status).toBe(403);
    expect((await PUT(request(body(), true, "https://other.example"))).status).toBe(403);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("denies an expired session before reading the list", async () => {
    vi.mocked(requireOrganiser).mockRejectedValue(new AuthError(401, "expired"));
    expect((await PUT(request(body()))).status).toBe(401);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("rejects mixed Vigraham/money and decimals without writes", async () => {
    for (const contribution of [
      { type: "vigraham", amountRupees: 500 },
      { type: "money", amountRupees: 1.5 },
    ]) {
      const value = {
        ...body(),
        households: [
          { id: crypto.randomUUID(), name: { en: "Sai", te: "సాయి" }, contribution },
        ],
      };
      expect((await PUT(request(value))).status).toBe(422);
    }
    expect(insertOne).not.toHaveBeenCalled();
  });
  it.each([
    { en: "Sai", te: "" },
    { en: "", te: "సాయి" },
  ])("saves a single-language household %j", async (name) => {
    const response = await PUT(
      request({
        ...body(),
        households: [
          { id: crypto.randomUUID(), name, contribution: { type: "pending" } },
        ],
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).snapshot.households[0].name).toEqual(name);
  });
  it("rejects two blank names before any content write", async () => {
    const response = await PUT(
      request({
        ...body(),
        households: [
          {
            id: crypto.randomUUID(),
            name: { en: " ", te: "" },
            contribution: { type: "pending" },
          },
        ],
      }),
    );
    expect(response.status).toBe(422);
    expect(insertOne).not.toHaveBeenCalled();
  });
  it("bounds requests at two megabytes", async () => {
    expect((await PUT(request({ extra: "x".repeat(2_000_001) }))).status).toBe(413);
    expect(insertOne).not.toHaveBeenCalled();
  });
  it("reads missing content without seeding and excludes private fields from saves", async () => {
    const response = await GET();
    expect((await response.json()).snapshot.households).toEqual([]);
    expect(insertOne).not.toHaveBeenCalled();
    const saved = await PUT(request(body()));
    expect(saved.status).toBe(200);
    expect(saved.headers.get("cache-control")).toContain("no-store");
    expect((await saved.json()).snapshot).not.toHaveProperty("recentCommits");
    expect(insertOne).toHaveBeenCalledOnce();
  });
});
