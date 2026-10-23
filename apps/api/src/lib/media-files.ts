import { env } from "../env.ts";

/**
 * Datei-Anhänge im Chat (B-81): feste Positivliste statt „alles außer …“. Der Typ wird aus Endung UND Inhalt
 * (Magic Bytes) bestimmt, nie aus dem Header des Clients. Kein HTML/SVG/Skript/Programm; ZIP ist erlaubt (Anwender wählen den Inhalt).
 */
type Check = "pdf" | "zip" | "ole" | "rtf" | "text";
const FILE_TYPES: Record<string, { mime: string; check: Check }> = {
  pdf: { mime: "application/pdf", check: "pdf" },
  doc: { mime: "application/msword", check: "ole" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", check: "zip" },
  xls: { mime: "application/vnd.ms-excel", check: "ole" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", check: "zip" },
  ppt: { mime: "application/vnd.ms-powerpoint", check: "ole" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", check: "zip" },
  odt: { mime: "application/vnd.oasis.opendocument.text", check: "zip" },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", check: "zip" },
  odp: { mime: "application/vnd.oasis.opendocument.presentation", check: "zip" },
  rtf: { mime: "application/rtf", check: "rtf" },
  txt: { mime: "text/plain", check: "text" },
  csv: { mime: "text/csv", check: "text" },
  md: { mime: "text/markdown", check: "text" },
  zip: { mime: "application/zip", check: "zip" },
};
export const FILE_EXTENSIONS = Object.keys(FILE_TYPES);

const startsWith = (bytes: Uint8Array, ...head: number[]) => head.every((value, i) => bytes[i] === value);

function contentMatches(check: Check, bytes: Uint8Array): boolean {
  switch (check) {
    case "pdf": return startsWith(bytes, 0x25, 0x50, 0x44, 0x46); // %PDF
    case "zip": return startsWith(bytes, 0x50, 0x4b, 0x03, 0x04) || startsWith(bytes, 0x50, 0x4b, 0x05, 0x06);
    case "ole": return startsWith(bytes, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case "rtf": return startsWith(bytes, 0x7b, 0x5c, 0x72, 0x74, 0x66); // {\rtf
    case "text": {
      const head = bytes.subarray(0, 8192);
      let control = 0;
      for (const byte of head) {
        if (byte === 0) return false;
        if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
      }
      return control <= head.length * 0.02;
    }
  }
}

/** Dateiname säubern: keine Pfade/Steuerzeichen, höchstens 120 Zeichen (Endung bleibt erhalten). */
export function sanitizeFileName(raw: string | undefined): string {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen sollen hier gerade entfernt werden
  const cleaned = (raw ?? "").normalize("NFC").replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").replace(/^[.\s]+/, "").trim();
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 8 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - ext.length).trimEnd() + ext;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Erlaubte Datei? Liefert den Mime-Typ aus der Positivliste oder `null`. */
export function sniffFile(name: string, bytes: Uint8Array): string | null {
  const entry = FILE_TYPES[fileExtension(name)];
  if (!entry || !bytes.length) return null;
  return contentMatches(entry.check, bytes) ? entry.mime : null;
}

/** `Content-Disposition` mit ASCII-Rückfall und UTF-8-Name (RFC 6266 / 5987). */
export function contentDisposition(disposition: "inline" | "attachment", name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%]/g, "_") || "download";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

const MB = 1024 * 1024;
/** Obergrenze je Upload. Vercel lässt nur ca. 4,5 MB Anfragekörper zu → dort nie mehr als 4,4 MB, egal was konfiguriert ist. */
export function uploadMaxBytes(): number {
  const mb = env.UPLOAD_MAX_MB ?? (process.env.VERCEL ? 4 : 50);
  return Math.floor((process.env.VERCEL ? Math.min(mb, 4.4) : mb) * MB);
}
export function mediaQuotaBytes(): number {
  return Math.floor((env.MEDIA_QUOTA_MB ?? (process.env.VERCEL ? 100 : 1000)) * MB);
}
/** Ab dieser Grenze bietet die Oberfläche „HD“ (Bilder in hoher Auflösung) an – auf Vercel nie. */
export const HD_MIN_BYTES = 10 * MB;
export const uploadConfig = () => ({ maxBytes: uploadMaxBytes(), hdAllowed: uploadMaxBytes() >= HD_MIN_BYTES });
