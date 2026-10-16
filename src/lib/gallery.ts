import { z } from "zod";
export const GALLERY_LIMIT = 60;
export const GALLERY_PAGE_SIZE = 12;
export const ORIGINAL_LIMIT = 7_000_000;
export const MAIN_LIMIT = 3_000_000;
export const THUMB_LIMIT = 200_000;
export const MAX_PIXELS = 60_000_000;
export const imageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type GalleryItem = {
  id: string;
  mediaId: string;
  publishedAt: string;
  width: number;
  height: number;
};
export type GallerySnapshot = {
  items: GalleryItem[];
  revision: number;
  updatedAt: string | null;
};
export const emptyGallery = (): GallerySnapshot => ({
  items: [],
  revision: 0,
  updatedAt: null,
});
export const batchSchema = z
  .object({ clientBatchId: z.uuid(), expectedRevision: z.number().int().nonnegative() })
  .strict();
export const gallerySaveSchema = z
  .object({
    operationId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    mediaBatchId: z.uuid().nullable(),
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            mediaId: z.uuid(),
            selectionIndex: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      )
      .max(GALLERY_LIMIT),
    confirmedRemovalIds: z.array(z.uuid()).max(GALLERY_LIMIT),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const key of ["id", "mediaId"] as const)
      if (new Set(value.items.map((item) => item[key])).size !== value.items.length)
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: "Photos must be unique.",
        });
    const indexes = value.items
      .filter((item) => item.selectionIndex !== null)
      .map((item) => item.selectionIndex);
    if (new Set(indexes).size !== indexes.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Selection order must be unique.",
      });
    if (new Set(value.confirmedRemovalIds).size !== value.confirmedRemovalIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["confirmedRemovalIds"],
        message: "Removals must be unique.",
      });
  });
export type GallerySave = z.infer<typeof gallerySaveSchema>;
export const mediaUrl = (id: string, variant: "main" | "thumbnail") =>
  "/api/gallery/media/" + id + "?variant=" + variant;
