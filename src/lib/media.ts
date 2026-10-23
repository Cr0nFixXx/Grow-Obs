import { config } from "./config";

/** Interne Upload-Pfade (`/media/<uuid>`) auf die API-Basis auflösen; alles andere unverändert. */
export function resolveMedia(src: string | undefined | null): string {
  if (!src) return "";
  return src.startsWith("/media/") ? `${config.apiBaseUrl}${src}` : src;
}

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const DEFAULT_MAX_BYTES = 1_900_000; // Profil-/Beitragsbilder: klein halten
const LABEL = (bytes: number) => `${Math.round((bytes / 1048576) * 10) / 10}`.replace(".", ",");

export interface PrepareOptions {
  /** HD (nur wenn der Server große Uploads erlaubt): bis 4096 px und höhere JPEG-Qualität statt 1600 px. */
  hd?: boolean;
  /** Zielgröße in Bytes (Server-Limit minus Puffer). */
  maxBytes?: number;
}

/**
 * Verkleinert Fotos im Browser (Handy-Fotos haben oft 4–12 MB) als JPEG: Standard max. 1600 px, HD max. 4096 px.
 * Nebeneffekt gewollt: EXIF-Metadaten (inkl. GPS-Standort) werden dabei entfernt – auch bei HD.
 */
export async function prepareImage(file: Blob, options: PrepareOptions = {}): Promise<Blob> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const edge = options.hd ? 4096 : 1600;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    if (file.size > maxBytes) throw new Error(`Bild zu groß (max. ${LABEL(maxBytes)} MB)`);
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Bildformat wird nicht unterstützt (JPEG, PNG oder WebP)");
  }
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bildverarbeitung nicht verfügbar");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of options.hd ? [0.92, 0.85, 0.72, 0.6, 0.45] : [0.85, 0.72, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error("Bild konnte nicht ausreichend verkleinert werden");
}
