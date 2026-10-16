import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/server/db/mongodb";
import { type GalleryDocument, type MediaDocument } from "@/server/gallery/store";
import { AuthError } from "@/server/auth/http";
import { galleryFailure } from "@/server/gallery/http";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mediaId: string }> },
) {
  try {
    const { mediaId } = await context.params;
    const variant = request.nextUrl.searchParams.get("variant") ?? "thumbnail";
    if (!z.uuid().safeParse(mediaId).success || !["main", "thumbnail"].includes(variant))
      throw new AuthError(404, "notFound");
    const db = await getDatabase();
    // Check the current reference even when processing a conditional/cache request.
    const reference = await db
      .collection<GalleryDocument>("gallery")
      .findOne({ _id: "current", "items.mediaId": mediaId }, { projection: { _id: 1 } });
    if (!reference) throw new AuthError(404, "notFound");
    const key = variant as "main" | "thumbnail";
    const file = await db
      .collection<MediaDocument>("media")
      .findOne({ _id: mediaId, scope: "gallery" }, { projection: { [key]: 1 } });
    if (!file) throw new AuthError(404, "notFound");
    const image = file[key];
    const headers = {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=300, must-revalidate",
      ETag: '"' + image.sha256 + '"',
      "X-Content-Type-Options": "nosniff",
    };
    if (request.headers.get("if-none-match") === headers.ETag) {
      const conditional = new Headers(headers);
      conditional.delete("Content-Length");
      return new Response(null, { status: 304, headers: conditional });
    }
    return new Response(new Uint8Array(image.bytes.buffer), { headers });
  } catch (error) {
    return galleryFailure(error);
  }
}
