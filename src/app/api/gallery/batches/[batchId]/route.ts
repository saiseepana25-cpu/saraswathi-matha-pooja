import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/server/db/mongodb";
import { requireOrganiser } from "@/server/auth/service";
import { AuthError, reply } from "@/server/auth/http";
import { galleryFailure, protectGallery } from "@/server/gallery/http";
import {
  abandonBatch,
  requireBatch,
  type MediaBatch,
  type MediaDocument,
} from "@/server/gallery/store";
type Context = { params: Promise<{ batchId: string }> };
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: Context) {
  try {
    await requireOrganiser(request);
    const { batchId } = await context.params;
    if (!z.uuid().safeParse(batchId).success) throw new AuthError(404, "notFound");
    const db = await getDatabase();
    const batch = requireBatch(
      await db.collection<MediaBatch>("media_batches").findOne({ _id: batchId }),
    );
    const files = await db
      .collection<MediaDocument>("media")
      .find({ batchId }, { projection: { _id: 1, clientFileId: 1 } })
      .toArray();
    return reply({
      batchId,
      expiresAt: batch.expiresAt.toISOString(),
      files: files.map((file) => ({
        mediaId: file._id,
        clientFileId: file.clientFileId,
      })),
    });
  } catch (error) {
    return galleryFailure(error);
  }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const recheck = await protectGallery(request);
    const { batchId } = await context.params;
    if (!z.uuid().safeParse(batchId).success) throw new AuthError(404, "notFound");
    const db = await getDatabase();
    recheck();
    await abandonBatch(db, batchId, recheck);
    return reply({ abandoned: true });
  } catch (error) {
    return galleryFailure(error);
  }
}
