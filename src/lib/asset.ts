/**
 * Normalisiert importierte Bild-Assets auf eine URL.
 * Vite liefert beim `import x from "*.jpg"` einen String, Next.js ein `StaticImageData`-Objekt
 * (`{ src, width, height }`). So funktionieren beide Builds mit demselben Import.
 */
export function assetSrc(mod: unknown): string {
  if (typeof mod === "string") return mod;
  if (mod && typeof mod === "object" && "src" in mod) {
    const src = (mod as { src: unknown }).src;
    if (typeof src === "string") return src;
  }
  return "";
}
