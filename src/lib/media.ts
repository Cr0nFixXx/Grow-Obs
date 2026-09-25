import { config } from "./config";

/** Interne Upload-Pfade (`/media/<uuid>`) auf die API-Basis auflösen; alles andere unverändert. */
export function resolveMedia(src: string | undefined | null): string {
  if (!src) return "";
  return src.startsWith("/media/") ? `${config.apiBaseUrl}${src}` : src;
}

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX_EDGE = 1600;
const MAX_BYTES = 1_900_000; // Server-Limit 2 MB, mit Puffer

/**
 * Verkleinert Fotos im Browser (Handy-Fotos haben oft 4–12 MB) auf max. 1600 px Kantenlänge als JPEG.
 * Nebeneffekt gewollt: EXIF-Metadaten (inkl. GPS-Standort) werden dabei entfernt.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    if (file.size > MAX_BYTES) throw new Error("Bild zu groß (max. 2 MB)");
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Bildformat wird nicht unterstützt (JPEG, PNG oder WebP)");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bildverarbeitung nicht verfügbar");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.72, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("Bild konnte nicht ausreichend verkleinert werden");
}
