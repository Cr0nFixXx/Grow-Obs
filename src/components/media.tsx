import { useRef, useState, type ReactNode } from "react";
import { Smile } from "lucide-react";
import { cn } from "@/utils/cn";
import { useServices } from "@/data/DataContext";
import { useToast } from "@/components/Toast";
import { Popover, Spinner } from "@/components/ui";
import { ACCEPTED_IMAGE_TYPES, prepareImage } from "@/lib/media";
import { ApiError } from "@/lib/api";
import { sendErrorText } from "@/lib/chat-errors";

/** Verkleinern + hochladen; liefert die speicherbare Referenz (`/media/<id>` bzw. blob:-URL). */
export function useImageUpload() {
  const svc = useServices();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File): Promise<string | null> => {
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      try {
        return (await svc.media.upload(prepared)).path;
      } catch (error) {
        // Kurzer Serverfehler (z. B. Datenbank kurz ausgelastet): einmal erneut versuchen, bevor eine Meldung erscheint.
        if (!(error instanceof ApiError) || ![500, 502, 503].includes(error.status)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 800));
        return (await svc.media.upload(prepared)).path;
      }
    } catch (error) {
      toast.push({ title: "Upload fehlgeschlagen", desc: sendErrorText(error), tone: "danger", icon: "AlertTriangle" });
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

/** Button mit verstecktem Datei-Input (Kamera/Galerie auf Mobil). Ruft `onUploaded(path)` auf. */
export function ImagePickButton({
  onUploaded,
  children,
  className,
  label = "Foto hinzufügen",
  disabled,
}: {
  onUploaded: (path: string) => void | Promise<void>;
  children: ReactNode;
  className?: string;
  label?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy } = useImageUpload();
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} disabled={busy || disabled} aria-label={label} aria-busy={busy} className={cn("disabled:opacity-60", className)}>
        {busy ? <Spinner className="size-4" /> : children}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // gleiche Datei erneut wählbar
          if (!file) return;
          const path = await upload(file);
          if (path) await onUploaded(path);
        }}
      />
    </>
  );
}

const EMOJIS = ["🌱", "🌿", "🍃", "🌳", "🌸", "🌼", "💚", "🔥", "💧", "☀️", "🌙", "⚡", "🧪", "🔬", "🪴", "🫙", "✂️", "📈", "📉", "🎉", "💪", "🙌", "👍", "👀", "🤔", "😅", "😂", "😍", "😎", "🤩", "🙏", "❤️", "✅", "⚠️", "🐛", "🍋", "🍇", "🍓", "🫐", "🍯"];

/** Kompakte Emoji-Auswahl (Grow-Kontext). Popover → auf Mobil passt es in den Composer. */
export function EmojiPicker({ onPick, className, side = "bottom", align = "start" }: { onPick: (emoji: string) => void; className?: string; side?: "bottom" | "top"; align?: "start" | "end" }) {
  return (
    <Popover
      align={align}
      side={side}
      label="Emoji einfügen"
      trigger={<Smile className="size-5" />}
      triggerClassName={cn("grid size-10 shrink-0 place-items-center rounded-xl text-fg-muted transition hover:bg-surface-2", className)}
    >
      {(close) => (
        <div className="grid w-64 grid-cols-8 gap-0.5 p-1.5" role="listbox" aria-label="Emoji auswählen">
          {EMOJIS.map((emoji) => (
            <button key={emoji} type="button" role="option" aria-selected="false" onClick={() => { onPick(emoji); close(); }} className="grid size-8 place-items-center rounded-lg text-lg transition hover:bg-surface-2">
              {emoji}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** Fügt Text an der Cursorposition eines Eingabefelds ein (Fallback: anhängen). */
export function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement | null, value: string, insert: string): { next: string; caret: number } {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  return { next: value.slice(0, start) + insert + value.slice(end), caret: start + insert.length };
}
