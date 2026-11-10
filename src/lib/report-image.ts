import type { Grow } from "@/types";
import { growStrains, strainSummary } from "@/lib/grow-strains";
import { average, conditionLabel, formatDay, formatGrams } from "@/lib/grows";

/** Daten der Report-Grafik („Grow-Report als Bild“, B-90) – getrennt vom Zeichnen, damit sie testbar sind. */
export interface ReportImageModel {
  title: string;
  subtitle: string;
  metrics: { label: string; value: string }[];
  phases: { label: string; note: string; done: boolean; active: boolean }[];
  progress: number;
  climate: { temp: number[]; rh: number[]; labels: string[] };
  averages: { label: string; value: string }[];
  conclusion: string;
  footer: string;
}

const avgText = (values: (number | null)[], unit: string, digits: number) => {
  const avg = average(values);
  return avg === null ? "–" : `${avg.toLocaleString("de-DE", { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
};

type ReportGrow = Pick<Grow, "name" | "strain" | "strains" | "breeder" | "medium" | "startDate" | "day" | "totalDays" | "phase" | "condition" | "expectedYield" | "phases" | "progress" | "env" | "harvest">;

export function buildReportImageModel(g: ReportGrow, now = new Date()): ReportImageModel {
  const climate = [...g.env].filter((e) => e.temp !== null && e.rh !== null).sort((a, b) => a.day - b.day);
  return {
    title: "Grow-Report",
    subtitle: [g.name, strainSummary(growStrains(g).map((x) => x.name)), g.breeder && g.breeder !== "Unbekannt" ? g.breeder : "", g.medium].filter(Boolean).join(" · ") + ` · Start ${new Date(g.startDate).toLocaleDateString("de-DE")}`,
    metrics: [
      { label: "Dauer", value: `${g.day} Tage` },
      { label: "Zustand", value: conditionLabel[g.condition] },
      { label: "Erwartet", value: g.expectedYield || "–" },
      { label: "Phase", value: g.phase },
    ],
    phases: g.phases.map((p) => ({ label: p.label, note: p.startedOn ? `ab ${formatDay(p.startedOn)}` : "offen", done: !!p.done, active: !!p.active })),
    progress: Math.max(0, Math.min(100, g.progress)),
    climate: { temp: climate.map((e) => e.temp as number), rh: climate.map((e) => e.rh as number), labels: climate.map((e) => `T${e.day}`) },
    averages: [
      { label: "VPD Ø", value: avgText(g.env.map((e) => e.vpd), "kPa", 2) },
      { label: "EC Ø", value: avgText(g.env.map((e) => e.ec), "mS", 2) },
      { label: "pH Ø", value: avgText(g.env.map((e) => e.ph), "", 1) },
      { label: "Temperatur Ø", value: avgText(g.env.map((e) => e.temp), "°C", 1) },
    ],
    conclusion: `Stand: Tag ${g.day} von ${g.totalDays}, Phase ${g.phase}, Zustand ${conditionLabel[g.condition]}.${g.harvest ? ` Ernte: nass ${formatGrams(g.harvest.wetG)}, trocken ${formatGrams(g.harvest.dryG)}.` : ""}`,
    footer: `Grow|Obs · erstellt am ${now.toLocaleString("de-DE")}`,
  };
}

/** Dateiname: „cherry-run-report-2026-10-24.png“. */
export function reportImageName(name: string, today = new Date()): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "grow";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${slug}-report-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.png`;
}

