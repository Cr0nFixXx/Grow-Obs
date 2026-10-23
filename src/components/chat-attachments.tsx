import { useCallback, useEffect, useRef, useState } from "react";
import { File as FileIcon, FileArchive, FileSpreadsheet, FileText, Paperclip, Presentation, RotateCcw, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useServices } from "@/data/DataContext";
import { useToast } from "@/components/Toast";
import { Popover, PopoverItem, SmartImage, Spinner, type LightboxImage } from "@/components/ui";
import { uploadWithRetry } from "@/components/media";
import { ACCEPTED_IMAGE_TYPES, prepareImage, resolveMedia } from "@/lib/media";
import { ACCEPTED_FILE_TYPES, FILE_TYPES_HINT, MAX_ATTACHMENTS, fileGlyph, fileProblem, formatBytes, type FileGlyph } from "@/lib/files";
import { sendErrorText } from "@/lib/chat-errors";
import type { ChatAttachment, ChatMessage, UploadConfig } from "@/services/interfaces";

/* ============================ Anhänge einer Nachricht ============================ */

/** Anhänge einer Nachricht; ältere Nachrichten (und der Mock) haben nur `image`. */
export function messageAttachments(m: Pick<ChatMessage, "attachments" | "image">): ChatAttachment[] {
  if (m.attachments?.length) return m.attachments;
  return m.image ? [{ path: m.image, kind: "image", name: "", size: 0, mime: "" }] : [];
}

const GLYPHS: Record<FileGlyph, typeof FileIcon> = { pdf: FileText, doc: FileText, sheet: FileSpreadsheet, slides: Presentation, zip: FileArchive, text: FileIcon };
const GLYPH_TONE: Record<FileGlyph, string> = { pdf: "bg-red-500/90", doc: "bg-blue-500/90", sheet: "bg-green-600/90", slides: "bg-orange-500/90", zip: "bg-amber-600/90", text: "bg-slate-500/90" };

export function FileGlyphBadge({ name, className }: { name: string; className?: string }) {
  const glyph = fileGlyph(name);
  const Cmp = GLYPHS[glyph];
  return <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-white", GLYPH_TONE[glyph], className)} aria-hidden><Cmp className="size-5" /></span>;
}

/** Link zum Herunterladen: der Server liefert Dateien immer mit `Content-Disposition: attachment`. */
export const downloadHref = (path: string, image = false) => `${resolveMedia(path)}${image && path.startsWith("/media/") ? "?download=1" : ""}`;

