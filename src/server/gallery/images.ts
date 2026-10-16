import sharp from "sharp";
import { createHash } from "node:crypto";
import { imageTypes, MAIN_LIMIT, THUMB_LIMIT, MAX_PIXELS } from "@/lib/gallery";
import { AuthError } from "@/server/auth/http";
export async function validateImage(bytes: Buffer, variant: "main" | "thumbnail") {
  if (!bytes.length || bytes.length > (variant === "main" ? MAIN_LIMIT : THUMB_LIMIT))
    throw new AuthError(413, "imageSize");
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: MAX_PIXELS,
      animated: false,
      failOn: "warning",
    }).metadata();
    const mimeType =
      metadata.format === "jpeg"
        ? "image/jpeg"
        : metadata.format === "png"
          ? "image/png"
          : metadata.format === "webp"
            ? "image/webp"
            : null;
    if (!mimeType || !imageTypes.includes(mimeType))
      throw new AuthError(415, "imageType");
    if (
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1 ||
      metadata.width * metadata.height > MAX_PIXELS
    )
      throw new AuthError(422, "invalidImage");
    // Force a complete decode, not just a header read. Output dimensions are bounded.
    await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" })
      .resize(1, 1)
      .raw()
      .toBuffer();
    const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    return {
      mimeType,
      width: rotated ? metadata.height : metadata.width,
      height: rotated ? metadata.width : metadata.height,
      byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(422, "invalidImage");
  }
}
