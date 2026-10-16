import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/server/db/mongodb";
import { AuthError, reply } from "@/server/auth/http";
import { boundedBody, galleryFailure, protectGallery } from "@/server/gallery/http";
import { uploadPhoto } from "@/server/gallery/store";
export const runtime = "nodejs";
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ batchId: string; fileId: string }> },
) {
  try {
    const recheck = await protectGallery(request);
    const { batchId, fileId } = await context.params;
    if (![batchId, fileId].every((id) => z.uuid().safeParse(id).success))
      throw new AuthError(400, "invalid");
    const contentType = request.headers.get("content-type");
    if (!contentType?.startsWith("multipart/form-data;"))
      throw new AuthError(415, "invalid");
    const bytes = await boundedBody(request, 3_400_000);
    let form: FormData;
    try {
      form = await new Response(bytes, {
        headers: { "Content-Type": contentType },
      }).formData();
    } catch {
      throw new AuthError(400, "invalid");
    }
    if (
      [...form.keys()].length !== 2 ||
      form.getAll("main").length !== 1 ||
      form.getAll("thumbnail").length !== 1
    )
      throw new AuthError(400, "invalid");
    const main = form.get("main"),
      thumb = form.get("thumbnail");
    if (!(main instanceof File) || !(thumb instanceof File))
      throw new AuthError(400, "invalid");
    const db = await getDatabase();
    recheck();
    const result = await uploadPhoto(
      db,
      batchId,
      fileId,
      Buffer.from(await main.arrayBuffer()),
      Buffer.from(await thumb.arrayBuffer()),
      recheck,
    );
    return reply(result);
  } catch (error) {
    return galleryFailure(error);
  }
}
