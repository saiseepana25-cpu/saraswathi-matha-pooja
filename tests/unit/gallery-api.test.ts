import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Binary } from "mongodb";
vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({
  getServerEnvironment: () => ({
    APP_ENV: "development",
    APP_ORIGIN: "http://localhost:3000",
  }),
}));
vi.mock("@/server/auth/service", () => ({ requireOrganiser: vi.fn() }));
vi.mock("@/server/db/mongodb", () => ({ getDatabase: vi.fn() }));
import { PUT, GET } from "@/app/api/gallery/route";
import { POST } from "@/app/api/gallery/batches/route";
import { PUT as upload } from "@/app/api/gallery/batches/[batchId]/files/[fileId]/route";
import { GET as media } from "@/app/api/gallery/media/[mediaId]/route";
import { requireOrganiser } from "@/server/auth/service";
import { getDatabase } from "@/server/db/mongodb";
import { AuthError } from "@/server/auth/http";
const csrf = "a".repeat(64);
function request(body: unknown, method = "PUT", valid = true) {
  return new NextRequest("http://localhost:3000/api/gallery", {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...(valid ? { cookie: "saraswathi_csrf=" + csrf, "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("APP_ENV", "development");
  vi.stubEnv("GALLERY_WRITES_PAUSED", "false");
  vi.mocked(requireOrganiser).mockResolvedValue({
    username: "test",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
});
describe("Gallery API trust boundary", () => {
  it("authenticates every mutation before touching content storage", async () => {
    expect((await PUT(request({}, "PUT", false))).status).toBe(403);
    expect((await POST(request({}, "POST", false))).status).toBe(403);
    expect(getDatabase).not.toHaveBeenCalled();
    vi.mocked(requireOrganiser).mockRejectedValue(new AuthError(401, "expired"));
    expect((await PUT(request({}))).status).toBe(401);
    expect(
      (
        await upload(request({}), {
          params: Promise.resolve({
            batchId: crypto.randomUUID(),
            fileId: crypto.randomUUID(),
          }),
        })
      ).status,
    ).toBe(401);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("rejects oversized lists and captions before database access", async () => {
    const body = {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      mediaBatchId: null,
      items: [],
      confirmedRemovalIds: [],
      caption: "not allowed",
    };
    expect((await PUT(request(body))).status).toBe(422);
    expect(getDatabase).not.toHaveBeenCalled();
    expect((await PUT(request({ extra: "x".repeat(100001) }))).status).toBe(413);
  });
  it("requires multipart media and enforces whole-body bounds before parsing", async () => {
    const context = {
      params: Promise.resolve({
        batchId: crypto.randomUUID(),
        fileId: crypto.randomUUID(),
      }),
    };
    expect((await upload(request({}), context)).status).toBe(415);
    const oversized = new NextRequest("http://localhost:3000/api/gallery", {
      method: "PUT",
      headers: {
        origin: "http://localhost:3000",
        cookie: "saraswathi_csrf=" + csrf,
        "x-csrf-token": csrf,
        "content-type": "multipart/form-data; boundary=test",
      },
      body: "x".repeat(3400001),
    });
    expect((await upload(oversized, context)).status).toBe(413);
    expect(getDatabase).not.toHaveBeenCalled();
  });
  it("blocks editing during maintenance and serves honest empty reads", async () => {
    vi.stubEnv("GALLERY_WRITES_PAUSED", "true");
    expect((await PUT(request({}))).status).toBe(503);
    const findOne = vi.fn().mockResolvedValue(null);
    vi.mocked(getDatabase).mockResolvedValue({
      collection: () => ({ findOne }),
    } as unknown as Awaited<ReturnType<typeof getDatabase>>);
    expect((await (await GET()).json()).snapshot.items).toEqual([]);
  });
  it("does not expose staged or removed images, including conditional reads", async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    vi.mocked(getDatabase).mockResolvedValue({
      collection: () => ({ findOne }),
    } as unknown as Awaited<ReturnType<typeof getDatabase>>);
    const id = crypto.randomUUID();
    const response = await media(
      new NextRequest("http://localhost:3000/api/gallery/media/" + id + "?variant=main", {
        headers: { "if-none-match": '"hash"' },
      }),
      { params: Promise.resolve({ mediaId: id }) },
    );
    expect(response.status).toBe(404);
    expect(findOne).toHaveBeenCalledOnce();
  });
  it("returns only the referenced requested variant with bounded caching", async () => {
    const id = crypto.randomUUID(),
      bytes = Buffer.from([1, 2, 3]);
    const galleryFind = vi.fn().mockResolvedValue({ _id: "current" });
    const mediaFind = vi.fn().mockResolvedValue({
      main: {
        mimeType: "image/jpeg",
        byteLength: 3,
        sha256: "hash",
        bytes: new Binary(bytes),
      },
    });
    vi.mocked(getDatabase).mockResolvedValue({
      collection: (name: string) => ({
        findOne: name === "gallery" ? galleryFind : mediaFind,
      }),
    } as unknown as Awaited<ReturnType<typeof getDatabase>>);
    const url = "http://localhost:3000/api/gallery/media/" + id + "?variant=main",
      context = { params: Promise.resolve({ mediaId: id }) };
    const response = await media(new NextRequest(url), context);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    const cached = await media(
      new NextRequest(url, { headers: { "if-none-match": '"hash"' } }),
      context,
    );
    expect(cached.status).toBe(304);
    expect(galleryFind).toHaveBeenCalledTimes(2);
  });
});
