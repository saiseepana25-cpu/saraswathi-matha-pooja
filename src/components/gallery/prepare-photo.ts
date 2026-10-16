import {
  imageTypes,
  ORIGINAL_LIMIT,
  MAIN_LIMIT,
  THUMB_LIMIT,
  MAX_PIXELS,
} from "@/lib/gallery";
export type PreparedPhoto = {
  main: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
};
export class PhotoPreparationError extends Error {}
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!imageTypes.includes(file.type as (typeof imageTypes)[number]))
    throw new PhotoPreparationError("imageType");
  if (!file.size || file.size > ORIGINAL_LIMIT)
    throw new PhotoPreparationError("originalSize");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoPreparationError("invalidImage");
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS)
      throw new PhotoPreparationError("invalidImage");
    async function render(maxEdge: number, quality: number) {
      const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) throw new PhotoPreparationError("prepareFailed");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new PhotoPreparationError("prepareFailed")),
          "image/webp",
          quality,
        ),
      );
      return { blob, width: canvas.width, height: canvas.height };
    }
    let main: Blob = file,
      width = bitmap.width,
      height = bitmap.height;
    if (file.size > MAIN_LIMIT) {
      let edge = Math.min(3200, Math.max(width, height));
      for (let step = 0; step < 8; step++) {
        const output = await render(edge, step < 3 ? 0.92 - step * 0.08 : 0.74);
        main = output.blob;
        width = output.width;
        height = output.height;
        if (main.size <= MAIN_LIMIT) break;
        if (step >= 2) edge = Math.floor(edge * 0.8);
      }
      if (main.size > MAIN_LIMIT) throw new PhotoPreparationError("prepareFailed");
    }
    let thumbnail = (await render(480, 0.82)).blob;
    if (thumbnail.size > THUMB_LIMIT) thumbnail = (await render(320, 0.65)).blob;
    if (thumbnail.size > THUMB_LIMIT) throw new PhotoPreparationError("prepareFailed");
    return { main, thumbnail, width, height };
  } finally {
    bitmap.close();
  }
}