function ImageGrid({ images, onOpen }: { images: ChatAttachment[]; onOpen: (index: number) => void }) {
  const shown = images.slice(0, 4);
  const extra = images.length - shown.length;
  const single = images.length === 1;
  return (
    <div data-testid="image-grid" className={cn("grid gap-0.5 overflow-hidden rounded-xl", single ? "w-64 max-w-full grid-cols-1" : "w-64 max-w-full grid-cols-2")}>
      {shown.map((image, i) => (
        <button
          key={`${image.path}-${i}`}
          type="button"
          onClick={() => onOpen(i)}
          aria-label={images.length > 1 ? `Bild ${i + 1} von ${images.length} vergrößern` : "Bild vergrößern"}
          className={cn("relative block cursor-zoom-in overflow-hidden bg-surface-2", single ? "aspect-[4/3]" : images.length === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square")}
        >
          <SmartImage src={image.path} alt={image.name || "Bild-Anhang"} className="size-full" />
          {extra > 0 && i === shown.length - 1 && (
            <span data-testid="image-more" className="absolute inset-0 grid place-items-center bg-black/55 text-xl font-semibold text-white">+{extra}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function FileRow({ file, mine }: { file: ChatAttachment; mine: boolean }) {
  const name = file.name || "Datei";
  return (
    <a
      href={downloadHref(file.path)}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} herunterladen`}
      className={cn("flex w-64 max-w-full items-center gap-2.5 rounded-xl px-2 py-2 transition", mine ? "bg-black/10 hover:bg-black/15" : "bg-surface hover:bg-surface-3")}
    >
      <FileGlyphBadge name={name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className={cn("block text-xs", mine ? "text-accent-fg/70" : "text-fg-subtle")}>{[formatBytes(file.size), fileGlyph(name) === "text" ? "" : name.split(".").pop()?.toUpperCase()].filter(Boolean).join(" · ") || "Datei"}</span>
      </span>
    </a>
  );
}

/** Bilder (Raster, Tippen öffnet die Vorschau) und Dateien (Tippen lädt herunter) einer Nachricht. */
export function MessageAttachments({ attachments, mine, onOpenImage, hasText }: { attachments: ChatAttachment[]; mine: boolean; onOpenImage: (indexInMessage: number) => void; hasText: boolean }) {
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.kind === "image");
  const files = attachments.filter((a) => a.kind === "file");
  return (
    <div className={cn("-mx-1.5 space-y-1", hasText ? "mb-1.5" : "-mt-0.5")}>
      {images.length > 0 && <ImageGrid images={images} onOpen={onOpenImage} />}
      {files.map((file, i) => <FileRow key={`${file.path}-${i}`} file={file} mine={mine} />)}
    </div>
  );
}

/** Alle Bilder des geöffneten Chats als Galerie (wie bei Messengern: durch den ganzen Verlauf wischen). `firstIndex` = Position des ersten Bilds je Nachricht. */
export function chatGallery(messages: ChatMessage[], nameOf: (m: ChatMessage) => string): { images: LightboxImage[]; firstIndex: Map<string, number> } {
  const images: LightboxImage[] = [];
  const firstIndex = new Map<string, number>();
  for (const m of messages) {
    if (m.kind === "system") continue;
    const own = messageAttachments(m).filter((a) => a.kind === "image");
    if (!own.length) continue;
    firstIndex.set(m.id, images.length);
    const when = m.createdAt ? new Date(m.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : m.time;
    for (const a of own) {
      images.push({
        src: a.path,
        alt: `Bild von ${nameOf(m)}`,
        caption: <><span className="font-medium text-white">{nameOf(m)}</span> · {when}{m.text ? <span className="mt-0.5 block text-white/70 [overflow-wrap:anywhere]">{m.text}</span> : null}</>,
        download: { href: downloadHref(a.path, true), name: a.name || undefined },
      });
    }
  }
  return { images, firstIndex };
}

/* ============================ Auswahl und Hochladen ============================ */

export interface PendingAttachment {
  key: string;
  name: string;
  size: number;
  kind: "image" | "file";
  /** Lokale Vorschau (Bilder). */
  preview?: string;
  status: "uploading" | "done" | "error";
  error?: string;
  attachment?: ChatAttachment;
}

const FALLBACK_CONFIG: UploadConfig = { maxBytes: 4 * 1024 * 1024, hdAllowed: false };
const HD_KEY = "go-upload-hd";
const readHd = () => { try { return localStorage.getItem(HD_KEY) === "1"; } catch { return false; } };

/**
 * Anhänge für eine Nachricht vorbereiten: wählen → (Bilder verkleinern) → hochladen, eins nach dem anderen.
 * Die Auswahl bleibt sichtbar, bis gesendet wird; Fehler lassen sich einzeln wiederholen oder entfernen.
 */
export function useAttachmentTray() {
  const svc = useServices();
  const toast = useToast();
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [config, setConfig] = useState<UploadConfig>(FALLBACK_CONFIG);
  const [hd, setHdState] = useState(readHd);
  const files = useRef(new Map<string, { file: File; kind: "image" | "file" }>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const configRef = useRef(config);
  configRef.current = config;
  const hdRef = useRef(hd);
  hdRef.current = hd;

  useEffect(() => {
    let alive = true;
    svc.media.config().then((c) => { if (alive) setConfig(c); }).catch(() => undefined);
    return () => { alive = false; };
  }, [svc]);
  useEffect(() => () => { for (const item of itemsRef.current) if (item.preview) URL.revokeObjectURL(item.preview); }, []);

  const patch = useCallback((key: string, change: Partial<PendingAttachment>) => setItems((cur) => cur.map((item) => (item.key === key ? { ...item, ...change } : item))), []);

  const upload = useCallback(async (key: string) => {
    const entry = files.current.get(key);
    if (!entry) return;
    patch(key, { status: "uploading", error: undefined });
    try {
      const limit = configRef.current.maxBytes;
      let result;
      if (entry.kind === "image") {
        const blob = await prepareImage(entry.file, { hd: hdRef.current && configRef.current.hdAllowed, maxBytes: Math.max(100_000, limit - 100_000) });
        result = await uploadWithRetry(svc, blob);
        patch(key, { status: "done", attachment: { path: result.path, kind: "image", name: result.name ?? "", size: result.size ?? blob.size, mime: result.contentType ?? blob.type } });
      } else {
        result = await uploadWithRetry(svc, entry.file, { kind: "file", name: entry.file.name });
        patch(key, { status: "done", attachment: { path: result.path, kind: result.kind ?? "file", name: result.name || entry.file.name, size: result.size ?? entry.file.size, mime: result.contentType ?? entry.file.type } });
      }
    } catch (error) {
      patch(key, { status: "error", error: sendErrorText(error) });
    }
  }, [svc, patch]);

  const enqueue = useCallback((key: string) => { queue.current = queue.current.then(() => upload(key)); }, [upload]);

  const add = useCallback((picked: File[], kind: "image" | "file") => {
    const free = MAX_ATTACHMENTS - itemsRef.current.length;
    if (picked.length > free) toast.push({ title: `Höchstens ${MAX_ATTACHMENTS} Anhänge pro Nachricht`, desc: free > 0 ? `Die ersten ${free} wurden übernommen.` : undefined, tone: "warning", icon: "AlertTriangle" });
    const take = picked.slice(0, Math.max(0, free));
    const added: PendingAttachment[] = take.map((file) => {
      const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      files.current.set(key, { file, kind });
      const problem = kind === "file" ? fileProblem(file, configRef.current.maxBytes) : null;
      return { key, name: file.name, size: file.size, kind, preview: kind === "image" ? URL.createObjectURL(file) : undefined, status: problem ? "error" : "uploading", error: problem ?? undefined };
    });
    if (!added.length) return;
    setItems((cur) => [...cur, ...added]);
    for (const item of added) if (item.status === "uploading") enqueue(item.key);
  }, [toast, enqueue]);

  const forget = (item: PendingAttachment) => { files.current.delete(item.key); if (item.preview) URL.revokeObjectURL(item.preview); };
  const remove = useCallback((key: string) => {
    setItems((cur) => { const gone = cur.find((i) => i.key === key); if (gone) forget(gone); return cur.filter((i) => i.key !== key); });
  }, []);
  /** Nach dem Senden: gesendete Anhänge entfernen, fehlerhafte bleiben zur Korrektur. */
  const clearSent = useCallback(() => {
    setItems((cur) => { cur.filter((i) => i.status === "done").forEach(forget); return cur.filter((i) => i.status !== "done"); });
  }, []);
  const retry = useCallback((key: string) => enqueue(key), [enqueue]);
  /** Alles verwerfen (z. B. beim Wechsel der Unterhaltung). */
  const reset = useCallback(() => {
    setItems((cur) => { cur.forEach(forget); return []; });
  }, []);
  const setHd = (value: boolean) => { setHdState(value); try { localStorage.setItem(HD_KEY, value ? "1" : "0"); } catch { /* privater Modus */ } };

  const ready = items.filter((i) => i.status === "done" && i.attachment).map((i) => i.attachment!);
  return { items, ready, busy: items.some((i) => i.status === "uploading"), hasError: items.some((i) => i.status === "error"), config, hd: hd && config.hdAllowed, setHd, add, remove, clearSent, retry, reset };
}

type Tray = ReturnType<typeof useAttachmentTray>;

/** Büroklammer: Foto oder Datei wählen (Mobil: Galerie/Kamera bzw. Dateiauswahl); bei großen Servern zusätzlich SD/HD. */
export function AttachMenu({ tray, disabled }: { tray: Tray; disabled?: boolean }) {
  const photos = useRef<HTMLInputElement>(null);
  const docs = useRef<HTMLInputElement>(null);
  const onChange = (kind: "image" | "file") => (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ""; // gleiche Datei erneut wählbar
    if (picked.length) tray.add(picked, kind);
  };
  return (
    <>
      <Popover
        side="top"
        align="start"
        label="Anhang hinzufügen"
        trigger={tray.busy ? <Spinner className="size-4" /> : <Paperclip className="size-5" />}
        triggerClassName={cn("grid size-10 shrink-0 place-items-center rounded-xl text-fg-muted transition hover:bg-surface-2", disabled && "pointer-events-none opacity-60")}
      >
        {(close) => (
          <div className="min-w-[220px]">
            <PopoverItem icon="Image" onClick={() => { close(); photos.current?.click(); }}>Foto</PopoverItem>
            <PopoverItem icon="Paperclip" onClick={() => { close(); docs.current?.click(); }}>Datei</PopoverItem>
            <p className="px-3 pb-1 pt-0.5 text-[11px] text-fg-subtle">{FILE_TYPES_HINT} · max. {formatBytes(tray.config.maxBytes)} · bis {MAX_ATTACHMENTS} Anhänge</p>
            {tray.config.hdAllowed && (
              <div role="group" aria-label="Bildqualität" className="mx-2 mb-1.5 mt-1 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-0.5 text-xs font-medium">
                {([false, true] as const).map((value) => (
                  <button key={String(value)} type="button" aria-pressed={tray.hd === value} onClick={() => tray.setHd(value)} className={cn("rounded-md px-2 py-1 transition", tray.hd === value ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg")}>
                    {value ? "HD" : "SD"}
                  </button>
                ))}
              </div>
            )}
            {tray.config.hdAllowed && <p className="px-3 pb-1.5 text-[11px] text-fg-subtle">{tray.hd ? "HD: bis 4096 px, größere Datei." : "SD: bis 1600 px, schnell und sparsam."}</p>}
          </div>
        )}
      </Popover>
      <input ref={photos} type="file" accept={ACCEPTED_IMAGE_TYPES} multiple className="hidden" data-testid="pick-photos" onChange={onChange("image")} />
      <input ref={docs} type="file" accept={ACCEPTED_FILE_TYPES} multiple className="hidden" data-testid="pick-files" onChange={onChange("file")} />
    </>
  );
}

/** Ausgewählte Anhänge über der Eingabezeile: Vorschau, Fortschritt, Fehler, Entfernen. */
export function PendingTray({ tray }: { tray: Tray }) {
  if (!tray.items.length) return null;
  return (
    <div data-testid="pending-tray" className="flex shrink-0 gap-2 overflow-x-auto border-t border-border px-3 pt-2.5" role="list" aria-label="Ausgewählte Anhänge">
      {tray.items.map((item) => (
        <div key={item.key} role="listitem" data-status={item.status} className={cn("relative shrink-0", item.kind === "file" ? "w-44" : "size-16")}>
          {item.kind === "image" ? (
            <span className="block size-16 overflow-hidden rounded-xl bg-surface-2">
              {item.preview && <img src={item.preview} alt={item.name} className={cn("size-full object-cover", item.status !== "done" && "opacity-60")} />}
            </span>
          ) : (
            <span className={cn("flex h-16 items-center gap-2 rounded-xl bg-surface-2 px-2", item.status === "error" && "ring-1 ring-danger/60")}>
              <FileGlyphBadge name={item.name} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{item.name}</span>
                <span title={item.error} className={cn("text-[11px] leading-tight", item.status === "error" ? "line-clamp-2 text-danger" : "block truncate text-fg-subtle")}>{item.status === "error" ? item.error : formatBytes(item.size)}</span>
              </span>
            </span>
          )}
          {item.status === "uploading" && <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/25" aria-label="Wird hochgeladen"><Spinner className="size-5 text-white" /></span>}
          {item.status === "error" && item.kind === "image" && (
            <span className="absolute inset-0 grid place-items-center rounded-xl bg-danger/70 p-1 text-center text-[10px] font-medium leading-tight text-white" title={item.error}>
              <button type="button" onClick={() => tray.retry(item.key)} className="grid place-items-center gap-0.5" aria-label="Erneut hochladen"><RotateCcw className="size-4" />Fehler</button>
            </span>
          )}
          {item.status === "error" && item.kind === "file" && !item.error?.startsWith("Dateityp") && !item.error?.startsWith("Zu groß") && !item.error?.startsWith("Die Datei") && (
            <button type="button" onClick={() => tray.retry(item.key)} className="absolute bottom-1 right-1 grid size-6 place-items-center rounded-md bg-surface text-fg-muted shadow" aria-label="Erneut hochladen"><RotateCcw className="size-3.5" /></button>
          )}
          <button type="button" onClick={() => tray.remove(item.key)} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-fg text-bg shadow" aria-label={`${item.name} entfernen`}><X className="size-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