const C = { bg: "#f6f7f2", card: "#ffffff", line: "#e2e6db", text: "#15241a", muted: "#6b7264", subtle: "#8a9082", accent: "#1c6930", info: "#2b7bb9", track: "#e8ebe2" };
const FONT = "-apple-system, 'Segoe UI', system-ui, sans-serif";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function linePath(ctx: CanvasRenderingContext2D, values: number[], x: number, y: number, w: number, h: number, color: string, dotShift = 0) {
  if (values.length === 0) return;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  values.forEach((v, i) => {
    const px = values.length === 1 ? x + w / 2 : x + (i / (values.length - 1)) * w;
    const py = y + h - ((v - min) / span) * h;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();
  // Ein einzelner Messwert ergibt keine Linie: als Punkt zeichnen.
  if (values.length === 1) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + w / 2 + dotShift, y + h / 2, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Zeichnet die Report-Grafik (1080 px breit, Hochkant) und liefert eine PNG-Datei. Läuft komplett im Browser. */
export function renderReportImage(model: ReportImageModel): Promise<Blob> {
  const W = 1080, PAD = 56, INNER = W - PAD * 2;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return Promise.reject(new Error("Dein Browser kann keine Bilder zeichnen."));
  measure.font = `400 26px ${FONT}`;
  const conclusionLines = wrap(measure, model.conclusion, INNER - 64);
  const H = 56 + 70 + 56 + 130 + 40 + 190 + 40 + (model.climate.temp.length > 0 ? 330 : 120) + 130 + 40 + (110 + conclusionLines.length * 38) + 110;
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Dein Browser kann keine Bilder zeichnen."));
  ctx.scale(scale, scale);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  let y = PAD;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.accent;
  ctx.font = `800 52px ${FONT}`;
  ctx.fillText(model.title, PAD, y + 44);
  ctx.fillStyle = C.muted;
  ctx.font = `400 24px ${FONT}`;
  const subLines = wrap(ctx, model.subtitle, INNER);
  subLines.slice(0, 2).forEach((l, i) => ctx.fillText(l, PAD, y + 84 + i * 32));
  y += 84 + Math.min(2, subLines.length) * 32 + 24;

  const card = (top: number, height: number) => { ctx.fillStyle = C.card; roundRect(ctx, PAD, top, INNER, height, 24); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke(); };
  const tiles = (items: { label: string; value: string }[], top: number, h: number, big: number) => {
    const gap = 16, tw = (INNER - gap * (items.length - 1)) / items.length;
    items.forEach((m, i) => {
      const x = PAD + i * (tw + gap);
      ctx.fillStyle = C.card; roundRect(ctx, x, top, tw, h, 20); ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke();
      ctx.fillStyle = C.subtle; ctx.font = `600 20px ${FONT}`; ctx.fillText(m.label, x + 22, top + 38);
      ctx.fillStyle = C.text; ctx.font = `700 ${big}px ${FONT}`;
      let text = m.value;
      while (ctx.measureText(text).width > tw - 44 && text.length > 3) text = text.slice(0, -2);
      ctx.fillText(text === m.value ? text : `${text}…`, x + 22, top + h - 26);
    });
  };

  tiles(model.metrics, y, 120, 30);
  y += 120 + 40;

  card(y, 190);
  ctx.fillStyle = C.muted; ctx.font = `700 22px ${FONT}`; ctx.fillText("PHASEN-VERLAUF", PAD + 32, y + 46);
  const n = Math.max(1, model.phases.length), lineX = PAD + 90, lineW = INNER - 180, lineY = y + 92;
  ctx.fillStyle = C.track; roundRect(ctx, lineX, lineY - 4, lineW, 8, 4); ctx.fill();
  ctx.fillStyle = C.accent; roundRect(ctx, lineX, lineY - 4, Math.max(8, (lineW * model.progress) / 100), 8, 4); ctx.fill();
  model.phases.forEach((p, i) => {
    const cx = n === 1 ? lineX + lineW / 2 : lineX + (i / (n - 1)) * lineW;
    ctx.fillStyle = p.done || p.active ? C.accent : C.track;
    ctx.beginPath(); ctx.arc(cx, lineY, p.active ? 17 : 13, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = p.done || p.active ? C.text : C.subtle; ctx.font = `600 21px ${FONT}`; ctx.fillText(p.label, cx, lineY + 52);
    ctx.fillStyle = C.subtle; ctx.font = `400 17px ${FONT}`; ctx.fillText(p.note, cx, lineY + 78);
    ctx.textAlign = "left";
  });
  y += 190 + 40;

  const chartH = model.climate.temp.length > 0 ? 330 : 120;
  card(y, chartH);
  ctx.fillStyle = C.muted; ctx.font = `700 22px ${FONT}`; ctx.fillText("UMWELT-AUSWERTUNG", PAD + 32, y + 46);
  if (model.climate.temp.length > 0) {
    const cx = PAD + 40, cw = INNER - 80, cy = y + 90, ch = 170;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx, cy + (ch / 3) * i); ctx.lineTo(cx + cw, cy + (ch / 3) * i); ctx.stroke(); }
    linePath(ctx, model.climate.temp, cx, cy, cw, ch, C.accent, -16);
    linePath(ctx, model.climate.rh, cx, cy, cw, ch, C.info, 16);
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = C.accent; ctx.fillText("● Temperatur", cx, y + chartH - 24);
    ctx.fillStyle = C.info; ctx.fillText("● Feuchte", cx + 190, y + chartH - 24);
    ctx.fillStyle = C.subtle; ctx.font = `400 18px ${FONT}`; ctx.textAlign = "right";
    ctx.fillText(`${model.climate.labels[0]} – ${model.climate.labels[model.climate.labels.length - 1]}`, cx + cw, y + chartH - 24);
    ctx.textAlign = "left";
  } else {
    ctx.fillStyle = C.muted; ctx.font = `400 24px ${FONT}`; ctx.fillText("Noch keine Messwerte erfasst.", PAD + 32, y + 92);
  }
  y += chartH + 24;
  tiles(model.averages, y, 106, 28);
  y += 106 + 40;

  const cH = 110 + conclusionLines.length * 38;
  card(y, cH);
  ctx.fillStyle = C.text; ctx.font = `700 30px ${FONT}`; ctx.fillText("Fazit", PAD + 32, y + 56);
  ctx.fillStyle = C.muted; ctx.font = `400 26px ${FONT}`;
  conclusionLines.forEach((l, i) => ctx.fillText(l, PAD + 32, y + 104 + i * 38));
  y += cH + 40;

  ctx.fillStyle = C.subtle; ctx.font = `400 20px ${FONT}`; ctx.fillText(model.footer, PAD, y + 4);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Das Bild konnte nicht erstellt werden."))), "image/png");
  });
}

/** Bild im Browser speichern. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
