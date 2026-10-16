import type { NextRequest } from "next/server";
import { gallerySaveSchema } from "@/lib/gallery";
import { getDatabase } from "@/server/db/mongodb";
import { reply } from "@/server/auth/http";
import { galleryFailure, galleryJson, protectGallery } from "@/server/gallery/http";
import { readGallery, saveGallery } from "@/server/gallery/store";
export const runtime = "nodejs";
export async function GET() {
  try {
    return reply({ snapshot: await readGallery(await getDatabase()) });
  } catch (error) {
    return galleryFailure(error);
  }
}
export async function PUT(request: NextRequest) {
  try {
    const recheck = await protectGallery(request);
    const input = gallerySaveSchema.safeParse(await galleryJson(request));
    if (!input.success) return reply({ error: "validation" }, 422);
    const db = await getDatabase();
    recheck();
    return reply(await saveGallery(db, input.data, recheck));
  } catch (error) {
    return galleryFailure(error);
  }
}
