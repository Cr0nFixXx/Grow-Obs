import { useMemo, useState } from "react";
import { Field, Modal, Segmented, Select } from "@/components/ui";
import { dayDiff, formatDay } from "@/lib/grows";
import { resolveMedia } from "@/lib/media";
import type { Grow, GrowPhoto } from "@/types";

type Mode = "slider" | "side";

/** „Tag 12 · 03.10.2026“ (ohne Datum nur „Aufnahme“). */
const stamp = (p: GrowPhoto) => (p.date ? `Tag ${p.day ?? "–"} · ${formatDay(p.date)}` : "Aufnahme");
const optionLabel = (p: GrowPhoto, i: number) => `${stamp(p)}${p.caption ? ` · ${p.caption}` : ` · Foto ${i + 1}`}`;

/**
 * Foto-Vergleich (B-88): zwei Fotos eines Grows gegenüberstellen – mit Schieberegler (Vorher/Nachher) oder nebeneinander.
 * Der Regler ist ein echtes Bereichsfeld (Tastatur: Pfeiltasten, Bildschirmleser: Prozentwert).
 */
export function PhotoCompareModal({ grow, open, onClose }: { grow: Grow; open: boolean; onClose: () => void }) {
  const photos = grow.photos;
  const [beforeId, setBeforeId] = useState(photos[0]?.id ?? "");
  const [afterId, setAfterId] = useState(photos[photos.length - 1]?.id ?? "");
  const [mode, setMode] = useState<Mode>("slider");
  const [pos, setPos] = useState(50);
  const before = useMemo(() => photos.find((p) => p.id === beforeId) ?? photos[0], [photos, beforeId]);
  const after = useMemo(() => photos.find((p) => p.id === afterId) ?? photos[photos.length - 1], [photos, afterId]);
  if (!before || !after) return null;
  const between = before.date && after.date ? dayDiff(before.date, after.date) : null;

  return (
    <Modal open={open} onClose={onClose} title="Fotos vergleichen" size="xl">
      <div className="space-y-4" data-testid="photo-compare">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vorher">
            <Select value={before.id} onChange={(e) => setBeforeId(e.target.value)} aria-label="Foto „Vorher“ wählen" data-testid="compare-before">
              {photos.map((p, i) => <option key={p.id} value={p.id}>{optionLabel(p, i)}</option>)}
            </Select>
          </Field>
          <Field label="Nachher">
            <Select value={after.id} onChange={(e) => setAfterId(e.target.value)} aria-label="Foto „Nachher“ wählen" data-testid="compare-after">
              {photos.map((p, i) => <option key={p.id} value={p.id}>{optionLabel(p, i)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented<Mode> value={mode} onChange={setMode} options={[{ value: "slider", label: "Schieberegler" }, { value: "side", label: "Nebeneinander" }]} />
          <p className="text-xs text-fg-muted" data-testid="compare-between">
            {before.id === after.id ? "Wähle zwei verschiedene Fotos." : between === null ? "" : between === 0 ? "Am selben Tag aufgenommen." : `${between} ${between === 1 ? "Tag" : "Tage"} zwischen den Aufnahmen`}
          </p>
        </div>

        {mode === "slider" ? (
          <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-2xl bg-black focus-within:ring-2 focus-within:ring-accent" data-testid="compare-slider">
            <img src={resolveMedia(before.url)} alt={`Vorher: ${stamp(before)}`} className="absolute inset-0 size-full object-cover" draggable={false} />
            <img src={resolveMedia(after.url)} alt={`Nachher: ${stamp(after)}`} className="absolute inset-0 size-full object-cover" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} draggable={false} data-testid="compare-after-image" />
            <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">Vorher · {stamp(before)}</span>
            <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">Nachher · {stamp(after)}</span>
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,.6)]" style={{ left: `${pos}%` }}>
              <span className="absolute left-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-bold text-black shadow-lg" aria-hidden>↔</span>
            </div>
            <input
              type="range" min={0} max={100} step={1} value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              aria-label="Vergleichsregler: Anteil des Vorher-Fotos"
              aria-valuetext={`${pos} Prozent Vorher`}
              data-testid="compare-range"
              className="absolute inset-0 size-full cursor-ew-resize opacity-0"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3" data-testid="compare-side">
            {([["Vorher", before], ["Nachher", after]] as const).map(([label, p]) => (
              <figure key={label} className="space-y-1.5">
                <img src={resolveMedia(p.url)} alt={`${label}: ${stamp(p)}`} className="aspect-[3/4] w-full rounded-2xl object-cover" />
                <figcaption className="text-xs text-fg-muted"><strong className="text-fg">{label}</strong> · {stamp(p)}{p.caption ? ` · ${p.caption}` : ""}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
