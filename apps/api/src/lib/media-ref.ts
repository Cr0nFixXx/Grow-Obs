import { z } from "zod";

/** Interner Media-Pfad (von POST /media geliefert). Wird im Frontend mit der API-Basis aufgelöst. */
export const MEDIA_PATH = /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Bildreferenz: eigener Upload (`/media/<uuid>`) oder externe HTTPS-URL. */
export const imageRef = z.string().trim().max(500).refine(
  (value) => MEDIA_PATH.test(value) || (/^https:\/\//.test(value) && z.string().url().safeParse(value).success),
  "Bild muss ein eigener Upload oder eine HTTPS-URL sein",
);

/** Erkennt das echte Format anhand der Magic Bytes (Content-Type-Header ist nicht vertrauenswürdig). */
export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
