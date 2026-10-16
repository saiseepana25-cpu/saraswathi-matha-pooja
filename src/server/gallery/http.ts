import type { NextRequest } from "next/server";
import { AuthError, assertOrigin, assertCsrf, reply, failure } from "@/server/auth/http";
import { requireOrganiser } from "@/server/auth/service";
import { GalleryConflict } from "./store";
export async function protectGallery(request: NextRequest) {
  assertOrigin(request);
  assertCsrf(request);
  if (process.env.GALLERY_WRITES_PAUSED === "true")
    throw new AuthError(503, "maintenance");
  const account = await requireOrganiser(request);
  return () => {
    if (Date.parse(account.expiresAt) <= Date.now()) throw new AuthError(401, "expired");
  };
}
export async function boundedBody(request: NextRequest, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, "invalid");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new AuthError(413, "tooLarge");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function galleryJson(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new AuthError(415, "invalid");
  const bytes = await boundedBody(request, 100_000);
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new AuthError(400, "invalid");
  }
}
export function galleryFailure(error: unknown) {
  if (error instanceof GalleryConflict)
    return reply({ error: error.code, snapshot: error.snapshot }, 409);
  return failure(error);
}
