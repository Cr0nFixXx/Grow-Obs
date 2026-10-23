"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { useBodyScrollLock, useFocusTrap } from "@/lib/hooks";
import { cn } from "@/utils/cn";
import { resolveMedia } from "@/lib/media";

/**
 * PDF-Vorschau im Chat (B-82): zeigt die Seiten als Bilder (pdf.js, wird erst beim Öffnen geladen). Die Bytes kommen über die API
 * (`?raw=1`, mit Login-Cookie) – ein Abruf über den Bucket-Link würde am fehlenden CORS scheitern. Nie als Seite gerendert, kein Skript.
 */
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDoc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

const MAX_ZOOM = 3;
const MIN_ZOOM = 1;
const ZOOM_STEP = 0.5;

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    return mod;
  });
  return pdfjsPromise;
}

/** Adresse der PDF-Bytes: eigene Medien über `?raw=1`, alles andere (Demo-Modus) unverändert. */
export const pdfSource = (path: string) => (path.startsWith("/media/") ? `${resolveMedia(path)}?raw=1` : path);

function PdfPage({ doc, number, width, zoom, onVisible }: { doc: PdfDoc; number: number; width: number; zoom: number; onVisible: (n: number) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.414);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { setSeen(true); onVisible(number); }
      }
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [number, onVisible]);

  useEffect(() => {
    if (!seen || !width) return;
    let cancelled = false;
    let task: { cancel(): void; promise: Promise<unknown> } | null = null;
    void (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const cssWidth = width * zoom;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Bildpunkte begrenzen (Speicher auf dem Handy): höchstens ca. 3000 px Breite.
      const scale = Math.min((cssWidth / base.width) * dpr, 3000 / base.width);
      const viewport = page.getViewport({ scale });
      const el = canvas.current;
      const ctx = el?.getContext("2d");
      if (!el || !ctx) return;
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      task = page.render({ canvasContext: ctx, viewport });
      await task.promise.catch(() => undefined);
    })().catch(() => undefined);
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, number, width, zoom, seen]);

  return (
    <div ref={holder} data-testid="pdf-page" data-page={number} className="mx-auto overflow-hidden rounded-sm bg-white shadow-lg" style={{ width: width * zoom, maxWidth: "none", aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvas} role="img" aria-label={`Seite ${number}`} className="block size-full" />
    </div>
  );
}

export function PdfViewer({ open, path, name, downloadUrl, onClose }: { open: boolean; path: string; name: string; downloadUrl: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  useBodyScrollLock(open);
  useFocusTrap(open, panelRef);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let loaded: PdfDoc | null = null;
    setState("loading"); setDoc(null); setZoom(1); setCurrent(1);
    void (async () => {
      try {
        const [pdfjs, response] = await Promise.all([loadPdfJs(), fetch(pdfSource(path), { credentials: "include" })]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = new Uint8Array(await response.arrayBuffer());
        loaded = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
        if (cancelled) { void loaded.destroy(); return; }
        setDoc(loaded); setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; void loaded?.destroy(); };
  }, [open, path]);

  // Seitenbreite = Breite des Fensters (abzüglich Rand); passt sich an Drehen/Größe an.
  useEffect(() => {
    const el = scrollRef.current;
    if (!open || !el) return;
    const measure = () => setWidth(Math.max(200, Math.floor(el.clientWidth - 24)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "+" || event.key === "=") setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      else if (event.key === "-") setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  const pages = doc?.numPages ?? 0;
  return createPortal(
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={`PDF-Vorschau: ${name}`} className="fixed inset-0 z-[110] flex flex-col bg-black/95 text-white">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          {pages > 0 && <div className="text-xs text-white/70" data-testid="pdf-pages">Seite {current} von {pages}</div>}
        </div>
        <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM} aria-label="Verkleinern" className="grid size-10 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-40"><Icon name="ZoomOut" size={20} /></button>
        <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM} aria-label="Vergrößern" className="grid size-10 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-40"><Icon name="ZoomIn" size={20} /></button>
        <a href={downloadUrl} download={name} target="_blank" rel="noopener noreferrer" aria-label="PDF herunterladen" className="grid size-10 place-items-center rounded-lg hover:bg-white/10"><Icon name="Download" size={20} /></a>
        <button type="button" onClick={onClose} aria-label="Vorschau schließen" className="grid size-10 place-items-center rounded-lg hover:bg-white/10"><Icon name="X" size={20} /></button>
      </div>
      <div ref={scrollRef} className={cn("min-h-0 flex-1 space-y-3 overflow-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]", state !== "ready" && "grid place-items-center")}>
        {state === "loading" && <p role="status" className="text-sm text-white/80">PDF wird geladen …</p>}
        {state === "error" && (
          <div role="alert" className="max-w-xs text-center text-sm">
            <p className="mb-3">Vorschau nicht möglich (Datei beschädigt, geschützt oder nicht abrufbar).</p>
            <a href={downloadUrl} download={name} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 font-medium hover:bg-white/25"><Icon name="Download" size={16} />Herunterladen</a>
          </div>
        )}
        {state === "ready" && doc && Array.from({ length: pages }, (_, i) => <PdfPage key={i + 1} doc={doc} number={i + 1} width={width} zoom={zoom} onVisible={setCurrent} />)}
      </div>
    </div>,
    document.body
  );
}
