import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/service", () => ({ currentOrganiser: vi.fn() }));

import { currentOrganiser } from "@/server/auth/service";
import { GET } from "@/app/api/auth/session/route";

type User = Awaited<ReturnType<typeof currentOrganiser>>;
const user = {
  username: "mock-organiser",
  expiresAt: "2026-10-16T12:30:00.000Z",
};
function request(token = "a") {
  return new NextRequest("https://puja.example/api/auth/session", {
    headers: {
      cookie:
        "saraswathi_session=" + token.repeat(64) + "; saraswathi_csrf=" + "c".repeat(64),
    },
  });
}

beforeEach(() => {
  vi.mocked(currentOrganiser).mockReset();
});

describe("read-only organiser session probes", () => {
  it("returns anonymous state without setting cookies", async () => {
    vi.mocked(currentOrganiser).mockResolvedValue(null);
    const response = await GET(new NextRequest("https://puja.example/api/auth/session"));
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not clear cookies for expired or revoked tokens", async () => {
    vi.mocked(currentOrganiser).mockResolvedValue(null);
    const response = await GET(request());
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("cannot erase a fresh login when an older probe completes later", async () => {
    let completeOldProbe!: (value: User) => void;
    vi.mocked(currentOrganiser).mockImplementationOnce(
      () =>
        new Promise<User>((resolve) => {
          completeOldProbe = resolve;
        }),
    );
    const oldProbe = GET(request("a"));
    vi.mocked(currentOrganiser).mockResolvedValueOnce(user);
    const freshProbe = await GET(request("b"));
    expect(await freshProbe.json()).toEqual({ user });
    completeOldProbe(null);
    const staleResponse = await oldProbe;
    expect(await staleResponse.json()).toEqual({ user: null });
    expect(staleResponse.headers.has("set-cookie")).toBe(false);
    expect(freshProbe.headers.has("set-cookie")).toBe(false);
  });

  it("returns the original expiry without renewing cookies", async () => {
    vi.mocked(currentOrganiser).mockResolvedValue(user);
    const response = await GET(request());
    expect(await response.json()).toEqual({ user });
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("reports storage failure without changing cookies", async () => {
    vi.mocked(currentOrganiser).mockRejectedValue(new Error("private storage details"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
