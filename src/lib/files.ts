/** Datei-Anhänge im Chat (B-81): Positivliste wie auf dem Server (`apps/api/src/lib/media-files.ts`). */
export const FILE_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv", "md", "zip"] as const;
export const ACCEPTED_FILE_TYPES = FILE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
export const MAX_ATTACHMENTS = 10;
export const FILE_TYPES_HINT = "PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${(mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10).toString().replace(".", ",")} MB`;
}

export const fileExt = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** Fehlertext, wenn die Datei nicht gesendet werden darf (Typ oder Größe); sonst `null`. Der Server prüft zusätzlich den Inhalt. */
export function fileProblem(file: { name: string; size: number }, maxBytes: number): string | null {
  if (!(FILE_EXTENSIONS as readonly string[]).includes(fileExt(file.name))) return `Dateityp nicht erlaubt (${FILE_TYPES_HINT})`;
  if (file.size <= 0) return "Die Datei ist leer";
  if (file.size > maxBytes) return `Zu groß (${formatBytes(file.size)}, erlaubt sind ${formatBytes(maxBytes)})`;
  return null;
}

export type FileGlyph = "pdf" | "doc" | "sheet" | "slides" | "zip" | "text";
export function fileGlyph(name: string): FileGlyph {
  const ext = fileExt(name);
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "doc";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "sheet";
  if (["ppt", "pptx", "odp"].includes(ext)) return "slides";
  if (ext === "zip") return "zip";
  return "text";
}
