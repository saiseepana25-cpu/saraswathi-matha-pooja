import type { NextRequest } from "next/server";
import { batchSchema } from "@/lib/gallery";
import { getDatabase } from "@/server/db/mongodb";
import { reply } from "@/server/auth/http";
import { galleryFailure, galleryJson, protectGallery } from "@/server/gallery/http";
import { createBatch } from "@/server/gallery/store";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const recheck = await protectGallery(request);
    const input = batchSchema.safeParse(await galleryJson(request));
    if (!input.success) return reply({ error: "validation" }, 422);
    const db = await getDatabase();
    recheck();
    const batch = await createBatch(db, input.data, recheck);
    return reply({ batchId: batch._id, expiresAt: batch.expiresAt.toISOString() });
  } catch (error) {
    return galleryFailure(error);
  }
}
