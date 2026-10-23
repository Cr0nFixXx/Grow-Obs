import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-long-enough";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Öffnet die App und überspringt das Onboarding (erscheint nur beim ersten Start). */
export async function openAuth(page: Page) {
  await page.goto("/");
  await page.getByText("Überspringen").click();
  await expect(page.getByRole("heading", { name: /Willkommen zurück/ })).toBeVisible();
}

export async function register(page: Page, name: string, email: string) {
  await openAuth(page);
  await page.getByRole("button", { name: "Registrieren" }).first().click();
  await page.getByPlaceholder("z. B. max_grows").fill(name);
  await page.getByPlaceholder("du@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /AGB/ }).click();
  await page.getByRole("button", { name: "Konto erstellen" }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
}

/** Meldet einen bestehenden Nutzer über die Login-Seite an (frischer Browser-Kontext). */
export async function login(page: Page, email: string, password = PASSWORD) {
  await openAuth(page);
  await page.getByPlaceholder("du@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).last().click();
  await expect(page.getByRole("heading", { level: 1, name: /^Hallo,/ })).toBeVisible();
}

/** Öffnet Profil → Einstellungen (dort liegt „Sitzungen & Geräte“). */
export async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Profil öffnen" }).click();
  await page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();
  await expect(page.getByTestId("sessions-card")).toBeVisible();
}

/* ---------- Testdateien (werden zur Laufzeit erzeugt, keine Binärdateien im Repo) ---------- */

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

/** Einfarbiges PNG (gültig, mit Prüfsummen). */
export function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Gültiges PDF mit `pages` Seiten (je eine Zeile Text „Seite n“). */
export function simplePdf(pages: number): Buffer {
  const objects: string[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ");
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for (let i = 0; i < pages; i++) {
    const stream = `BT /F1 36 Tf 72 700 Td (Seite ${i + 1}) Tj ET`;
    objects[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objects[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objects.length; n++) out += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Legt die Testdateien an und liefert das Verzeichnis. */
export function makeTestFiles(): string {
  const dir = path.join(tmpdir(), "e2e-files");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "gruen.png"), solidPng(640, 480, [40, 160, 70]));
  writeFileSync(path.join(dir, "braun.png"), solidPng(640, 480, [120, 80, 40]));
  writeFileSync(path.join(dir, "Anbauplan Woche 3.pdf"), simplePdf(3));
  writeFileSync(path.join(dir, "setup.exe"), Buffer.from("MZ not allowed"));
  return dir;
}
